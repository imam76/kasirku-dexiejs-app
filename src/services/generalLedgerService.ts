import { db } from '@/lib/db';
import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';
import type {
  AccountNormalBalance,
  AccountType,
  ChartOfAccount,
  InventoryAccountingPolicy,
  JournalEntry,
  JournalEntryLine,
  JournalSourceType,
  PaymentMethod,
  SalesDocument,
  SalesReturn,
  SalesReturnItem,
  StockPurchase,
  Transaction,
  TransactionItem,
} from '@/types';
import { getAccountNormalBalance } from '@/utils/chartOfAccounts/getAccountNormalBalance';

const JOURNAL_TOLERANCE = 0.01;

const SOURCE_EVENTS = {
  POS_SALE_POSTED: 'POS_SALE_POSTED',
  STOCK_PURCHASE_POSTED: 'STOCK_PURCHASE_POSTED',
  SALES_INVOICE_ISSUED: 'SALES_INVOICE_ISSUED',
  SALES_INVOICE_PAYMENT_POSTED: 'SALES_INVOICE_PAYMENT_POSTED',
  SALES_RETURN_ISSUED: 'SALES_RETURN_ISSUED',
  OPENING_BALANCE_POSTED: 'OPENING_BALANCE_POSTED',
  MANUAL_JOURNAL_POSTED: 'MANUAL_JOURNAL_POSTED',
} as const;

type JournalSourceEvent = typeof SOURCE_EVENTS[keyof typeof SOURCE_EVENTS];

interface AccountCandidate {
  ids: string[];
  codes: string[];
}

interface JournalLineDraft {
  account: ChartOfAccount;
  debit?: number;
  credit?: number;
  description?: string;
  department_id?: string;
  project_id?: string;
}

interface NormalizedJournalLine {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  debit: number;
  credit: number;
  description?: string;
  department_id?: string;
  project_id?: string;
}

interface PostJournalEntryInput {
  source_type: JournalSourceType;
  source_id?: string;
  source_number?: string;
  source_event?: JournalSourceEvent | string;
  entry_date: string;
  description: string;
  lines: JournalLineDraft[];
}

interface OpeningBalanceLineInput {
  account_id: string;
  debit?: number;
  credit?: number;
  description?: string;
}

interface CreateJournalEntryInput {
  source_type: JournalSourceType;
  source_id?: string;
  source_number?: string;
  source_event?: string;
  entry_date: string;
  description: string;
  reversed_entry_id?: string;
  lines: NormalizedJournalLine[];
}

export interface JournalEntryWithLines extends JournalEntry {
  lines: JournalEntryLine[];
}

export interface GeneralLedgerReportFilters {
  startDate?: string;
  endDate?: string;
  accountId?: string;
}

export interface TrialBalanceRow {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  normal_balance: AccountNormalBalance;
  debit_movement: number;
  credit_movement: number;
  debit_balance: number;
  credit_balance: number;
}

export interface TrialBalanceReport {
  rows: TrialBalanceRow[];
  total_debit: number;
  total_credit: number;
  is_balanced: boolean;
}

export interface IncomeStatementReport {
  revenue: number;
  contra_revenue: number;
  net_revenue: number;
  expense: number;
  net_income: number;
}

export interface BalanceSheetReport {
  assets: number;
  liabilities: number;
  equity: number;
  current_period_income: number;
  total_liabilities_and_equity: number;
  difference: number;
  is_balanced: boolean;
}

const ACCOUNT_CANDIDATES = {
  cash: { ids: ['cash'], codes: ['1010'] },
  bank: { ids: ['bank'], codes: ['1020'] },
  accountsReceivable: { ids: ['accounts-receivable', 'template-accounts-receivable'], codes: ['1100'] },
  inventory: { ids: ['inventory', 'template-inventory'], codes: ['1200'] },
  outputTax: { ids: ['output-tax', 'template-tax-payable'], codes: ['2100'] },
  salesPos: { ids: ['sales-pos', 'template-sales-pos'], codes: ['4000', '4010'] },
  salesInvoiceRevenue: { ids: ['sales-invoice-revenue', 'template-sales-invoice-revenue'], codes: ['4010', '4020'] },
  salesReturn: { ids: ['sales-return', 'template-sales-return'], codes: ['4020', '4100'] },
  cogs: { ids: ['cogs', 'template-cogs'], codes: ['5000', '5010'] },
} satisfies Record<string, AccountCandidate>;

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const amountOrZero = (value: number | undefined) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? roundCurrency(amount) : 0;
};

const getGeneralLedgerSetting = async () => {
  return db.generalLedgerSetting.get('default');
};

const isDateBeforeCutoff = (entryDate: string, cutoffDate?: string) => {
  if (!cutoffDate) return true;
  return entryDate.slice(0, 10) < cutoffDate.slice(0, 10);
};

const isGeneralLedgerPostingEnabled = async (entryDate?: string) => {
  const module = await db.enabledModules.get('GENERAL_LEDGER');
  const setting = await getGeneralLedgerSetting();
  if (!module?.is_enabled || !setting?.is_ready || !setting.cutoff_date) return false;
  if (setting.inventory_policy !== 'PERPETUAL_INVENTORY') return false;
  if (entryDate && isDateBeforeCutoff(entryDate, setting.cutoff_date)) return false;
  return true;
};

const getInventoryPolicy = async (): Promise<InventoryAccountingPolicy> => {
  const setting = await getGeneralLedgerSetting();
  return setting?.inventory_policy ?? 'CASH_FLOW_ONLY';
};

const getCashAccountCandidate = (paymentMethod?: PaymentMethod) => {
  return paymentMethod === 'NON_TUNAI'
    ? ACCOUNT_CANDIDATES.bank
    : ACCOUNT_CANDIDATES.cash;
};

export const getCashOrBankAccountForPayment = async (
  paymentMethod?: PaymentMethod,
  cashAccountId?: string,
) => {
  const accounts = await db.chartOfAccounts.toArray();

  if (cashAccountId) {
    const account = accounts.find((item) => item.id === cashAccountId);
    if (!account) {
      throw new Error('Akun kas/bank pembayaran tidak ditemukan.');
    }
    if (!account.is_active || !account.is_postable || account.type !== 'ASSET') {
      throw new Error('Akun pembayaran harus bertipe aset, aktif, dan postable.');
    }

    return account;
  }

  return getPostableAccount(accounts, getCashAccountCandidate(paymentMethod), 'Kas/Bank');
};

const getPostableAccount = (
  accounts: ChartOfAccount[],
  candidate: AccountCandidate,
  label: string,
) => {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const accountByCode = new Map(accounts.map((account) => [account.code, account]));
  const account = candidate.ids
    .map((id) => accountById.get(id))
    .find(Boolean) ?? candidate.codes.map((code) => accountByCode.get(code)).find(Boolean);

  if (!account) {
    throw new Error(`Akun ${label} belum tersedia di Daftar Akun.`);
  }

  if (!account.is_active || !account.is_postable) {
    throw new Error(`Akun ${account.code} - ${account.name} harus aktif dan postable untuk posting jurnal.`);
  }

  return account;
};

const createDebitLine = (
  account: ChartOfAccount,
  amount: number,
  description?: string,
  departmentId?: string,
  projectId?: string,
): JournalLineDraft | undefined => {
  const debit = amountOrZero(amount);
  if (debit <= 0) return undefined;

  return {
    account,
    debit,
    credit: 0,
    description,
    department_id: departmentId,
    project_id: projectId,
  };
};

const createCreditLine = (
  account: ChartOfAccount,
  amount: number,
  description?: string,
  departmentId?: string,
  projectId?: string,
): JournalLineDraft | undefined => {
  const credit = amountOrZero(amount);
  if (credit <= 0) return undefined;

  return {
    account,
    debit: 0,
    credit,
    description,
    department_id: departmentId,
    project_id: projectId,
  };
};

const normalizeLines = (lines: JournalLineDraft[]): NormalizedJournalLine[] => lines
  .filter((line): line is JournalLineDraft => Boolean(line))
  .map((line) => {
    const debit = amountOrZero(line.debit);
    const credit = amountOrZero(line.credit);

    if (debit > 0 && credit > 0) {
      throw new Error('Satu line jurnal tidak boleh berisi debit dan kredit sekaligus.');
    }

    if (debit <= 0 && credit <= 0) {
      throw new Error('Line jurnal harus memiliki nilai debit atau kredit.');
    }

    if (!line.account.is_active || !line.account.is_postable) {
      throw new Error(`Akun ${line.account.code} - ${line.account.name} harus aktif dan postable.`);
    }

    return {
      account_id: line.account.id,
      account_code: line.account.code,
      account_name: line.account.name,
      account_type: line.account.type,
      debit,
      credit,
      description: line.description,
      department_id: line.department_id,
      project_id: line.project_id,
    };
  });

const assertBalancedLines = (lines: NormalizedJournalLine[]) => {
  const totalDebit = roundCurrency(lines.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = roundCurrency(lines.reduce((sum, line) => sum + line.credit, 0));

  if (lines.length < 2) {
    throw new Error('Jurnal harus memiliki minimal dua line.');
  }

  if (Math.abs(totalDebit - totalCredit) > JOURNAL_TOLERANCE) {
    throw new Error(`Jurnal tidak balance. Debit ${totalDebit}, kredit ${totalCredit}.`);
  }

  return { totalDebit, totalCredit };
};

const createJournalEntryNumber = async (entryDate: string) => {
  const dateKey = entryDate.slice(0, 10).replace(/-/g, '');
  const prefix = `JRN-${dateKey}-`;
  const count = await db.journalEntries.where('entry_number').startsWith(prefix).count();
  return `${prefix}${String(count + 1).padStart(4, '0')}`;
};

const getPostedJournalEntryForSource = async (
  sourceType: JournalSourceType,
  sourceId?: string,
  sourceEvent?: string,
) => {
  if (!sourceId) return undefined;

  return db.journalEntries
    .where('source_type')
    .equals(sourceType)
    .filter((entry) => (
      entry.status === 'POSTED' &&
      entry.source_id === sourceId &&
      entry.source_event === sourceEvent
    ))
    .first();
};

const getJournalSignature = (lines: Array<Pick<NormalizedJournalLine | JournalEntryLine, 'account_id' | 'debit' | 'credit'>>) => {
  return lines
    .map((line) => `${line.account_id}:${roundCurrency(line.debit)}:${roundCurrency(line.credit)}`)
    .sort()
    .join('|');
};

const createPostedJournalEntry = async ({
  source_type,
  source_id,
  source_number,
  source_event,
  entry_date,
  description,
  reversed_entry_id,
  lines,
}: CreateJournalEntryInput): Promise<JournalEntry> => {
  const { totalDebit, totalCredit } = assertBalancedLines(lines);
  const now = new Date().toISOString();
  const entryId = crypto.randomUUID();
  const entry: JournalEntry = {
    id: entryId,
    entry_number: await createJournalEntryNumber(entry_date),
    entry_date,
    status: 'POSTED',
    source_type,
    source_id,
    source_number,
    source_event,
    description,
    total_debit: totalDebit,
    total_credit: totalCredit,
    posted_at: now,
    reversed_entry_id,
    created_at: now,
    updated_at: now,
  };
  const entryLines: JournalEntryLine[] = lines.map((line) => ({
    id: crypto.randomUUID(),
    journal_entry_id: entryId,
    ...line,
    created_at: now,
  }));

  await db.journalEntries.add(entry);
  await db.journalEntryLines.bulkAdd(entryLines);

  return entry;
};

const reverseJournalEntry = async (
  entry: JournalEntry,
  reason: string,
  entryDate: string,
) => {
  const existingReversal = await db.journalEntries
    .where('reversed_entry_id')
    .equals(entry.id)
    .filter((candidate) => candidate.status === 'POSTED')
    .first();

  if (existingReversal) {
    return existingReversal;
  }

  const lines = await db.journalEntryLines
    .where('journal_entry_id')
    .equals(entry.id)
    .toArray();
  const reversalLines: NormalizedJournalLine[] = lines.map((line) => ({
    account_id: line.account_id,
    account_code: line.account_code,
    account_name: line.account_name,
    account_type: line.account_type,
    debit: line.credit,
    credit: line.debit,
    description: reason,
    department_id: line.department_id,
    project_id: line.project_id,
  }));
  const reversal = await createPostedJournalEntry({
    source_type: entry.source_type,
    source_id: entry.source_id,
    source_number: entry.source_number,
    source_event: `${entry.source_event ?? 'SOURCE'}:REVERSAL`,
    entry_date: entryDate,
    description: reason,
    reversed_entry_id: entry.id,
    lines: reversalLines,
  });

  await db.journalEntries.update(entry.id, {
    status: 'REVERSED',
    reversed_entry_id: reversal.id,
    updated_at: new Date().toISOString(),
  });

  return reversal;
};

export const postBalancedJournalEntry = async (input: PostJournalEntryInput) => {
  if (!await isGeneralLedgerPostingEnabled(input.entry_date)) {
    return undefined;
  }

  return db.transaction('rw', [db.journalEntries, db.journalEntryLines], async () => {
    const lines = normalizeLines(input.lines);
    const existingEntry = await getPostedJournalEntryForSource(input.source_type, input.source_id, input.source_event);

    if (existingEntry) {
      const existingLines = await db.journalEntryLines
        .where('journal_entry_id')
        .equals(existingEntry.id)
        .toArray();

      if (getJournalSignature(existingLines) === getJournalSignature(lines)) {
        return existingEntry;
      }

      await reverseJournalEntry(
        existingEntry,
        `Pembalikan jurnal ${existingEntry.entry_number} karena source berubah.`,
        input.entry_date,
      );
    }

    return createPostedJournalEntry({ ...input, lines });
  });
};

export const reverseJournalEntriesForSource = async ({
  source_type,
  source_id,
  source_event,
  reason,
  entry_date,
}: {
  source_type: JournalSourceType;
  source_id: string;
  source_event?: string;
  reason: string;
  entry_date?: string;
}) => {
  const reversalDate = entry_date ?? new Date().toISOString();
  if (!await isGeneralLedgerPostingEnabled(reversalDate)) {
    return [];
  }

  const entries = await db.journalEntries
    .where('source_type')
    .equals(source_type)
    .filter((entry) => (
      entry.status === 'POSTED' &&
      entry.source_id === source_id &&
      !entry.source_event?.endsWith(':REVERSAL') &&
      (!source_event || entry.source_event === source_event)
    ))
    .toArray();
  const reversals: JournalEntry[] = [];

  await db.transaction('rw', [db.journalEntries, db.journalEntryLines], async () => {
    for (const entry of entries) {
      reversals.push(await reverseJournalEntry(entry, reason, reversalDate));
    }
  });

  return reversals;
};

export const postOpeningBalanceJournal = async ({
  cutoff_date,
  inventory_policy,
  lines,
}: {
  cutoff_date: string;
  inventory_policy: InventoryAccountingPolicy;
  lines: OpeningBalanceLineInput[];
}) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');

  const normalizedCutoffDate = cutoff_date.includes('T')
    ? cutoff_date
    : `${cutoff_date}T00:00:00.000`;
  const now = new Date().toISOString();
  let createdEntry: JournalEntry | undefined;

  await db.transaction('rw', [
    db.chartOfAccounts,
    db.generalLedgerSetting,
    db.journalEntries,
    db.journalEntryLines,
    db.activityLogs,
  ], async () => {
    const setting = await db.generalLedgerSetting.get('default');
    const existingOpeningEntry = setting?.opening_balance_journal_id
      ? await db.journalEntries.get(setting.opening_balance_journal_id)
      : undefined;

    if (existingOpeningEntry?.status === 'POSTED') {
      throw new Error('Opening balance sudah posted. Cutoff tidak bisa diubah tanpa reset ledger eksplisit.');
    }

    const accounts = await db.chartOfAccounts.toArray();
    const accountById = new Map(accounts.map((account) => [account.id, account]));
    const draftLines = lines
      .map((line) => {
        const account = accountById.get(line.account_id);
        if (!account) {
          throw new Error('Akun opening balance tidak ditemukan.');
        }

        return {
          account,
          debit: line.debit,
          credit: line.credit,
          description: line.description,
        };
      })
      .filter((line) => amountOrZero(line.debit) > 0 || amountOrZero(line.credit) > 0);
    const normalizedLines = normalizeLines(draftLines);

    createdEntry = await createPostedJournalEntry({
      source_type: 'OPENING_BALANCE',
      source_id: 'default',
      source_number: 'Opening Balance',
      source_event: SOURCE_EVENTS.OPENING_BALANCE_POSTED,
      entry_date: normalizedCutoffDate,
      description: `Opening balance General Ledger per ${normalizedCutoffDate.slice(0, 10)}`,
      lines: normalizedLines,
    });

    await db.generalLedgerSetting.put({
      id: 'default',
      is_ready: true,
      cutoff_date: normalizedCutoffDate,
      inventory_policy,
      opening_balance_journal_id: createdEntry.id,
      activated_at: setting?.activated_at,
      created_at: setting?.created_at ?? now,
      updated_at: now,
    });

    await writeActivityLog({
      user: currentUser,
      action: 'GENERAL_LEDGER_OPENING_BALANCE_POSTED',
      entity: 'generalLedgerSetting',
      entity_id: 'default',
      description: `${currentUser?.name ?? 'User'} posting opening balance General Ledger per ${normalizedCutoffDate.slice(0, 10)}.`,
    });
  });

  return createdEntry;
};

export const postManualJournal = async ({
  entry_date,
  description,
  lines,
}: {
  entry_date: string;
  description: string;
  lines: OpeningBalanceLineInput[];
}) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'JOURNAL_MANAGE');

  const accounts = await db.chartOfAccounts.toArray();
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  return postBalancedJournalEntry({
    source_type: 'MANUAL_JOURNAL',
    source_id: crypto.randomUUID(),
    source_event: SOURCE_EVENTS.MANUAL_JOURNAL_POSTED,
    entry_date,
    description,
    lines: lines.map((line) => {
      const account = accountById.get(line.account_id);
      if (!account) {
        throw new Error('Akun jurnal manual tidak ditemukan.');
      }

      return {
        account,
        debit: line.debit,
        credit: line.credit,
        description: line.description,
      };
    }),
  });
};

const getTransactionItemsCost = (items: TransactionItem[]) => {
  return roundCurrency(items.reduce((sum, item) => {
    return sum + amountOrZero(item.purchase_price) * amountOrZero(item.quantity);
  }, 0));
};

const getSalesReturnRestockCost = (items: SalesReturnItem[]) => {
  return roundCurrency(items.reduce((sum, item) => {
    return sum + amountOrZero(item.purchase_price) * amountOrZero(item.restock_quantity);
  }, 0));
};

export const postPosSaleJournal = async (transaction: Transaction, items: TransactionItem[] = []) => {
  if (transaction.status === 'VOIDED') return undefined;
  if (!await isGeneralLedgerPostingEnabled(transaction.created_at)) return undefined;

  const accounts = await db.chartOfAccounts.toArray();
  const cashAccount = getPostableAccount(accounts, getCashAccountCandidate(transaction.payment_method), 'Kas/Bank');
  const salesAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.salesPos, 'Penjualan POS');
  const amount = amountOrZero(transaction.total_amount);
  const lines: JournalLineDraft[] = [
    createDebitLine(cashAccount, amount, 'Penerimaan kas/bank dari POS'),
    createCreditLine(salesAccount, amount, 'Pendapatan penjualan POS'),
  ].filter((line): line is JournalLineDraft => Boolean(line));

  if (amount <= 0) return undefined;

  if (await getInventoryPolicy() === 'PERPETUAL_INVENTORY') {
    const cogsAmount = getTransactionItemsCost(items);
    if (cogsAmount > 0) {
      const cogsAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.cogs, 'HPP');
      const inventoryAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.inventory, 'Persediaan Barang');
      const cogsLine = createDebitLine(cogsAccount, cogsAmount, 'HPP penjualan POS');
      const inventoryLine = createCreditLine(inventoryAccount, cogsAmount, 'Persediaan keluar karena penjualan POS');
      if (cogsLine) lines.push(cogsLine);
      if (inventoryLine) lines.push(inventoryLine);
    }
  }

  return postBalancedJournalEntry({
    source_type: 'POS_TRANSACTION',
    source_id: transaction.id,
    source_number: transaction.transaction_number,
    source_event: SOURCE_EVENTS.POS_SALE_POSTED,
    entry_date: transaction.created_at,
    description: `Penjualan POS ${transaction.transaction_number}`,
    lines,
  });
};

export const reversePosSaleJournal = async (transaction: Transaction, reason: string) => {
  return reverseJournalEntriesForSource({
    source_type: 'POS_TRANSACTION',
    source_id: transaction.id,
    source_event: SOURCE_EVENTS.POS_SALE_POSTED,
    reason,
  });
};

export const postStockPurchaseJournal = async (purchase: StockPurchase) => {
  if (!await isGeneralLedgerPostingEnabled(purchase.created_at)) return undefined;

  const accounts = await db.chartOfAccounts.toArray();
  const inventoryAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.inventory, 'Persediaan Barang');
  const cashAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.cash, 'Kas');
  const amount = amountOrZero(purchase.total_cost);

  if (amount <= 0) return undefined;

  return postBalancedJournalEntry({
    source_type: 'STOCK_PURCHASE',
    source_id: purchase.id,
    source_number: purchase.product_name,
    source_event: SOURCE_EVENTS.STOCK_PURCHASE_POSTED,
    entry_date: purchase.created_at,
    description: `Pembelian stok ${purchase.product_name}`,
    lines: [
      createDebitLine(inventoryAccount, amount, 'Persediaan bertambah dari pembelian stok'),
      createCreditLine(cashAccount, amount, 'Pembayaran pembelian stok'),
    ].filter((line): line is JournalLineDraft => Boolean(line)),
  });
};

export const postSalesInvoiceIssuedJournal = async (document: SalesDocument) => {
  if (document.type !== 'SALES_INVOICE' || document.status === 'VOIDED') return undefined;
  const entryDate = document.issued_at ?? document.document_date;
  if (!await isGeneralLedgerPostingEnabled(entryDate)) return undefined;

  const accounts = await db.chartOfAccounts.toArray();
  const receivableAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.accountsReceivable, 'Piutang Usaha');
  const revenueAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.salesInvoiceRevenue, 'Pendapatan Sales Invoice');
  const totalAmount = amountOrZero(document.total_amount);
  const taxAmount = amountOrZero(document.tax_amount);
  const revenueAmount = roundCurrency(totalAmount - taxAmount);
  const lines: JournalLineDraft[] = [
    createDebitLine(receivableAccount, totalAmount, 'Piutang dari sales invoice', document.department_id, document.project_id),
    createCreditLine(revenueAccount, revenueAmount, 'Pendapatan sales invoice', document.department_id, document.project_id),
  ].filter((line): line is JournalLineDraft => Boolean(line));

  if (taxAmount > 0) {
    const taxAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.outputTax, 'Pajak Keluaran');
    const taxLine = createCreditLine(taxAccount, taxAmount, 'Pajak keluaran sales invoice', document.department_id, document.project_id);
    if (taxLine) lines.push(taxLine);
  }

  if (totalAmount <= 0) return undefined;

  return postBalancedJournalEntry({
    source_type: 'SALES_INVOICE',
    source_id: document.id,
    source_number: document.document_number,
    source_event: SOURCE_EVENTS.SALES_INVOICE_ISSUED,
    entry_date: entryDate,
    description: `Sales invoice ${document.document_number} diterbitkan`,
    lines,
  });
};

export const postSalesInvoicePaymentJournal = async (document: SalesDocument) => {
  if (document.type !== 'SALES_INVOICE' || document.status === 'VOIDED') return undefined;
  const entryDate = document.paid_at ?? new Date().toISOString();
  if (!await isGeneralLedgerPostingEnabled(entryDate)) return undefined;

  const amount = amountOrZero(document.paid_amount);
  if (amount <= 0) {
    return reverseJournalEntriesForSource({
      source_type: 'SALES_INVOICE_PAYMENT',
      source_id: document.id,
      source_event: SOURCE_EVENTS.SALES_INVOICE_PAYMENT_POSTED,
      reason: `Pembalikan jurnal pembayaran invoice ${document.document_number}`,
    });
  }

  const accounts = await db.chartOfAccounts.toArray();
  const cashAccount = await getCashOrBankAccountForPayment(document.payment_method, document.cash_account_id);
  const receivableAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.accountsReceivable, 'Piutang Usaha');

  return postBalancedJournalEntry({
    source_type: 'SALES_INVOICE_PAYMENT',
    source_id: document.id,
    source_number: document.document_number,
    source_event: SOURCE_EVENTS.SALES_INVOICE_PAYMENT_POSTED,
    entry_date: entryDate,
    description: `Pembayaran invoice ${document.document_number}`,
    lines: [
      createDebitLine(cashAccount, amount, 'Kas diterima dari pembayaran invoice', document.department_id, document.project_id),
      createCreditLine(receivableAccount, amount, 'Pelunasan piutang sales invoice', document.department_id, document.project_id),
    ].filter((line): line is JournalLineDraft => Boolean(line)),
  });
};

export const reverseSalesInvoiceJournal = async (document: SalesDocument, reason: string) => {
  return reverseJournalEntriesForSource({
    source_type: 'SALES_INVOICE',
    source_id: document.id,
    source_event: SOURCE_EVENTS.SALES_INVOICE_ISSUED,
    reason,
  });
};

export const postSalesReturnIssuedJournal = async (salesReturn: SalesReturn, items: SalesReturnItem[] = []) => {
  if (salesReturn.status === 'VOIDED' || salesReturn.resolution === 'NO_FINANCE') return undefined;
  const entryDate = salesReturn.issued_at ?? salesReturn.document_date;
  if (!await isGeneralLedgerPostingEnabled(entryDate)) return undefined;

  const totalAmount = amountOrZero(
    salesReturn.resolution === 'REFUND'
      ? salesReturn.refund_amount
      : salesReturn.credit_amount,
  );
  if (totalAmount <= 0) return undefined;

  const accounts = await db.chartOfAccounts.toArray();
  const salesReturnAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.salesReturn, 'Retur Penjualan');
  const creditAccount = salesReturn.resolution === 'REFUND'
    ? getPostableAccount(accounts, ACCOUNT_CANDIDATES.cash, 'Kas')
    : getPostableAccount(accounts, ACCOUNT_CANDIDATES.accountsReceivable, 'Piutang Usaha');
  const taxAmount = Math.min(amountOrZero(salesReturn.tax_amount), totalAmount);
  const returnAmountBeforeTax = roundCurrency(totalAmount - taxAmount);
  const lines: JournalLineDraft[] = [
    createDebitLine(salesReturnAccount, returnAmountBeforeTax, 'Retur penjualan'),
  ].filter((line): line is JournalLineDraft => Boolean(line));

  if (taxAmount > 0) {
    const taxAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.outputTax, 'Pajak Keluaran');
    const taxLine = createDebitLine(taxAccount, taxAmount, 'Koreksi pajak keluaran retur penjualan');
    if (taxLine) lines.push(taxLine);
  }

  const creditLine = createCreditLine(
    creditAccount,
    totalAmount,
    salesReturn.resolution === 'REFUND' ? 'Kas keluar untuk refund retur' : 'Credit note mengurangi piutang',
  );
  if (creditLine) lines.push(creditLine);

  if (await getInventoryPolicy() === 'PERPETUAL_INVENTORY') {
    const restockCost = getSalesReturnRestockCost(items);
    if (restockCost > 0) {
      const inventoryAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.inventory, 'Persediaan Barang');
      const cogsAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.cogs, 'HPP');
      const inventoryLine = createDebitLine(inventoryAccount, restockCost, 'Persediaan kembali dari retur');
      const cogsLine = createCreditLine(cogsAccount, restockCost, 'Pembalikan HPP dari retur');
      if (inventoryLine) lines.push(inventoryLine);
      if (cogsLine) lines.push(cogsLine);
    }
  }

  return postBalancedJournalEntry({
    source_type: 'SALES_RETURN',
    source_id: salesReturn.id,
    source_number: salesReturn.return_number,
    source_event: SOURCE_EVENTS.SALES_RETURN_ISSUED,
    entry_date: entryDate,
    description: `Retur penjualan ${salesReturn.return_number}`,
    lines,
  });
};

export const reverseSalesReturnJournal = async (salesReturn: SalesReturn, reason: string) => {
  return reverseJournalEntriesForSource({
    source_type: 'SALES_RETURN',
    source_id: salesReturn.id,
    source_event: SOURCE_EVENTS.SALES_RETURN_ISSUED,
    reason,
  });
};

const normalizeFilterDate = (value?: string, endOfDay = false) => {
  if (!value) return undefined;
  if (value.includes('T')) return value;
  return `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`;
};

const entryMatchesFilters = (entry: JournalEntry, filters: GeneralLedgerReportFilters) => {
  const start = normalizeFilterDate(filters.startDate);
  const end = normalizeFilterDate(filters.endDate, true);
  return (!start || entry.entry_date >= start) && (!end || entry.entry_date <= end);
};

export const getJournalEntriesWithLines = async (
  filters: GeneralLedgerReportFilters = {},
): Promise<JournalEntryWithLines[]> => {
  const entries = (await db.journalEntries.orderBy('entry_date').reverse().toArray())
    .filter((entry) => entryMatchesFilters(entry, filters));
  const entryIds = new Set(entries.map((entry) => entry.id));
  const lines = (await db.journalEntryLines.toArray())
    .filter((line) => entryIds.has(line.journal_entry_id))
    .filter((line) => !filters.accountId || line.account_id === filters.accountId);
  const lineByEntryId = lines.reduce<Record<string, JournalEntryLine[]>>((acc, line) => {
    acc[line.journal_entry_id] = acc[line.journal_entry_id] ?? [];
    acc[line.journal_entry_id].push(line);
    return acc;
  }, {});

  return entries
    .map((entry) => ({
      ...entry,
      lines: lineByEntryId[entry.id] ?? [],
    }))
    .filter((entry) => !filters.accountId || entry.lines.length > 0);
};

const getPostedReportLines = async (filters: GeneralLedgerReportFilters = {}) => {
  const entries = await getJournalEntriesWithLines(filters);
  return entries
    .filter((entry) => entry.status === 'POSTED')
    .flatMap((entry) => entry.lines.map((line) => ({ entry, line })));
};

const getAccountBalance = (
  debit: number,
  credit: number,
  normalBalance: AccountNormalBalance,
) => normalBalance === 'DEBIT'
  ? roundCurrency(debit - credit)
  : roundCurrency(credit - debit);

export const getTrialBalanceReport = async (
  filters: GeneralLedgerReportFilters = {},
): Promise<TrialBalanceReport> => {
  const [accounts, reportLines] = await Promise.all([
    db.chartOfAccounts.orderBy('code').toArray(),
    getPostedReportLines(filters),
  ]);
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const movementByAccountId = new Map<string, {
    debit: number;
    credit: number;
    line: JournalEntryLine;
  }>();

  reportLines.forEach(({ line }) => {
    const current = movementByAccountId.get(line.account_id) ?? { debit: 0, credit: 0, line };
    current.debit += line.debit;
    current.credit += line.credit;
    movementByAccountId.set(line.account_id, current);
  });

  const rows = Array.from(movementByAccountId.entries())
    .map(([accountId, movement]) => {
      const account = accountById.get(accountId);
      const normalBalance = account?.normal_balance ?? getAccountNormalBalance(movement.line.account_type);
      const endingBalance = getAccountBalance(movement.debit, movement.credit, normalBalance);
      const isNormalDebit = normalBalance === 'DEBIT';

      return {
        account_id: accountId,
        account_code: account?.code ?? movement.line.account_code,
        account_name: account?.name ?? movement.line.account_name,
        account_type: account?.type ?? movement.line.account_type,
        normal_balance: normalBalance,
        debit_movement: roundCurrency(movement.debit),
        credit_movement: roundCurrency(movement.credit),
        debit_balance: endingBalance >= 0 && isNormalDebit
          ? endingBalance
          : endingBalance < 0 && !isNormalDebit
            ? Math.abs(endingBalance)
            : 0,
        credit_balance: endingBalance >= 0 && !isNormalDebit
          ? endingBalance
          : endingBalance < 0 && isNormalDebit
            ? Math.abs(endingBalance)
            : 0,
      };
    })
    .sort((left, right) => left.account_code.localeCompare(right.account_code));
  const totalDebit = roundCurrency(rows.reduce((sum, row) => sum + row.debit_balance, 0));
  const totalCredit = roundCurrency(rows.reduce((sum, row) => sum + row.credit_balance, 0));

  return {
    rows,
    total_debit: totalDebit,
    total_credit: totalCredit,
    is_balanced: Math.abs(totalDebit - totalCredit) <= JOURNAL_TOLERANCE,
  };
};

export const getIncomeStatementReport = async (
  filters: GeneralLedgerReportFilters = {},
): Promise<IncomeStatementReport> => {
  const reportLines = await getPostedReportLines(filters);
  const totals = reportLines.reduce((acc, { line }) => {
    const normalBalance = getAccountNormalBalance(line.account_type);
    const balance = getAccountBalance(line.debit, line.credit, normalBalance);

    if (line.account_type === 'REVENUE') {
      acc.revenue += balance;
    } else if (line.account_type === 'CONTRA_REVENUE') {
      acc.contra_revenue += balance;
    } else if (line.account_type === 'EXPENSE') {
      acc.expense += balance;
    }

    return acc;
  }, { revenue: 0, contra_revenue: 0, expense: 0 });
  const revenue = roundCurrency(totals.revenue);
  const contraRevenue = roundCurrency(totals.contra_revenue);
  const expense = roundCurrency(totals.expense);
  const netRevenue = roundCurrency(revenue - contraRevenue);

  return {
    revenue,
    contra_revenue: contraRevenue,
    net_revenue: netRevenue,
    expense,
    net_income: roundCurrency(netRevenue - expense),
  };
};

export const getBalanceSheetReport = async (
  filters: GeneralLedgerReportFilters = {},
): Promise<BalanceSheetReport> => {
  const [trialBalance, incomeStatement] = await Promise.all([
    getTrialBalanceReport(filters),
    getIncomeStatementReport(filters),
  ]);
  const totals = trialBalance.rows.reduce((acc, row) => {
    const balance = row.debit_balance > 0 ? row.debit_balance : row.credit_balance;

    if (row.account_type === 'ASSET') {
      acc.assets += row.debit_balance - row.credit_balance;
    } else if (row.account_type === 'LIABILITY') {
      acc.liabilities += balance;
    } else if (row.account_type === 'EQUITY') {
      acc.equity += balance;
    }

    return acc;
  }, { assets: 0, liabilities: 0, equity: 0 });
  const assets = roundCurrency(totals.assets);
  const liabilities = roundCurrency(totals.liabilities);
  const equity = roundCurrency(totals.equity);
  const currentPeriodIncome = roundCurrency(incomeStatement.net_income);
  const totalLiabilitiesAndEquity = roundCurrency(liabilities + equity + currentPeriodIncome);
  const difference = roundCurrency(assets - totalLiabilitiesAndEquity);

  return {
    assets,
    liabilities,
    equity,
    current_period_income: currentPeriodIncome,
    total_liabilities_and_equity: totalLiabilitiesAndEquity,
    difference,
    is_balanced: Math.abs(difference) <= JOURNAL_TOLERANCE,
  };
};
