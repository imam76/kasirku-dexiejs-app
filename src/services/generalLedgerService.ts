import { db } from '@/lib/db';
import { FINANCE_CATEGORIES } from '@/constants/finance';
import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';
import { enqueueGeneralLedgerSettingSync } from '@/services/syncQueueService';
import type {
  AccountNormalBalance,
  AccountType,
  AuthUser,
  CashBankReconciliation,
  ChartOfAccount,
  CooperativeLoan,
  CooperativeLoanPayment,
  CooperativeSavingTransaction,
  EmployeeCashAdvance,
  FinanceTransaction,
  GeneralLedgerSetting,
  InventoryAccountingPolicy,
  JournalEntry,
  JournalEntryLine,
  JournalSourceType,
  OpeningBalanceBatch,
  OpeningBalanceLine,
  PaymentMethod,
  PosTransactionPayment,
  PayrollRun,
  ProductionOrder,
  ProductionOrderCost,
  ProductionOrderItem,
  PurchaseCostReconciliation,
  PurchaseDocument,
  PurchaseInvoicePayment,
  SalesDocument,
  SalesInvoicePayment,
  SalesOverpaymentSettlement,
  SalesOverpaymentSettlementAllocation,
  SalesReturn,
  SalesReturnItem,
  StockPurchase,
  Transaction,
  TransactionItem,
} from '@/types';
import {
  scheduleJournalEntryBundleSync,
  withPendingJournalEntrySync,
  withUpdatedJournalEntrySync,
} from '@/services/journalEntrySyncService';
import { getAccountNormalBalance } from '@/utils/chartOfAccounts/getAccountNormalBalance';
import {
  getSalesInvoicePaymentAllocatedAmount,
  getSalesInvoicePaymentOverpaymentAmount,
} from '@/utils/accountsReceivable/paymentAmounts';

const JOURNAL_TOLERANCE = 0.01;

const SOURCE_EVENTS = {
  POS_SALE_POSTED: 'POS_SALE_POSTED',
  STOCK_PURCHASE_POSTED: 'STOCK_PURCHASE_POSTED',
  SALES_INVOICE_ISSUED: 'SALES_INVOICE_ISSUED',
  SALES_INVOICE_PAYMENT_POSTED: 'SALES_INVOICE_PAYMENT_POSTED',
  SALES_INVOICE_PAYMENT_VOIDED: 'SALES_INVOICE_PAYMENT_VOIDED',
  SALES_OVERPAYMENT_ALLOCATED: 'SALES_OVERPAYMENT_ALLOCATED',
  SALES_OVERPAYMENT_REFUNDED: 'SALES_OVERPAYMENT_REFUNDED',
  SALES_RETURN_ISSUED: 'SALES_RETURN_ISSUED',
  PURCHASE_INVOICE_ISSUED: 'PURCHASE_INVOICE_ISSUED',
  PURCHASE_RETURN_ISSUED: 'PURCHASE_RETURN_ISSUED',
  PURCHASE_INVOICE_PAYMENT_POSTED: 'PURCHASE_INVOICE_PAYMENT_POSTED',
  CASH_BANK_TRANSFER_POSTED: 'CASH_BANK_TRANSFER_POSTED',
  CASH_BANK_RECONCILIATION_ADJUSTMENT_POSTED: 'CASH_BANK_RECONCILIATION_ADJUSTMENT_POSTED',
  PURCHASE_COST_RECONCILIATION_POSTED: 'PURCHASE_COST_RECONCILIATION_POSTED',
  PAYROLL_RUN_PAID: 'PAYROLL_RUN_PAID',
  EMPLOYEE_CASH_ADVANCE_DISBURSED: 'EMPLOYEE_CASH_ADVANCE_DISBURSED',
  COOPERATIVE_SAVING_DEPOSIT_POSTED: 'COOPERATIVE_SAVING_DEPOSIT_POSTED',
  COOPERATIVE_SAVING_WITHDRAWAL_POSTED: 'COOPERATIVE_SAVING_WITHDRAWAL_POSTED',
  COOPERATIVE_SAVING_INTEREST_PAID: 'COOPERATIVE_SAVING_INTEREST_PAID',
  COOPERATIVE_SAVING_OPENING_BALANCE_POSTED: 'COOPERATIVE_SAVING_OPENING_BALANCE_POSTED',
  COOPERATIVE_LOAN_DISBURSED: 'COOPERATIVE_LOAN_DISBURSED',
  COOPERATIVE_LOAN_OPENING_BALANCE_POSTED: 'COOPERATIVE_LOAN_OPENING_BALANCE_POSTED',
  COOPERATIVE_LOAN_PAYMENT_POSTED: 'COOPERATIVE_LOAN_PAYMENT_POSTED',
  COOPERATIVE_IPTW_PAID: 'COOPERATIVE_IPTW_PAID',
  PRODUCTION_ORDER_POSTED: 'PRODUCTION_ORDER_POSTED',
  OPENING_BALANCE_POSTED: 'OPENING_BALANCE_POSTED',
  OPENING_RECEIVABLE_PAYMENT_POSTED: 'OPENING_RECEIVABLE_PAYMENT_POSTED',
  OPENING_PAYABLE_PAYMENT_POSTED: 'OPENING_PAYABLE_PAYMENT_POSTED',
  MANUAL_JOURNAL_POSTED: 'MANUAL_JOURNAL_POSTED',
  YEAR_END_CLOSING_POSTED: 'YEAR_END_CLOSING_POSTED',
  YEAR_END_CLOSING_REVERSED: 'YEAR_END_CLOSING_REVERSED',
} as const;

type JournalSourceEvent = typeof SOURCE_EVENTS[keyof typeof SOURCE_EVENTS];

interface AccountCandidate {
  ids: string[];
  codes: string[];
}

export interface JournalLineDraft {
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

export interface PostJournalEntryInput {
  source_type: JournalSourceType;
  source_id?: string;
  source_number?: string;
  source_event?: JournalSourceEvent | string;
  entry_date: string;
  description: string;
  lines: JournalLineDraft[];
  actor?: Pick<AuthUser, 'id' | 'name'> | null;
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
  actor?: Pick<AuthUser, 'id' | 'name'> | null;
}

export interface JournalEntryWithLines extends JournalEntry {
  lines: JournalEntryLine[];
}

export interface GeneralLedgerReportFilters {
  startDate?: string;
  endDate?: string;
  accountId?: string;
  departmentId?: string;
  contactId?: string;
  currencyCode?: string;
  sourceTypes?: JournalSourceType[];
  sourceEvents?: string[];
  /**
   * Sertakan jurnal penutup (`CLOSING_JOURNAL`) dalam hasil report.
   * Default report ledger efektif menyertakan closing journal. Laba rugi dan
   * preview closing harus mengirim `false` agar close/reversal tidak bocor ke P/L.
   */
  includeClosingEntries?: boolean;
}

export interface TrialBalanceRow {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  normal_balance: AccountNormalBalance;
  opening_balance: number;
  debit_movement: number;
  credit_movement: number;
  ending_balance: number;
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
  cost_of_revenue: number;
  gross_profit: number;
  operating_expense: number;
  expense: number;
  net_income: number;
  sections: IncomeStatementSection[];
}

export type IncomeStatementSectionKey =
  | 'REVENUE'
  | 'CONTRA_REVENUE'
  | 'COST_OF_REVENUE'
  | 'OPERATING_EXPENSE';

export interface IncomeStatementAccountRow {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  amount: number;
}

export interface IncomeStatementSection {
  key: IncomeStatementSectionKey;
  total: number;
  rows: IncomeStatementAccountRow[];
}

export interface BalanceSheetReport {
  assets: number;
  liabilities: number;
  equity: number;
  current_period_income: number;
  total_liabilities_and_equity: number;
  difference: number;
  is_balanced: boolean;
  sections: BalanceSheetSection[];
}

export type BalanceSheetSectionKey = 'ASSET' | 'LIABILITY' | 'EQUITY';

export type BalanceSheetRowType = 'section' | 'account' | 'current_income';

export interface BalanceSheetTreeRow {
  id: string;
  row_type: BalanceSheetRowType;
  account_id?: string;
  account_code?: string;
  account_name: string;
  account_type?: AccountType;
  normal_balance?: AccountNormalBalance;
  amount: number;
  level: number;
  is_postable?: boolean;
  children?: BalanceSheetTreeRow[];
}

export interface BalanceSheetSection {
  key: BalanceSheetSectionKey;
  total: number;
  rows: BalanceSheetTreeRow[];
}

const ACCOUNT_CANDIDATES = {
  cash: { ids: ['cash'], codes: ['1010'] },
  bank: { ids: ['bank'], codes: ['1020'] },
  accountsReceivable: { ids: ['accounts-receivable', 'template-accounts-receivable'], codes: ['1100'] },
  customerCredit: { ids: ['customer-credit', 'advance-received', 'template-advance-received'], codes: ['2220', '2210'] },
  accountsPayable: { ids: ['accounts-payable', 'template-accounts-payable'], codes: ['2000', '2010'] },
  inventory: { ids: ['inventory', 'template-inventory'], codes: ['1200'] },
  salesPos: { ids: ['sales-pos', 'template-sales-pos'], codes: ['4000', '4010'] },
  salesInvoiceRevenue: { ids: ['sales-invoice-revenue', 'template-sales-invoice-revenue'], codes: ['4010', '4020'] },
  salesReturn: { ids: ['sales-return', 'template-sales-return'], codes: ['4020', '4100'] },
  salesDiscount: { ids: ['sales-discount', 'template-sales-discount'], codes: ['4030', '4110'] },
  cooperativeMemberSavings: { ids: ['cooperative-member-savings'], codes: ['2300'] },
  cooperativeMemberSavingsPokok: { ids: ['template-member-savings-pokok'], codes: ['2310'] },
  cooperativeMemberSavingsWajib: { ids: ['template-member-savings-wajib'], codes: ['2320'] },
  cooperativeMemberSavingsSukarela: { ids: ['template-member-savings-sukarela'], codes: ['2330'] },
  cooperativeLoanReceivable: { ids: ['cooperative-loan-receivable'], codes: ['1120'] },
  cooperativeLoanInterestIncome: { ids: ['cooperative-loan-interest-income'], codes: ['4040'] },
  cooperativeLoanPenaltyIncome: { ids: ['cooperative-loan-penalty-income'], codes: ['4050'] },
  cooperativeLoanAdminIncome: { ids: ['cooperative-loan-admin-income', 'template-loan-admin-income'], codes: ['4060'] },
  cooperativeOpeningBalanceEquity: {
    ids: [
      'owner-capital',
      'retained-earning',
      'shu-belum-dibagikan',
      'template-retained-earning',
      'simpanan-pokok-modal',
    ],
    codes: ['3000', '3100', '3010'],
  },
  cooperativeIptwExpense: { ids: ['cooperative-iptw-expense', 'template-cooperative-iptw-expense'], codes: ['6090'] },
  cooperativeSavingInterestExpense: {
    ids: ['cooperative-saving-interest-expense', 'template-cooperative-saving-interest-expense'],
    codes: ['6095'],
  },
  otherIncome: { ids: ['other-income', 'other-service-income'], codes: ['4900', '4090', '4060'] },
  employeeCashAdvanceReceivable: { ids: ['employee-cash-advance-receivable'], codes: ['1130'] },
  salaryExpense: { ids: ['salary-expense', 'template-salary-expense'], codes: ['6110', '6010'] },
  otherExpense: { ids: ['other-expense', 'template-other-expense'], codes: ['6900'] },
  cogs: { ids: ['cogs', 'template-cogs'], codes: ['5000', '5010'] },
  retainedEarnings: {
    ids: ['retained-earning', 'shu-belum-dibagikan', 'template-retained-earning'],
    codes: ['3100'],
  },
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

export const getGeneralLedgerCutoffDate = async () => {
  const setting = await getGeneralLedgerSetting();
  return setting?.is_ready ? setting.cutoff_date : undefined;
};

export const isBeforeGeneralLedgerCutoff = async (entryDate?: string) => {
  if (!entryDate) return false;
  const cutoffDate = await getGeneralLedgerCutoffDate();
  return Boolean(cutoffDate && entryDate.slice(0, 10) < cutoffDate.slice(0, 10));
};

const toDateOnly = (value: string) => value.slice(0, 10);

const isDateWithinPeriod = (
  entryDate: string,
  period: { start_date: string; end_date: string },
) => {
  const date = toDateOnly(entryDate);
  return date >= toDateOnly(period.start_date) && date <= toDateOnly(period.end_date);
};

/**
 * Cari periode akuntansi (belum dihapus) yang mencakup tanggal jurnal.
 * Periode bersifat overlay opsional: jika belum ada periode yang cocok, posting
 * mengikuti aturan cutoff seperti biasa.
 */
export const getAccountingPeriodForDate = async (entryDate: string) => {
  const periods = await db.accountingPeriods.toArray();
  return periods
    .filter((period) => !period.deleted_at && isDateWithinPeriod(entryDate, period))
    .sort((a, b) => (a.start_date < b.start_date ? 1 : -1))[0];
};

/**
 * Periode dianggap "postable" bila tidak ada periode yang cocok atau periodenya
 * masih berstatus OPEN. Periode LOCKED/CLOSED menolak posting operasional.
 */
export const isAccountingPeriodPostable = async (entryDate: string) => {
  const period = await getAccountingPeriodForDate(entryDate);
  if (!period) return true;
  return period.status === 'OPEN';
};

/**
 * Guard eksplisit untuk posting yang butuh error message jelas (mis. jurnal
 * manual). Melempar bila tanggal berada di periode LOCKED atau CLOSED.
 */
export const assertAccountingPeriodOpen = async (entryDate: string) => {
  const period = await getAccountingPeriodForDate(entryDate);
  if (!period || period.status === 'OPEN') return;

  const statusLabel = period.status === 'CLOSED' ? 'sudah ditutup (CLOSED)' : 'terkunci (LOCKED)';
  throw new Error(
    `Periode "${period.name}" ${statusLabel}. Transaksi bertanggal ${toDateOnly(entryDate)} tidak dapat diposting. Gunakan jurnal penyesuaian di periode terbuka atau buka ulang periode.`,
  );
};

export const isGeneralLedgerPostingEnabled = async (entryDate?: string) => {
  const module = await db.enabledModules.get('GENERAL_LEDGER');
  const setting = await getGeneralLedgerSetting();
  if (!module?.is_enabled || !setting?.is_ready || !setting.cutoff_date) return false;
  if (setting.inventory_policy !== 'PERPETUAL_INVENTORY') return false;
  if (entryDate && isDateBeforeCutoff(entryDate, setting.cutoff_date)) return false;
  if (entryDate && !(await isAccountingPeriodPostable(entryDate))) return false;
  return true;
};

/**
 * Guard untuk jurnal nonkas. Berbeda dari guard transaksi persediaan, guard ini
 * sengaja tidak bergantung pada inventory_policy dan mewajibkan periode bulanan.
 */
export const isNonCashGeneralLedgerPostingEnabled = async (entryDate: string) => {
  const module = await db.enabledModules.get('GENERAL_LEDGER');
  const setting = await getGeneralLedgerSetting();
  if (!module?.is_enabled || !setting?.is_ready || !setting.cutoff_date) return false;
  if (isDateBeforeCutoff(entryDate, setting.cutoff_date)) return false;
  const period = await getAccountingPeriodForDate(entryDate);
  return Boolean(period && period.period_type === 'MONTHLY' && period.status === 'OPEN');
};

export const assertNonCashGeneralLedgerPostingEnabled = async (entryDate: string) => {
  if (!await isNonCashGeneralLedgerPostingEnabled(entryDate)) {
    throw new Error('Periode belum dapat diposting karena General Ledger belum siap. Pastikan module aktif, cutoff valid, dan periode bulanan berstatus OPEN.');
  }
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

const getPostableAccountBySnapshot = (
  accounts: ChartOfAccount[],
  snapshot: {
    tax_account_id?: string;
    tax_account_code?: string;
    tax_account_name?: string;
  },
  label: string,
) => {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const accountByCode = new Map(accounts.map((account) => [account.code, account]));
  const account = snapshot.tax_account_id
    ? accountById.get(snapshot.tax_account_id)
    : snapshot.tax_account_code
      ? accountByCode.get(snapshot.tax_account_code)
      : undefined;

  if (!account) {
    throw new Error(`${label} belum diatur di master tax.`);
  }

  if (!account.is_active || !account.is_postable) {
    throw new Error(`Akun ${account.code} - ${account.name} harus aktif dan postable untuk posting pajak.`);
  }

  return account;
};

const hasTaxAccountSnapshot = (document: Pick<SalesDocument | PurchaseDocument | SalesReturn, 'tax_account_id' | 'tax_account_code'>) => (
  Boolean(document.tax_account_id || document.tax_account_code)
);

const getSalesTaxAccount = (
  accounts: ChartOfAccount[],
  document: Pick<SalesDocument | PurchaseDocument | SalesReturn, 'tax_flow' | 'tax_account_id' | 'tax_account_code' | 'tax_account_name' | 'tax_code' | 'tax_name'>,
) => {
  if (document.tax_flow === 'WITHHOLDING') {
    throw new Error('Sales invoice belum mendukung pajak potong. Gunakan pajak additive seperti PPN/PPnBM.');
  }

  return getPostableAccountBySnapshot(accounts, document, 'Akun pajak penjualan');
};

const getPurchaseTaxAccount = (
  accounts: ChartOfAccount[],
  document: Pick<PurchaseDocument, 'tax_flow' | 'tax_account_id' | 'tax_account_code' | 'tax_account_name' | 'tax_code' | 'tax_name'>,
) => {
  return getPostableAccountBySnapshot(accounts, document, 'Akun pajak pembelian/potongan');
};

const tryGetPostableAccount = (
  accounts: ChartOfAccount[],
  candidate: AccountCandidate,
) => {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const accountByCode = new Map(accounts.map((account) => [account.code, account]));
  const account = candidate.ids
    .map((id) => accountById.get(id))
    .find(Boolean) ?? candidate.codes.map((code) => accountByCode.get(code)).find(Boolean);

  if (!account || !account.is_active || !account.is_postable) {
    return undefined;
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

const createSignedLine = (
  account: ChartOfAccount,
  signedAmount: number,
  debitDescription: string,
  creditDescription: string,
): JournalLineDraft | undefined => {
  const amount = amountOrZero(Math.abs(signedAmount));
  if (amount <= 0) return undefined;

  return signedAmount > 0
    ? createDebitLine(account, amount, debitDescription)
    : createCreditLine(account, amount, creditDescription);
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

const getJournalSignature = (lines: Array<Pick<NormalizedJournalLine | JournalEntryLine, 'account_id' | 'debit' | 'credit' | 'department_id' | 'project_id'>>) => {
  return lines
    .map((line) => `${line.account_id}:${roundCurrency(line.debit)}:${roundCurrency(line.credit)}:${line.department_id ?? ''}:${line.project_id ?? ''}`)
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
  actor,
}: CreateJournalEntryInput): Promise<JournalEntry> => {
  const { totalDebit, totalCredit } = assertBalancedLines(lines);
  const now = new Date().toISOString();
  const entryId = crypto.randomUUID();
  const entry: JournalEntry = withPendingJournalEntrySync({
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
  }, actor, now);
  const entryLines: JournalEntryLine[] = lines.map((line) => ({
    id: crypto.randomUUID(),
    journal_entry_id: entryId,
    ...line,
    created_at: now,
  }));

  await db.journalEntries.add(entry);
  await db.journalEntryLines.bulkAdd(entryLines);
  scheduleJournalEntryBundleSync(entry.id, 'create');

  return entry;
};

const reverseJournalEntry = async (
  entry: JournalEntry,
  reason: string,
  entryDate: string,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
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
    actor,
  });

  const updatedEntry = withUpdatedJournalEntrySync({
    ...entry,
    status: 'REVERSED',
    reversed_entry_id: reversal.id,
  }, actor);
  await db.journalEntries.put(updatedEntry);
  scheduleJournalEntryBundleSync(updatedEntry.id, 'update');

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
        input.actor,
      );
    }

    return createPostedJournalEntry({ ...input, lines });
  });
};

/**
 * Memposting jurnal operasional nonkas secara idempotent. Source yang sudah ada
 * hanya dikembalikan jika signature-nya sama; perbedaan selalu dianggap konflik
 * agar caller dapat membatalkan transaksi tanpa reversal implisit.
 */
export const postNonCashBalancedJournalEntry = async (input: PostJournalEntryInput) => {
  await assertNonCashGeneralLedgerPostingEnabled(input.entry_date);

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
      throw new Error('Jurnal sumber sudah ada dengan signature berbeda.');
    }

    return createPostedJournalEntry({ ...input, lines });
  });
};

export const reverseNonCashJournalEntry = async ({
  entryId,
  reason,
  entryDate,
  sourceEvent,
  actor,
}: {
  entryId: string;
  reason: string;
  entryDate: string;
  sourceEvent: string;
  actor?: Pick<AuthUser, 'id' | 'name'> | null;
}) => {
  await assertNonCashGeneralLedgerPostingEnabled(entryDate);

  return db.transaction('rw', [db.journalEntries, db.journalEntryLines], async () => {
    const entry = await db.journalEntries.get(entryId);
    if (!entry) throw new Error('Jurnal yang akan dibalik tidak ditemukan.');

    const existing = await getPostedJournalEntryForSource(entry.source_type, entry.source_id, sourceEvent);
    if (existing) return existing;

    const originalLines = await db.journalEntryLines.where('journal_entry_id').equals(entry.id).toArray();
    const reversal = await createPostedJournalEntry({
      source_type: entry.source_type,
      source_id: entry.source_id,
      source_number: entry.source_number,
      source_event: sourceEvent,
      entry_date: entryDate,
      description: reason,
      reversed_entry_id: entry.id,
      lines: originalLines.map((line) => ({
        account_id: line.account_id,
        account_code: line.account_code,
        account_name: line.account_name,
        account_type: line.account_type,
        debit: line.credit,
        credit: line.debit,
        description: reason,
        department_id: line.department_id,
        project_id: line.project_id,
      })),
      actor,
    });
    const updatedEntry = withUpdatedJournalEntrySync({
      ...entry,
      status: 'REVERSED',
      reversed_entry_id: reversal.id,
    }, actor);
    await db.journalEntries.put(updatedEntry);
    scheduleJournalEntryBundleSync(updatedEntry.id, 'update');
    return reversal;
  });
};

export const reverseJournalEntriesForSource = async ({
  source_type,
  source_id,
  source_event,
  reason,
  entry_date,
  actor,
}: {
  source_type: JournalSourceType;
  source_id: string;
  source_event?: string;
  reason: string;
  entry_date?: string;
  actor?: Pick<AuthUser, 'id' | 'name'> | null;
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
      reversals.push(await reverseJournalEntry(entry, reason, reversalDate, actor));
    }
  });

  return reversals;
};

const getOpeningBalanceJournalDate = async (fallbackDate: string) => {
  const setting = await getGeneralLedgerSetting();
  if (!setting?.is_ready || !setting.cutoff_date) return undefined;
  return setting.cutoff_date || fallbackDate;
};

export const postOpeningBalanceSourceJournal = async ({
  source_id,
  source_number,
  source_event,
  entry_date,
  description,
  lines,
  actor,
}: {
  source_id: string;
  source_number?: string;
  source_event: JournalSourceEvent | string;
  entry_date: string;
  description: string;
  lines: JournalLineDraft[];
  actor?: Pick<AuthUser, 'id' | 'name'> | null;
}) => {
  const normalizedLines = normalizeLines(lines);
  const existingEntry = await getPostedJournalEntryForSource('OPENING_BALANCE', source_id, source_event);

  if (existingEntry) {
    const existingLines = await db.journalEntryLines
      .where('journal_entry_id')
      .equals(existingEntry.id)
      .toArray();

    if (getJournalSignature(existingLines) === getJournalSignature(normalizedLines)) {
      return existingEntry;
    }

    await reverseJournalEntry(
      existingEntry,
      `Pembalikan jurnal ${existingEntry.entry_number} karena saldo awal berubah.`,
      entry_date,
      actor,
    );
  }

  return createPostedJournalEntry({
    source_type: 'OPENING_BALANCE',
    source_id,
    source_number,
    source_event,
    entry_date,
    description,
    lines: normalizedLines,
    actor,
  });
};

export const reverseOpeningBalanceSourceJournal = async ({
  source_id,
  source_event,
  reason,
  entry_date,
  actor,
}: {
  source_id: string;
  source_event?: string;
  reason: string;
  entry_date?: string;
  actor?: Pick<AuthUser, 'id' | 'name'> | null;
}) => {
  const reversalDate = entry_date ?? new Date().toISOString();
  const entries = await db.journalEntries
    .where('source_type')
    .equals('OPENING_BALANCE')
    .filter((entry) => (
      entry.status === 'POSTED' &&
      entry.source_id === source_id &&
      !entry.source_event?.endsWith(':REVERSAL') &&
      (!source_event || entry.source_event === source_event)
    ))
    .toArray();
  const reversals: JournalEntry[] = [];

  for (const entry of entries) {
    reversals.push(await reverseJournalEntry(entry, reason, reversalDate, actor));
  }

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
  const accountingSetup = await db.accountingInitialSetupSetting.get('default');
  if (accountingSetup) {
    if (accountingSetup.cutoff_date.slice(0, 10) !== normalizedCutoffDate.slice(0, 10)) {
      throw new Error('Opening balance wajib memakai cutoff dari setup awal akuntansi.');
    }
    if (accountingSetup.inventory_policy !== inventory_policy) {
      throw new Error('Opening balance wajib memakai policy persediaan dari setup awal akuntansi.');
    }
  }

  const now = new Date().toISOString();
  let createdEntry: JournalEntry | undefined;
  let updatedGeneralLedger: GeneralLedgerSetting | undefined;

  await db.transaction('rw', [
    db.chartOfAccounts,
    db.generalLedgerSetting,
    db.openingBalanceBatches,
    db.openingBalanceLines,
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
      actor: currentUser,
    });

    const batchId = `opening-balance-account-${normalizedCutoffDate.slice(0, 10)}`;
    const batch: OpeningBalanceBatch = {
      id: batchId,
      module: 'ACCOUNT',
      cutoff_date: normalizedCutoffDate,
      status: 'POSTED',
      total_debit: createdEntry.total_debit,
      total_credit: createdEntry.total_credit,
      journal_entry_id: createdEntry.id,
      posted_at: createdEntry.posted_at,
      notes: 'Saldo awal akun umum.',
      created_by: currentUser?.id,
      created_by_name: currentUser?.name,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
      sync_error: undefined,
    };
    const openingLines: OpeningBalanceLine[] = normalizedLines.map((line, index) => ({
      id: `opening-balance-account-line-${line.account_id}`,
      batch_id: batchId,
      module: 'ACCOUNT',
      line_number: index + 1,
      base_amount: amountOrZero(line.debit || line.credit),
      account_id: line.account_id,
      account_code: line.account_code,
      account_name: line.account_name,
      debit: line.debit,
      credit: line.credit,
      notes: line.description,
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
      sync_error: undefined,
    }));
    await db.openingBalanceBatches.put(batch);
    await db.openingBalanceLines
      .where('batch_id')
      .equals(batchId)
      .delete();
    if (openingLines.length > 0) {
      await db.openingBalanceLines.bulkPut(openingLines);
    }

    updatedGeneralLedger = {
      id: 'default',
      is_ready: true,
      cutoff_date: normalizedCutoffDate,
      inventory_policy,
      opening_balance_journal_id: createdEntry.id,
      activated_at: setting?.activated_at,
      created_at: setting?.created_at ?? now,
      updated_at: now,
      sync_status: 'pending',
      sync_error: undefined,
    };
    await db.generalLedgerSetting.put(updatedGeneralLedger);

    await writeActivityLog({
      user: currentUser,
      action: 'GENERAL_LEDGER_OPENING_BALANCE_POSTED',
      entity: 'generalLedgerSetting',
      entity_id: 'default',
      description: `${currentUser?.name ?? 'User'} posting opening balance General Ledger per ${normalizedCutoffDate.slice(0, 10)}.`,
    });
  });

  if (updatedGeneralLedger) {
    await enqueueGeneralLedgerSettingSync(updatedGeneralLedger, 'update');
  }

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

  await assertAccountingPeriodOpen(entry_date);
  if (!await isGeneralLedgerPostingEnabled(entry_date)) {
    throw new Error('General Ledger belum aktif/siap untuk tanggal jurnal ini. Selesaikan setup akuntansi awal dan pastikan tanggal tidak sebelum cutoff.');
  }

  const accounts = await db.chartOfAccounts.toArray();
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  const entry = await postBalancedJournalEntry({
    source_type: 'MANUAL_JOURNAL',
    source_id: crypto.randomUUID(),
    source_event: SOURCE_EVENTS.MANUAL_JOURNAL_POSTED,
    entry_date,
    description,
    actor: currentUser,
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

  if (entry) {
    await writeActivityLog({
      user: currentUser,
      action: 'MANUAL_JOURNAL_POSTED',
      entity: 'journalEntries',
      entity_id: entry.id,
      description: `${currentUser?.name ?? 'User'} posting jurnal umum ${entry.entry_number}.`,
    });
  }

  return entry;
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

export const postPosSaleJournal = async (
  transaction: Transaction,
  items: TransactionItem[] = [],
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
  payments: PosTransactionPayment[] = [],
) => {
  if (transaction.status === 'VOIDED') return undefined;
  if (!await isGeneralLedgerPostingEnabled(transaction.created_at)) return undefined;

  const accounts = await db.chartOfAccounts.toArray();
  const salesAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.salesPos, 'Penjualan POS');
  const amount = amountOrZero(transaction.total_amount);
  const debitByAccount = new Map<string, { account: ChartOfAccount; amount: number; methods: string[] }>();
  payments.forEach((payment) => {
    const account = accounts.find((candidate) => candidate.id === payment.payment_posting_account_id);
    if (!account || account.type !== 'ASSET' || !account.is_active || !account.is_postable) {
      throw new Error(`Akun penerimaan ${payment.payment_method_name} tidak valid untuk jurnal.`);
    }
    const current = debitByAccount.get(account.id) ?? { account, amount: 0, methods: [] };
    current.amount += amountOrZero(payment.applied_amount);
    current.methods.push(payment.payment_method_name);
    debitByAccount.set(account.id, current);
  });

  if (debitByAccount.size === 0) {
    const snapshotted = transaction.payment_posting_account_id
      ? accounts.find((account) => account.id === transaction.payment_posting_account_id)
      : undefined;
    const fallback = snapshotted ?? getPostableAccount(accounts, getCashAccountCandidate(transaction.payment_method), 'Kas/Bank');
    debitByAccount.set(fallback.id, { account: fallback, amount, methods: [transaction.payment_method_name ?? 'kas/bank'] });
  }

  const debitTotal = roundCurrency([...debitByAccount.values()].reduce((sum, value) => sum + value.amount, 0));
  if (Math.abs(debitTotal - amount) > JOURNAL_TOLERANCE) {
    throw new Error('Total alokasi pembayaran tidak sama dengan total jurnal penjualan.');
  }
  const lines: JournalLineDraft[] = [
    ...[...debitByAccount.values()].map((value) => createDebitLine(
      value.account,
      value.amount,
      `Penerimaan ${[...new Set(value.methods)].join(', ')} dari POS`,
    )),
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
    actor,
  });
};

export const reversePosSaleJournal = async (
  transaction: Transaction,
  reason: string,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => {
  return reverseJournalEntriesForSource({
    source_type: 'POS_TRANSACTION',
    source_id: transaction.id,
    source_event: SOURCE_EVENTS.POS_SALE_POSTED,
    reason,
    actor,
  });
};

export const postStockPurchaseJournal = async (
  purchase: StockPurchase,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => {
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
    actor,
  });
};

export const postProductionOrderJournal = async (
  order: ProductionOrder,
  items: ProductionOrderItem[],
  costs: ProductionOrderCost[],
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => {
  if (order.status !== 'POSTED') return undefined;
  const entryDate = order.posted_at ?? order.produced_at;
  if (!await isGeneralLedgerPostingEnabled(entryDate)) return undefined;

  const accounts = await db.chartOfAccounts.toArray();
  const inventoryAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.inventory, 'Persediaan Barang');
  const cashAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.cash, 'Kas');
  const materialCost = amountOrZero(order.material_cost);
  const additionalCost = amountOrZero(order.additional_cost);
  const totalCost = amountOrZero(order.total_cost);
  const itemCount = items.length;
  const lines: JournalLineDraft[] = [
    createDebitLine(inventoryAccount, totalCost, `Barang jadi produksi ${order.production_number}`),
    createCreditLine(inventoryAccount, materialCost, `Bahan baku keluar untuk ${itemCount} item produksi`),
  ].filter((line): line is JournalLineDraft => Boolean(line));

  for (const cost of costs) {
    const amount = amountOrZero(cost.amount);
    if (amount <= 0) continue;

    const account = cost.account_id
      ? getPostableAccount(accounts, { ids: [cost.account_id], codes: cost.account_code ? [cost.account_code] : [] }, cost.name)
      : cashAccount;
    const line = createCreditLine(account, amount, cost.name);
    if (line) lines.push(line);
  }

  if (additionalCost > 0 && costs.length === 0) {
    const line = createCreditLine(cashAccount, additionalCost, 'Biaya tambahan produksi');
    if (line) lines.push(line);
  }

  if (totalCost <= 0) return undefined;

  return postBalancedJournalEntry({
    source_type: 'PRODUCTION_ORDER',
    source_id: order.id,
    source_number: order.production_number,
    source_event: SOURCE_EVENTS.PRODUCTION_ORDER_POSTED,
    entry_date: entryDate,
    description: `Produksi ${order.production_number} - ${order.finished_product_name}`,
    lines,
    actor,
  });
};

export const reverseProductionOrderJournal = async (
  order: ProductionOrder,
  reason: string,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => {
  return reverseJournalEntriesForSource({
    source_type: 'PRODUCTION_ORDER',
    source_id: order.id,
    source_event: SOURCE_EVENTS.PRODUCTION_ORDER_POSTED,
    reason: `Pembalikan jurnal produksi ${order.production_number}: ${reason}`,
    entry_date: order.voided_at,
    actor,
  });
};

export const postSalesInvoiceIssuedJournal = async (
  document: SalesDocument,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => {
  if (document.type !== 'SALES_INVOICE' || document.status === 'VOIDED') return undefined;
  const entryDate = document.issued_at ?? document.document_date;
  if (!await isGeneralLedgerPostingEnabled(entryDate)) return undefined;

  const accounts = await db.chartOfAccounts.toArray();
  const receivableAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.accountsReceivable, 'Piutang Usaha');
  const revenueAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.salesInvoiceRevenue, 'Pendapatan Sales Invoice');
  const totalAmount = amountOrZero(document.total_amount);
  const taxAmount = amountOrZero(document.tax_amount);
  const discountAmount = amountOrZero(document.discount_amount);
  const discountAccount = discountAmount > 0
    ? getPostableAccount(
      accounts,
      document.discount_account_id
        ? { ids: [document.discount_account_id, ...ACCOUNT_CANDIDATES.salesDiscount.ids], codes: ACCOUNT_CANDIDATES.salesDiscount.codes }
        : ACCOUNT_CANDIDATES.salesDiscount,
      'Diskon Penjualan',
    )
    : undefined;
  const revenueAmount = roundCurrency(totalAmount - taxAmount + discountAmount);
  const lines: JournalLineDraft[] = [
    createDebitLine(receivableAccount, totalAmount, 'Piutang dari sales invoice', document.department_id, document.project_id),
    discountAccount ? createDebitLine(discountAccount, discountAmount, 'Diskon sales invoice', document.department_id, document.project_id) : undefined,
    createCreditLine(revenueAccount, revenueAmount, 'Pendapatan sales invoice', document.department_id, document.project_id),
  ].filter((line): line is JournalLineDraft => Boolean(line));

  if (taxAmount > 0) {
    const taxAccount = getSalesTaxAccount(accounts, document);
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
    actor,
  });
};

export const postSalesInvoicePaymentJournal = async (
  document: SalesDocument,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => {
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
      actor,
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
    actor,
  });
};

export const postSalesInvoicePaymentRecordJournal = async (
  document: SalesDocument,
  payment: SalesInvoicePayment,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => {
  if (document.type !== 'SALES_INVOICE' || document.status === 'VOIDED' || payment.status !== 'ACTIVE') return undefined;
  if (!await isGeneralLedgerPostingEnabled(payment.paid_at)) return undefined;

  const amount = amountOrZero(payment.amount);
  const allocatedAmount = amountOrZero(getSalesInvoicePaymentAllocatedAmount(payment));
  const overpaymentAmount = amountOrZero(getSalesInvoicePaymentOverpaymentAmount(payment));
  if (amount <= 0) return undefined;

  const accounts = await db.chartOfAccounts.toArray();
  const cashAccount = await getCashOrBankAccountForPayment(payment.payment_method, payment.cash_account_id);
  const receivableAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.accountsReceivable, 'Piutang Usaha');
  const customerCreditAccount = overpaymentAmount > 0
    ? getPostableAccount(accounts, ACCOUNT_CANDIDATES.customerCredit, 'Kredit Pelanggan')
    : undefined;

  return postBalancedJournalEntry({
    source_type: 'SALES_INVOICE_PAYMENT',
    source_id: payment.id,
    source_number: payment.document_number,
    source_event: SOURCE_EVENTS.SALES_INVOICE_PAYMENT_POSTED,
    entry_date: payment.paid_at,
    description: `Pembayaran invoice ${payment.document_number}`,
    lines: [
      createDebitLine(cashAccount, amount, 'Kas diterima dari pembayaran invoice', document.department_id, document.project_id),
      createCreditLine(receivableAccount, allocatedAmount, 'Pelunasan piutang sales invoice', document.department_id, document.project_id),
      customerCreditAccount
        ? createCreditLine(customerCreditAccount, overpaymentAmount, 'Kredit pelanggan dari lebih bayar invoice', document.department_id, document.project_id)
        : undefined,
    ].filter((line): line is JournalLineDraft => Boolean(line)),
    actor,
  });
};

export const postOpeningReceivablePaymentRecordJournal = async (
  line: OpeningBalanceLine,
  payment: SalesInvoicePayment,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => {
  if (line.module !== 'RECEIVABLE' || payment.status !== 'ACTIVE') return undefined;
  if (!await isGeneralLedgerPostingEnabled(payment.paid_at)) return undefined;

  const amount = amountOrZero(payment.amount);
  const allocatedAmount = amountOrZero(getSalesInvoicePaymentAllocatedAmount(payment));
  const overpaymentAmount = amountOrZero(getSalesInvoicePaymentOverpaymentAmount(payment));
  if (amount <= 0) return undefined;

  const accounts = await db.chartOfAccounts.toArray();
  const cashAccount = await getCashOrBankAccountForPayment(payment.payment_method, payment.cash_account_id);
  const receivableAccount = line.account_id
    ? getPostableAccount(
      accounts,
      { ids: [line.account_id, ...ACCOUNT_CANDIDATES.accountsReceivable.ids], codes: ACCOUNT_CANDIDATES.accountsReceivable.codes },
      'Piutang Usaha',
    )
    : getPostableAccount(accounts, ACCOUNT_CANDIDATES.accountsReceivable, 'Piutang Usaha');
  const customerCreditAccount = overpaymentAmount > 0
    ? getPostableAccount(accounts, ACCOUNT_CANDIDATES.customerCredit, 'Kredit Pelanggan')
    : undefined;

  return postBalancedJournalEntry({
    source_type: 'OPENING_BALANCE',
    source_id: payment.id,
    source_number: payment.document_number,
    source_event: SOURCE_EVENTS.OPENING_RECEIVABLE_PAYMENT_POSTED,
    entry_date: payment.paid_at,
    description: `Pembayaran saldo awal piutang ${payment.document_number}`,
    lines: [
      createDebitLine(cashAccount, amount, 'Kas diterima dari pembayaran saldo awal piutang'),
      createCreditLine(receivableAccount, allocatedAmount, 'Pelunasan saldo awal piutang usaha'),
      customerCreditAccount
        ? createCreditLine(customerCreditAccount, overpaymentAmount, 'Kredit pelanggan dari lebih bayar saldo awal piutang')
        : undefined,
    ].filter((journalLine): journalLine is JournalLineDraft => Boolean(journalLine)),
    actor,
  });
};

export const reverseSalesInvoicePaymentRecordJournal = async (
  payment: SalesInvoicePayment,
  reason: string,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => {
  return reverseJournalEntriesForSource({
    source_type: 'SALES_INVOICE_PAYMENT',
    source_id: payment.id,
    source_event: SOURCE_EVENTS.SALES_INVOICE_PAYMENT_POSTED,
    reason,
    actor,
  });
};

export const postSalesOverpaymentInvoiceAllocationJournal = async (
  settlement: SalesOverpaymentSettlement,
  allocations: SalesOverpaymentSettlementAllocation[],
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => {
  if (settlement.method !== 'INVOICE_ALLOCATION' || settlement.status !== 'POSTED') return undefined;
  if (!await isGeneralLedgerPostingEnabled(settlement.settlement_date)) return undefined;

  const amount = amountOrZero(settlement.total_amount);
  if (amount <= 0) return undefined;

  const accounts = await db.chartOfAccounts.toArray();
  const customerCreditAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.customerCredit, 'Kredit Pelanggan');
  const receivableAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.accountsReceivable, 'Piutang Usaha');
  const allocationLabel = allocations.length > 1
    ? `${allocations.length} invoice`
    : allocations[0]?.target_document_number ?? 'invoice target';

  return postBalancedJournalEntry({
    source_type: 'SALES_OVERPAYMENT_SETTLEMENT',
    source_id: settlement.id,
    source_number: settlement.settlement_number,
    source_event: SOURCE_EVENTS.SALES_OVERPAYMENT_ALLOCATED,
    entry_date: settlement.settlement_date,
    description: `Alokasi lebih bayar ${settlement.source_payment_number ?? settlement.source_document_number} ke ${allocationLabel}`,
    lines: [
      createDebitLine(customerCreditAccount, amount, 'Kredit pelanggan digunakan untuk membayar invoice', settlement.department_id, settlement.project_id),
      createCreditLine(receivableAccount, amount, 'Piutang sales invoice berkurang dari alokasi customer credit', settlement.department_id, settlement.project_id),
    ].filter((line): line is JournalLineDraft => Boolean(line)),
    actor,
  });
};

export const postSalesOverpaymentCashRefundJournal = async (
  settlement: SalesOverpaymentSettlement,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => {
  if (settlement.method !== 'CASH_REFUND' || settlement.status !== 'POSTED') return undefined;
  if (!await isGeneralLedgerPostingEnabled(settlement.settlement_date)) return undefined;

  const amount = amountOrZero(settlement.total_amount);
  if (amount <= 0) return undefined;

  const accounts = await db.chartOfAccounts.toArray();
  const customerCreditAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.customerCredit, 'Kredit Pelanggan');
  const cashAccount = settlement.cash_account_id
    ? getPostableAccount(accounts, { ids: [settlement.cash_account_id], codes: [] }, 'Kas/Bank')
    : await getCashOrBankAccountForPayment('TUNAI');

  return postBalancedJournalEntry({
    source_type: 'SALES_OVERPAYMENT_SETTLEMENT',
    source_id: settlement.id,
    source_number: settlement.settlement_number,
    source_event: SOURCE_EVENTS.SALES_OVERPAYMENT_REFUNDED,
    entry_date: settlement.settlement_date,
    description: `Pengembalian lebih bayar ${settlement.source_payment_number ?? settlement.source_document_number}`,
    lines: [
      createDebitLine(customerCreditAccount, amount, 'Kredit pelanggan dikembalikan', settlement.department_id, settlement.project_id),
      createCreditLine(cashAccount, amount, 'Kas/bank keluar untuk pengembalian lebih bayar pelanggan', settlement.department_id, settlement.project_id),
    ].filter((line): line is JournalLineDraft => Boolean(line)),
    actor,
  });
};

export const reverseSalesOverpaymentSettlementJournal = async (
  settlement: SalesOverpaymentSettlement,
  reason: string,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => {
  const sourceEvent = settlement.method === 'CASH_REFUND'
    ? SOURCE_EVENTS.SALES_OVERPAYMENT_REFUNDED
    : SOURCE_EVENTS.SALES_OVERPAYMENT_ALLOCATED;

  return reverseJournalEntriesForSource({
    source_type: 'SALES_OVERPAYMENT_SETTLEMENT',
    source_id: settlement.id,
    source_event: sourceEvent,
    reason,
    actor,
  });
};

const getPurchaseAmountBeforeTax = (document: Pick<PurchaseDocument, 'total_amount' | 'tax_amount' | 'tax_flow'>) => {
  const totalAmount = amountOrZero(document.total_amount);
  const taxAmount = amountOrZero(document.tax_amount);

  return document.tax_flow === 'WITHHOLDING'
    ? roundCurrency(totalAmount + taxAmount)
    : roundCurrency(totalAmount - taxAmount);
};

export const postPurchaseInvoiceIssuedJournal = async (
  document: PurchaseDocument,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => {
  if (document.type !== 'PURCHASE_INVOICE' || document.status === 'VOIDED') return undefined;
  const entryDate = document.issued_at ?? document.document_date;
  if (!await isGeneralLedgerPostingEnabled(entryDate)) return undefined;

  const accounts = await db.chartOfAccounts.toArray();
  const payableAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.accountsPayable, 'Hutang Usaha');
  const inventoryAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.inventory, 'Persediaan Barang');
  const totalAmount = amountOrZero(document.total_amount);
  const taxAmount = amountOrZero(document.tax_amount);
  const purchaseAmount = getPurchaseAmountBeforeTax(document);

  if (totalAmount <= 0 || purchaseAmount <= 0) return undefined;

  const lines: JournalLineDraft[] = [
    createDebitLine(inventoryAccount, purchaseAmount, 'Persediaan dari purchase invoice', document.department_id, document.project_id),
  ].filter((line): line is JournalLineDraft => Boolean(line));

  if (taxAmount > 0) {
    const taxAccount = getPurchaseTaxAccount(accounts, document);
    const taxLine = document.tax_flow === 'WITHHOLDING'
      ? createCreditLine(taxAccount, taxAmount, 'Pajak potong terutang purchase invoice', document.department_id, document.project_id)
      : createDebitLine(taxAccount, taxAmount, 'Pajak masukan purchase invoice', document.department_id, document.project_id);
    if (taxLine) lines.push(taxLine);
  }

  const payableLine = createCreditLine(payableAccount, totalAmount, 'Hutang purchase invoice', document.department_id, document.project_id);
  if (payableLine) lines.push(payableLine);

  return postBalancedJournalEntry({
    source_type: 'PURCHASE_INVOICE',
    source_id: document.id,
    source_number: document.document_number,
    source_event: SOURCE_EVENTS.PURCHASE_INVOICE_ISSUED,
    entry_date: entryDate,
    description: `Purchase invoice ${document.document_number} diterbitkan`,
    lines,
    actor,
  });
};

export const reversePurchaseInvoiceJournal = async (
  document: PurchaseDocument,
  reason: string,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => reverseJournalEntriesForSource({
  source_type: 'PURCHASE_INVOICE',
  source_id: document.id,
  source_event: SOURCE_EVENTS.PURCHASE_INVOICE_ISSUED,
  reason,
  entry_date: document.voided_at,
  actor,
});

export const postPurchaseReturnIssuedJournal = async (
  document: PurchaseDocument,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => {
  if (document.type !== 'PURCHASE_RETURN' || document.status === 'VOIDED') return undefined;
  const entryDate = document.issued_at ?? document.document_date;
  if (!await isGeneralLedgerPostingEnabled(entryDate)) return undefined;

  const accounts = await db.chartOfAccounts.toArray();
  const payableAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.accountsPayable, 'Hutang Usaha');
  const inventoryAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.inventory, 'Persediaan Barang');
  const totalAmount = amountOrZero(document.total_amount);
  const taxAmount = amountOrZero(document.tax_amount);
  const purchaseAmount = getPurchaseAmountBeforeTax(document);

  if (totalAmount <= 0 || purchaseAmount <= 0) return undefined;

  const lines: JournalLineDraft[] = [
    createDebitLine(payableAccount, totalAmount, 'Purchase return mengurangi hutang', document.department_id, document.project_id),
    createCreditLine(inventoryAccount, purchaseAmount, 'Persediaan keluar karena purchase return', document.department_id, document.project_id),
  ].filter((line): line is JournalLineDraft => Boolean(line));

  if (taxAmount > 0) {
    const taxAccount = getPurchaseTaxAccount(accounts, document);
    const taxLine = document.tax_flow === 'WITHHOLDING'
      ? createDebitLine(taxAccount, taxAmount, 'Koreksi pajak potong purchase return', document.department_id, document.project_id)
      : createCreditLine(taxAccount, taxAmount, 'Koreksi pajak masukan purchase return', document.department_id, document.project_id);
    if (taxLine) lines.push(taxLine);
  }

  return postBalancedJournalEntry({
    source_type: 'PURCHASE_INVOICE',
    source_id: document.id,
    source_number: document.document_number,
    source_event: SOURCE_EVENTS.PURCHASE_RETURN_ISSUED,
    entry_date: entryDate,
    description: `Purchase return ${document.document_number} diterbitkan`,
    lines,
    actor,
  });
};

export const reversePurchaseReturnJournal = async (
  document: PurchaseDocument,
  reason: string,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => reverseJournalEntriesForSource({
  source_type: 'PURCHASE_INVOICE',
  source_id: document.id,
  source_event: SOURCE_EVENTS.PURCHASE_RETURN_ISSUED,
  reason,
  entry_date: document.voided_at,
  actor,
});

export const postPurchaseInvoicePaymentRecordJournal = async (
  document: PurchaseDocument,
  payment: PurchaseInvoicePayment,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => {
  if (document.type !== 'PURCHASE_INVOICE' || document.status === 'VOIDED' || payment.status !== 'ACTIVE') return undefined;
  if (!await isGeneralLedgerPostingEnabled(payment.paid_at)) return undefined;

  const amount = amountOrZero(payment.amount);
  if (amount <= 0) return undefined;

  const accounts = await db.chartOfAccounts.toArray();
  const cashAccount = await getCashOrBankAccountForPayment(payment.payment_method, payment.cash_account_id);
  const payableAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.accountsPayable, 'Hutang Usaha');

  return postBalancedJournalEntry({
    source_type: 'PURCHASE_INVOICE_PAYMENT',
    source_id: payment.id,
    source_number: payment.document_number,
    source_event: SOURCE_EVENTS.PURCHASE_INVOICE_PAYMENT_POSTED,
    entry_date: payment.paid_at,
    description: `Pembayaran purchase invoice ${payment.document_number}`,
    lines: [
      createDebitLine(payableAccount, amount, 'Pelunasan hutang purchase invoice', document.department_id, document.project_id),
      createCreditLine(cashAccount, amount, 'Kas keluar untuk pembayaran purchase invoice', document.department_id, document.project_id),
    ].filter((line): line is JournalLineDraft => Boolean(line)),
    actor,
  });
};

export const postOpeningPayablePaymentRecordJournal = async (
  line: OpeningBalanceLine,
  payment: PurchaseInvoicePayment,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => {
  if (line.module !== 'PAYABLE' || payment.status !== 'ACTIVE') return undefined;
  if (!await isGeneralLedgerPostingEnabled(payment.paid_at)) return undefined;

  const amount = amountOrZero(payment.amount);
  if (amount <= 0) return undefined;

  const accounts = await db.chartOfAccounts.toArray();
  const cashAccount = await getCashOrBankAccountForPayment(payment.payment_method, payment.cash_account_id);
  const payableAccount = line.account_id
    ? getPostableAccount(
      accounts,
      { ids: [line.account_id, ...ACCOUNT_CANDIDATES.accountsPayable.ids], codes: ACCOUNT_CANDIDATES.accountsPayable.codes },
      'Hutang Usaha',
    )
    : getPostableAccount(accounts, ACCOUNT_CANDIDATES.accountsPayable, 'Hutang Usaha');

  return postBalancedJournalEntry({
    source_type: 'OPENING_BALANCE',
    source_id: payment.id,
    source_number: payment.document_number,
    source_event: SOURCE_EVENTS.OPENING_PAYABLE_PAYMENT_POSTED,
    entry_date: payment.paid_at,
    description: `Pembayaran saldo awal hutang ${payment.document_number}`,
    lines: [
      createDebitLine(payableAccount, amount, 'Pelunasan saldo awal hutang usaha'),
      createCreditLine(cashAccount, amount, 'Kas keluar untuk pembayaran saldo awal hutang'),
    ].filter((journalLine): journalLine is JournalLineDraft => Boolean(journalLine)),
    actor,
  });
};

export const reversePurchaseInvoicePaymentRecordJournal = async (
  payment: PurchaseInvoicePayment,
  reason: string,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => {
  return reverseJournalEntriesForSource({
    source_type: 'PURCHASE_INVOICE_PAYMENT',
    source_id: payment.id,
    source_event: SOURCE_EVENTS.PURCHASE_INVOICE_PAYMENT_POSTED,
    reason,
    actor,
  });
};

export const postCashBankTransferJournal = async (input: {
  transferGroupId: string;
  transferDate: string;
  amount: number;
  fromAccount: ChartOfAccount;
  toAccount: ChartOfAccount;
  description?: string;
  actor?: Pick<AuthUser, 'id' | 'name'> | null;
}) => {
  if (!await isGeneralLedgerPostingEnabled(input.transferDate)) return undefined;

  const amount = amountOrZero(input.amount);
  if (amount <= 0) return undefined;

  return postBalancedJournalEntry({
    source_type: 'CASH_BANK_TRANSFER',
    source_id: input.transferGroupId,
    source_number: input.transferGroupId,
    source_event: SOURCE_EVENTS.CASH_BANK_TRANSFER_POSTED,
    entry_date: input.transferDate,
    description: input.description ?? `Transfer kas/bank ${input.fromAccount.code} ke ${input.toAccount.code}`,
    lines: [
      createDebitLine(input.toAccount, amount, 'Kas/bank bertambah dari transfer internal'),
      createCreditLine(input.fromAccount, amount, 'Kas/bank berkurang karena transfer internal'),
    ].filter((line): line is JournalLineDraft => Boolean(line)),
    actor: input.actor,
  });
};

export const postCashBankReconciliationAdjustmentJournal = async (input: {
  reconciliationId: string;
  reconciliationNumber: string;
  statementDate: string;
  cashAccount: ChartOfAccount;
  adjustmentAccount: ChartOfAccount;
  differenceAmount: number;
  actor?: Pick<AuthUser, 'id' | 'name'> | null;
}) => {
  if (!await isGeneralLedgerPostingEnabled(input.statementDate)) return undefined;

  const amount = amountOrZero(Math.abs(input.differenceAmount));
  if (amount <= 0) return undefined;
  if (input.cashAccount.id === input.adjustmentAccount.id) {
    throw new Error('Akun penyesuaian rekonsiliasi tidak boleh sama dengan akun kas/bank.');
  }
  if (!input.adjustmentAccount.is_active || !input.adjustmentAccount.is_postable) {
    throw new Error(`Akun ${input.adjustmentAccount.code} - ${input.adjustmentAccount.name} harus aktif dan postable untuk jurnal rekonsiliasi.`);
  }

  const lines = input.differenceAmount > 0
    ? [
        createDebitLine(input.cashAccount, amount, 'Kas/bank bertambah dari selisih rekonsiliasi'),
        createCreditLine(input.adjustmentAccount, amount, 'Pendapatan/penyesuaian selisih rekonsiliasi'),
      ]
    : [
        createDebitLine(input.adjustmentAccount, amount, 'Beban/penyesuaian selisih rekonsiliasi'),
        createCreditLine(input.cashAccount, amount, 'Kas/bank berkurang dari selisih rekonsiliasi'),
      ];

  return postBalancedJournalEntry({
    source_type: 'CASH_BANK_RECONCILIATION',
    source_id: input.reconciliationId,
    source_number: input.reconciliationNumber,
    source_event: SOURCE_EVENTS.CASH_BANK_RECONCILIATION_ADJUSTMENT_POSTED,
    entry_date: input.statementDate,
    description: `Penyesuaian rekonsiliasi kas/bank ${input.reconciliationNumber}`,
    lines: lines.filter((line): line is JournalLineDraft => Boolean(line)),
    actor: input.actor,
  });
};

export const reverseCashBankReconciliationAdjustmentJournal = async (
  reconciliation: CashBankReconciliation,
  reason: string,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
  entryDate?: string,
) => reverseJournalEntriesForSource({
  source_type: 'CASH_BANK_RECONCILIATION',
  source_id: reconciliation.id,
  source_event: SOURCE_EVENTS.CASH_BANK_RECONCILIATION_ADJUSTMENT_POSTED,
  reason,
  entry_date: entryDate,
  actor,
});

export const postPurchaseCostReconciliationJournal = async (
  reconciliation: PurchaseCostReconciliation,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => {
  const entryDate = reconciliation.supplier_invoice_date || reconciliation.created_at;
  if (!await isGeneralLedgerPostingEnabled(entryDate)) return undefined;

  const soldVariance = amountOrZero(reconciliation.sold_cost_variance_amount);
  const remainingVariance = amountOrZero(reconciliation.remaining_stock_variance_amount);
  const payableVariance = roundCurrency(soldVariance + remainingVariance);
  if (Math.abs(soldVariance) + Math.abs(remainingVariance) <= JOURNAL_TOLERANCE) return undefined;

  const accounts = await db.chartOfAccounts.toArray();
  const cogsAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.cogs, 'HPP');
  const inventoryAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.inventory, 'Persediaan Barang');
  const payableAccount = getPostableAccount(accounts, ACCOUNT_CANDIDATES.accountsPayable, 'Hutang Usaha');

  const lines = [
    createSignedLine(
      cogsAccount,
      soldVariance,
      'Koreksi HPP barang terjual dari rekonsiliasi biaya pembelian',
      'Pembalikan HPP barang terjual dari rekonsiliasi biaya pembelian',
    ),
    createSignedLine(
      inventoryAccount,
      remainingVariance,
      'Koreksi nilai persediaan tersisa dari rekonsiliasi biaya pembelian',
      'Pembalikan nilai persediaan tersisa dari rekonsiliasi biaya pembelian',
    ),
    Math.abs(payableVariance) > JOURNAL_TOLERANCE
      ? createSignedLine(
          payableAccount,
          -payableVariance,
          'Hutang usaha berkurang dari rekonsiliasi biaya pembelian',
          'Hutang usaha bertambah dari rekonsiliasi biaya pembelian',
        )
      : undefined,
  ].filter((line): line is JournalLineDraft => Boolean(line));

  return postBalancedJournalEntry({
    source_type: 'PURCHASE_COST_RECONCILIATION',
    source_id: reconciliation.id,
    source_number: reconciliation.purchase_document_number,
    source_event: SOURCE_EVENTS.PURCHASE_COST_RECONCILIATION_POSTED,
    entry_date: entryDate,
    description: `Rekonsiliasi HPP ${reconciliation.purchase_document_number}`,
    lines,
    actor,
  });
};

const buildPayrollRunPaidJournalDescription = (run: PayrollRun) => (
  `Pembayaran gaji ${run.payroll_number} periode ${run.period_start} s/d ${run.period_end}`
);

export const postPayrollRunPaidJournal = async (
  run: PayrollRun,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => {
  if (run.status !== 'PAID') return undefined;
  if (!run.paid_at) return undefined;
  if (!await isGeneralLedgerPostingEnabled(run.paid_at)) return undefined;

  const cashAmount = amountOrZero(run.net_amount);
  const cashAdvanceDeductionAmount = amountOrZero(run.cash_advance_deduction_amount);
  const expenseAmount = roundCurrency(cashAmount + cashAdvanceDeductionAmount);
  if (expenseAmount <= 0) return undefined;

  const accounts = await db.chartOfAccounts.toArray();
  const salaryExpenseAccount = tryGetPostableAccount(accounts, ACCOUNT_CANDIDATES.salaryExpense)
    ?? getPostableAccount(accounts, ACCOUNT_CANDIDATES.otherExpense, 'Beban Gaji');
  const cashAccount = cashAmount > 0
    ? run.cash_account_id
      ? accounts.find((account) => account.id === run.cash_account_id)
      : getPostableAccount(accounts, getCashAccountCandidate(run.payment_method), 'Kas/Bank')
    : undefined;
  if (cashAmount > 0 && !cashAccount) {
    throw new Error('Akun kas/bank pembayaran payroll tidak ditemukan.');
  }
  if (cashAccount && (cashAccount.type !== 'ASSET' || !cashAccount.is_active || !cashAccount.is_postable)) {
    throw new Error('Akun kas/bank pembayaran payroll harus bertipe aset, aktif, dan postable.');
  }

  const cashAdvanceAccount = cashAdvanceDeductionAmount > 0
    ? getPostableAccount(accounts, ACCOUNT_CANDIDATES.employeeCashAdvanceReceivable, 'Piutang Kasbon Karyawan')
    : undefined;

  return postBalancedJournalEntry({
    source_type: 'PAYROLL_RUN',
    source_id: run.id,
    source_number: run.payroll_number,
    source_event: SOURCE_EVENTS.PAYROLL_RUN_PAID,
    entry_date: run.paid_at,
    description: buildPayrollRunPaidJournalDescription(run),
    lines: [
      createDebitLine(salaryExpenseAccount, expenseAmount, 'Beban gaji karyawan'),
      cashAccount
        ? createCreditLine(cashAccount, cashAmount, 'Kas/bank berkurang karena pembayaran gaji')
        : undefined,
      cashAdvanceAccount
        ? createCreditLine(cashAdvanceAccount, cashAdvanceDeductionAmount, 'Piutang kasbon karyawan dilunasi dari payroll')
        : undefined,
    ].filter((line): line is JournalLineDraft => Boolean(line)),
    actor,
  });
};

export const postEmployeeCashAdvanceDisbursementJournal = async (
  advance: EmployeeCashAdvance,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => {
  if (advance.status === 'VOIDED') return undefined;
  if (!await isGeneralLedgerPostingEnabled(advance.disbursed_at)) return undefined;

  const amount = amountOrZero(advance.amount);
  if (amount <= 0) return undefined;

  const accounts = await db.chartOfAccounts.toArray();
  const cashAdvanceAccount = getPostableAccount(
    accounts,
    ACCOUNT_CANDIDATES.employeeCashAdvanceReceivable,
    'Piutang Kasbon Karyawan',
  );
  const cashAccount = advance.cash_account_id
    ? accounts.find((account) => account.id === advance.cash_account_id)
    : getPostableAccount(accounts, getCashAccountCandidate(advance.payment_method), 'Kas/Bank');
  if (!cashAccount) {
    throw new Error('Akun kas/bank pencairan kasbon tidak ditemukan.');
  }
  if (cashAccount.type !== 'ASSET' || !cashAccount.is_active || !cashAccount.is_postable) {
    throw new Error('Akun kas/bank pencairan kasbon harus bertipe aset, aktif, dan postable.');
  }

  return postBalancedJournalEntry({
    source_type: 'EMPLOYEE_CASH_ADVANCE',
    source_id: advance.id,
    source_number: advance.advance_number,
    source_event: SOURCE_EVENTS.EMPLOYEE_CASH_ADVANCE_DISBURSED,
    entry_date: advance.disbursed_at,
    description: `Pencairan kasbon ${advance.advance_number} ${advance.employee_name}`,
    lines: [
      createDebitLine(cashAdvanceAccount, amount, 'Piutang kasbon karyawan bertambah'),
      createCreditLine(cashAccount, amount, 'Kas/bank berkurang karena pencairan kasbon'),
    ].filter((line): line is JournalLineDraft => Boolean(line)),
    actor,
  });
};

export const reverseEmployeeCashAdvanceDisbursementJournal = async (
  advance: EmployeeCashAdvance,
  reason: string,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
  entryDate?: string,
) => reverseJournalEntriesForSource({
  source_type: 'EMPLOYEE_CASH_ADVANCE',
  source_id: advance.id,
  source_event: SOURCE_EVENTS.EMPLOYEE_CASH_ADVANCE_DISBURSED,
  reason,
  entry_date: entryDate,
  actor,
});

const getCooperativeSavingSourceEvent = (transaction: CooperativeSavingTransaction) => {
  if (transaction.transaction_type === 'DEPOSIT') {
    return SOURCE_EVENTS.COOPERATIVE_SAVING_DEPOSIT_POSTED;
  }
  if (transaction.transaction_type === 'WITHDRAWAL') {
    if (transaction.withdrawal_source === 'INTEREST') {
      return SOURCE_EVENTS.COOPERATIVE_SAVING_INTEREST_PAID;
    }
    return SOURCE_EVENTS.COOPERATIVE_SAVING_WITHDRAWAL_POSTED;
  }
  if (transaction.transaction_type === 'OPENING_BALANCE') {
    return SOURCE_EVENTS.COOPERATIVE_SAVING_OPENING_BALANCE_POSTED;
  }

  return undefined;
};

const getCooperativeSavingAccountCandidate = (savingType: CooperativeSavingTransaction['saving_type']) => {
  switch (savingType) {
    case 'POKOK': return ACCOUNT_CANDIDATES.cooperativeMemberSavingsPokok;
    case 'WAJIB': return ACCOUNT_CANDIDATES.cooperativeMemberSavingsWajib;
    case 'SUKARELA': return ACCOUNT_CANDIDATES.cooperativeMemberSavingsSukarela;
    default: return ACCOUNT_CANDIDATES.cooperativeMemberSavings;
  }
};

const getCooperativeSavingAccountLabel = (savingType: CooperativeSavingTransaction['saving_type']) => (
  `Simpanan ${savingType === 'POKOK' ? 'Pokok' : savingType === 'WAJIB' ? 'Wajib' : savingType === 'SUKARELA' ? 'Sukarela' : 'Anggota'}`
);

export const postCooperativeSavingTransactionJournal = async (
  transaction: CooperativeSavingTransaction,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => {
  if (transaction.status !== 'POSTED') return undefined;
  if (transaction.transaction_type !== 'DEPOSIT' && transaction.transaction_type !== 'WITHDRAWAL') return undefined;
  if (!await isGeneralLedgerPostingEnabled(transaction.transaction_date)) return undefined;

  const amount = amountOrZero(transaction.amount);
  if (amount <= 0) return undefined;

  const accounts = await db.chartOfAccounts.toArray();
  const cashAccount = transaction.cash_account_id
    ? accounts.find((account) => account.id === transaction.cash_account_id)
    : getPostableAccount(accounts, getCashAccountCandidate(transaction.payment_method), 'Kas/Bank');

  if (!cashAccount) {
    throw new Error('Akun kas/bank simpanan tidak ditemukan.');
  }
  if (cashAccount.type !== 'ASSET' || !cashAccount.is_active || !cashAccount.is_postable) {
    throw new Error('Akun kas/bank simpanan harus bertipe aset, aktif, dan postable.');
  }

  const isInterestWithdrawal = (
    transaction.transaction_type === 'WITHDRAWAL' &&
    transaction.withdrawal_source === 'INTEREST'
  );
  const savingAccountCandidate = getCooperativeSavingAccountCandidate(transaction.saving_type);
  const savingAccountLabel = getCooperativeSavingAccountLabel(transaction.saving_type);
  const savingAccount = isInterestWithdrawal
    ? undefined
    : (
        tryGetPostableAccount(accounts, savingAccountCandidate)
        ?? getPostableAccount(accounts, ACCOUNT_CANDIDATES.cooperativeMemberSavings, 'Simpanan Anggota')
      );
  const interestExpenseAccount = isInterestWithdrawal
    ? (
        tryGetPostableAccount(accounts, ACCOUNT_CANDIDATES.cooperativeSavingInterestExpense)
        ?? getPostableAccount(accounts, ACCOUNT_CANDIDATES.otherExpense, 'Beban Jasa Simpanan')
      )
    : undefined;
  const lines = transaction.transaction_type === 'DEPOSIT'
    ? [
        createDebitLine(cashAccount, amount, 'Kas/bank bertambah dari setoran simpanan anggota'),
        createCreditLine(savingAccount!, amount, `Kewajiban ${savingAccountLabel.toLowerCase()} bertambah`),
      ]
    : isInterestWithdrawal
      ? [
          createDebitLine(interestExpenseAccount!, amount, 'Beban jasa simpanan anggota'),
          createCreditLine(cashAccount, amount, 'Kas/bank berkurang karena pengambilan jasa simpanan'),
        ]
    : [
        createDebitLine(savingAccount!, amount, `Kewajiban ${savingAccountLabel.toLowerCase()} berkurang`),
        createCreditLine(cashAccount, amount, `Kas/bank berkurang karena penarikan ${savingAccountLabel.toLowerCase()}`),
      ];

  return postBalancedJournalEntry({
    source_type: 'COOPERATIVE_SAVING',
    source_id: transaction.id,
    source_number: transaction.member_number,
    source_event: getCooperativeSavingSourceEvent(transaction),
    entry_date: transaction.transaction_date,
    description: isInterestWithdrawal
      ? `Pengambilan jasa simpanan ${transaction.saving_type} ${transaction.member_number} - ${transaction.member_name}`
      : `${transaction.transaction_type === 'DEPOSIT' ? 'Setoran' : 'Penarikan'} simpanan ${transaction.saving_type} ${transaction.member_number} - ${transaction.member_name}`,
    lines: lines.filter((line): line is JournalLineDraft => Boolean(line)),
    actor,
  });
};

export const postCooperativeSavingOpeningBalanceJournal = async (
  transaction: CooperativeSavingTransaction,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => {
  if (transaction.status !== 'POSTED') return undefined;
  if (transaction.transaction_type !== 'OPENING_BALANCE') return undefined;

  const entryDate = await getOpeningBalanceJournalDate(transaction.transaction_date);
  if (!entryDate) return undefined;

  const amount = amountOrZero(transaction.amount);
  if (amount <= 0) return undefined;

  const accounts = await db.chartOfAccounts.toArray();
  const openingEquityAccount = getPostableAccount(
    accounts,
    ACCOUNT_CANDIDATES.cooperativeOpeningBalanceEquity,
    'Ekuitas/Saldo Awal Koperasi',
  );
  const savingAccount = (
    tryGetPostableAccount(accounts, getCooperativeSavingAccountCandidate(transaction.saving_type))
    ?? getPostableAccount(accounts, ACCOUNT_CANDIDATES.cooperativeMemberSavings, 'Simpanan Anggota')
  );
  const savingAccountLabel = getCooperativeSavingAccountLabel(transaction.saving_type);

  return postOpeningBalanceSourceJournal({
    source_id: transaction.id,
    source_number: transaction.member_number,
    source_event: SOURCE_EVENTS.COOPERATIVE_SAVING_OPENING_BALANCE_POSTED,
    entry_date: entryDate,
    description: `Saldo awal simpanan ${transaction.saving_type} ${transaction.member_number} - ${transaction.member_name}`,
    lines: [
      createDebitLine(openingEquityAccount, amount, 'Saldo awal ekuitas berkurang untuk kewajiban simpanan anggota'),
      createCreditLine(savingAccount, amount, `Saldo awal kewajiban ${savingAccountLabel.toLowerCase()}`),
    ].filter((line): line is JournalLineDraft => Boolean(line)),
    actor,
  });
};

export const reverseCooperativeSavingTransactionJournal = async (
  transaction: CooperativeSavingTransaction,
  reason: string,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
  entryDate?: string,
) => {
  const sourceEvent = getCooperativeSavingSourceEvent(transaction);
  if (!sourceEvent) return [];

  if (transaction.transaction_type === 'OPENING_BALANCE') {
    return reverseOpeningBalanceSourceJournal({
      source_id: transaction.id,
      source_event: sourceEvent,
      reason,
      entry_date: entryDate,
      actor,
    });
  }

  return reverseJournalEntriesForSource({
    source_type: 'COOPERATIVE_SAVING',
    source_id: transaction.id,
    source_event: sourceEvent,
    reason,
    entry_date: entryDate,
    actor,
  });
};

export const postCooperativeLoanDisbursementJournal = async (
  loan: CooperativeLoan,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => {
  if (loan.status !== 'DISBURSED') return undefined;
  if (!loan.disbursed_at) return undefined;
  if (!await isGeneralLedgerPostingEnabled(loan.disbursed_at)) return undefined;

  const amount = amountOrZero(loan.principal_amount);
  const adminFeeAmount = amountOrZero(loan.admin_fee_amount);
  const mandatorySavingAmount = amountOrZero(loan.mandatory_saving_amount);
  const shouldDeductOnDisbursement = loan.deduction_method === 'DEDUCT_ON_DISBURSEMENT';
  const cashDisbursementAmount = shouldDeductOnDisbursement
    ? amountOrZero(loan.net_disbursement_amount ?? amount - adminFeeAmount - mandatorySavingAmount)
    : amount;
  if (amount <= 0) return undefined;

  const accounts = await db.chartOfAccounts.toArray();
  const cashAccount = loan.cash_account_id
    ? accounts.find((account) => account.id === loan.cash_account_id)
    : getPostableAccount(accounts, getCashAccountCandidate(loan.payment_method), 'Kas/Bank');

  if (!cashAccount) {
    throw new Error('Akun kas/bank pencairan pinjaman tidak ditemukan.');
  }
  if (cashAccount.type !== 'ASSET' || !cashAccount.is_active || !cashAccount.is_postable) {
    throw new Error('Akun kas/bank pencairan pinjaman harus bertipe aset, aktif, dan postable.');
  }

  const receivableAccount = getPostableAccount(
    accounts,
    ACCOUNT_CANDIDATES.cooperativeLoanReceivable,
    'Piutang Pinjaman Anggota',
  );
  const adminIncomeAccount = adminFeeAmount > 0
    ? getPostableAccount(
        accounts,
        ACCOUNT_CANDIDATES.cooperativeLoanAdminIncome,
        'Pendapatan Administrasi Pinjaman',
      )
    : undefined;
  const memberSavingAccount = mandatorySavingAmount > 0
    ? getPostableAccount(
        accounts,
        ACCOUNT_CANDIDATES.cooperativeMemberSavingsWajib,
        'Simpanan Wajib Anggota',
      )
    : undefined;

  return postBalancedJournalEntry({
    source_type: 'COOPERATIVE_LOAN',
    source_id: loan.id,
    source_number: loan.loan_number,
    source_event: SOURCE_EVENTS.COOPERATIVE_LOAN_DISBURSED,
    entry_date: loan.disbursed_at,
    description: `Pencairan pinjaman ${loan.loan_number} ${loan.member_number} - ${loan.member_name}`,
    lines: [
      createDebitLine(receivableAccount, amount, 'Piutang pinjaman anggota bertambah'),
      createCreditLine(cashAccount, cashDisbursementAmount, 'Kas/bank berkurang karena pencairan pinjaman anggota'),
      adminIncomeAccount
        ? createCreditLine(adminIncomeAccount, adminFeeAmount, 'Pendapatan administrasi pinjaman')
        : undefined,
      memberSavingAccount
        ? createCreditLine(memberSavingAccount, mandatorySavingAmount, 'Simpanan wajib anggota dari potongan pencairan')
        : undefined,
    ].filter((line): line is JournalLineDraft => Boolean(line)),
    actor,
  });
};

export const postCooperativeLoanOpeningBalanceJournal = async (
  loan: CooperativeLoan,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => {
  if (!loan.is_migration) return undefined;
  if (loan.status !== 'DISBURSED' && loan.status !== 'PAID_OFF') return undefined;
  if (!loan.disbursed_at) return undefined;

  const entryDate = await getOpeningBalanceJournalDate(loan.disbursed_at);
  if (!entryDate) return undefined;

  const amount = amountOrZero(loan.outstanding_principal_amount);
  if (amount <= 0) return undefined;

  const accounts = await db.chartOfAccounts.toArray();
  const receivableAccount = getPostableAccount(
    accounts,
    ACCOUNT_CANDIDATES.cooperativeLoanReceivable,
    'Piutang Pinjaman Anggota',
  );
  const openingEquityAccount = getPostableAccount(
    accounts,
    ACCOUNT_CANDIDATES.cooperativeOpeningBalanceEquity,
    'Ekuitas/Saldo Awal Koperasi',
  );

  return postOpeningBalanceSourceJournal({
    source_id: loan.id,
    source_number: loan.loan_number,
    source_event: SOURCE_EVENTS.COOPERATIVE_LOAN_OPENING_BALANCE_POSTED,
    entry_date: entryDate,
    description: `Saldo awal pinjaman ${loan.loan_number} ${loan.member_number} - ${loan.member_name}`,
    lines: [
      createDebitLine(receivableAccount, amount, 'Saldo awal piutang pinjaman anggota'),
      createCreditLine(openingEquityAccount, amount, 'Saldo awal ekuitas dari piutang pinjaman anggota'),
    ].filter((line): line is JournalLineDraft => Boolean(line)),
    actor,
  });
};

export const reverseCooperativeLoanDisbursementJournal = async (
  loan: CooperativeLoan,
  reason: string,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
  entryDate?: string,
) => reverseJournalEntriesForSource({
  source_type: 'COOPERATIVE_LOAN',
  source_id: loan.id,
  source_event: SOURCE_EVENTS.COOPERATIVE_LOAN_DISBURSED,
  reason,
  entry_date: entryDate,
  actor,
});

export const postCooperativeLoanPaymentJournal = async (
  payment: CooperativeLoanPayment,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => {
  if (payment.status !== 'POSTED') return undefined;
  if (payment.payment_type === 'REVERSAL' || payment.reversal_of_payment_id) return undefined;
  if (!await isGeneralLedgerPostingEnabled(payment.payment_date)) return undefined;

  const amount = amountOrZero(payment.amount);
  if (amount <= 0) return undefined;

  const accounts = await db.chartOfAccounts.toArray();
  const cashAccount = payment.cash_account_id
    ? accounts.find((account) => account.id === payment.cash_account_id)
    : getPostableAccount(accounts, getCashAccountCandidate(payment.payment_method), 'Kas/Bank');

  if (!cashAccount) {
    throw new Error('Akun kas/bank pembayaran angsuran tidak ditemukan.');
  }
  if (cashAccount.type !== 'ASSET' || !cashAccount.is_active || !cashAccount.is_postable) {
    throw new Error('Akun kas/bank pembayaran angsuran harus bertipe aset, aktif, dan postable.');
  }

  const receivableAccount = getPostableAccount(
    accounts,
    ACCOUNT_CANDIDATES.cooperativeLoanReceivable,
    'Piutang Pinjaman Anggota',
  );
  const interestIncomeAccount = getPostableAccount(
    accounts,
    ACCOUNT_CANDIDATES.cooperativeLoanInterestIncome,
    'Pendapatan Bunga Pinjaman Anggota',
  );
  const penaltyIncomeAccount = getPostableAccount(
    accounts,
    ACCOUNT_CANDIDATES.cooperativeLoanPenaltyIncome,
    'Pendapatan Denda Pinjaman Anggota',
  );

  return postBalancedJournalEntry({
    source_type: 'COOPERATIVE_LOAN',
    source_id: payment.id,
    source_number: payment.payment_number,
    source_event: SOURCE_EVENTS.COOPERATIVE_LOAN_PAYMENT_POSTED,
    entry_date: payment.payment_date,
    description: `Pembayaran angsuran ${payment.payment_number} untuk ${payment.loan_number}`,
    lines: [
      createDebitLine(cashAccount, amount, 'Kas/bank bertambah dari pembayaran angsuran'),
      createCreditLine(receivableAccount, payment.principal_amount, 'Piutang pinjaman anggota berkurang'),
      createCreditLine(interestIncomeAccount, payment.interest_amount, 'Pendapatan bunga pinjaman anggota'),
      createCreditLine(penaltyIncomeAccount, payment.penalty_amount, 'Pendapatan denda pinjaman anggota'),
    ].filter((line): line is JournalLineDraft => Boolean(line)),
    actor,
  });
};

export const reverseCooperativeLoanPaymentJournal = async (
  payment: CooperativeLoanPayment,
  reason: string,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
  entryDate?: string,
) => {
  return reverseJournalEntriesForSource({
    source_type: 'COOPERATIVE_LOAN',
    source_id: payment.id,
    source_event: SOURCE_EVENTS.COOPERATIVE_LOAN_PAYMENT_POSTED,
    reason,
    entry_date: entryDate,
    actor,
  });
};

export const postCooperativeIptwJournal = async (
  transaction: FinanceTransaction,
  payment: CooperativeLoanPayment,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => {
  if (
    transaction.type !== 'EXPENSE' ||
    transaction.category !== FINANCE_CATEGORIES.KSP_IPTW ||
    transaction.amount <= 0
  ) {
    return undefined;
  }
  if (!await isGeneralLedgerPostingEnabled(transaction.created_at)) return undefined;

  const accounts = await db.chartOfAccounts.toArray();
  const cashAccount = transaction.cash_account_id
    ? accounts.find((account) => account.id === transaction.cash_account_id)
    : getPostableAccount(accounts, getCashAccountCandidate(transaction.payment_method), 'Kas/Bank');
  if (!cashAccount) {
    throw new Error('Akun kas/bank pembayaran IPTW tidak ditemukan.');
  }
  if (cashAccount.type !== 'ASSET' || !cashAccount.is_active || !cashAccount.is_postable) {
    throw new Error('Akun kas/bank pembayaran IPTW harus bertipe aset, aktif, dan postable.');
  }

  const expenseAccount = tryGetPostableAccount(accounts, ACCOUNT_CANDIDATES.cooperativeIptwExpense)
    ?? getPostableAccount(accounts, ACCOUNT_CANDIDATES.otherExpense, 'Beban IPTW');

  return postBalancedJournalEntry({
    source_type: 'COOPERATIVE_LOAN',
    source_id: transaction.id,
    source_number: payment.payment_number,
    source_event: SOURCE_EVENTS.COOPERATIVE_IPTW_PAID,
    entry_date: transaction.created_at,
    description: transaction.description,
    lines: [
      createDebitLine(expenseAccount, transaction.amount, 'Beban IPTW anggota'),
      createCreditLine(cashAccount, transaction.amount, 'Kas/bank berkurang karena pembayaran IPTW'),
    ].filter((line): line is JournalLineDraft => Boolean(line)),
    actor,
  });
};

export const reverseCooperativeIptwJournal = async (
  transaction: FinanceTransaction,
  reason: string,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
  entryDate?: string,
) => reverseJournalEntriesForSource({
  source_type: 'COOPERATIVE_LOAN',
  source_id: transaction.id,
  source_event: SOURCE_EVENTS.COOPERATIVE_IPTW_PAID,
  reason,
  entry_date: entryDate,
  actor,
});

export const reverseSalesInvoiceJournal = async (
  document: SalesDocument,
  reason: string,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => {
  return reverseJournalEntriesForSource({
    source_type: 'SALES_INVOICE',
    source_id: document.id,
    source_event: SOURCE_EVENTS.SALES_INVOICE_ISSUED,
    reason,
    actor,
  });
};

export const postSalesReturnIssuedJournal = async (
  salesReturn: SalesReturn,
  items: SalesReturnItem[] = [],
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => {
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
    const sourceDocument = !hasTaxAccountSnapshot(salesReturn) && salesReturn.source_type !== 'POS_TRANSACTION'
      ? await db.salesDocuments.get(salesReturn.source_id)
      : undefined;
    const taxAccount = getSalesTaxAccount(accounts, sourceDocument ?? salesReturn);
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
    actor,
  });
};

export const reverseSalesReturnJournal = async (
  salesReturn: SalesReturn,
  reason: string,
  actor?: Pick<AuthUser, 'id' | 'name'> | null,
) => {
  return reverseJournalEntriesForSource({
    source_type: 'SALES_RETURN',
    source_id: salesReturn.id,
    source_event: SOURCE_EVENTS.SALES_RETURN_ISSUED,
    reason,
    actor,
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
  const matchesDate = (!start || entry.entry_date >= start) && (!end || entry.entry_date <= end);
  const matchesSourceType = !filters.sourceTypes?.length || filters.sourceTypes.includes(entry.source_type);
  const matchesSourceEvent = !filters.sourceEvents?.length || (
    Boolean(entry.source_event) && filters.sourceEvents.includes(entry.source_event as string)
  );
  const matchesClosing = filters.includeClosingEntries !== false || entry.source_type !== 'CLOSING_JOURNAL';

  return matchesDate && matchesSourceType && matchesSourceEvent && matchesClosing;
};

interface JournalEntryFilterMetadata {
  contactIds: Set<string>;
  currencyCodes: Set<string>;
}

const normalizeFilterCode = (value?: string) => value?.trim().toUpperCase();

const createMetadata = (input: { contactId?: string; currencyCode?: string } = {}): JournalEntryFilterMetadata => {
  const metadata: JournalEntryFilterMetadata = {
    contactIds: new Set(),
    currencyCodes: new Set(),
  };
  const contactId = input.contactId?.trim();
  const currencyCode = normalizeFilterCode(input.currencyCode);

  if (contactId) metadata.contactIds.add(contactId);
  if (currencyCode) metadata.currencyCodes.add(currencyCode);

  return metadata;
};

const addMetadata = (
  target: JournalEntryFilterMetadata,
  source?: { contact_id?: string; member_contact_id?: string; currency_code?: string; base_currency_code?: string },
) => {
  const contactId = source?.contact_id?.trim() || source?.member_contact_id?.trim();
  const currencyCode = normalizeFilterCode(source?.currency_code ?? source?.base_currency_code);

  if (contactId) target.contactIds.add(contactId);
  if (currencyCode) target.currencyCodes.add(currencyCode);
};

const sourceNeedsMetadataLookup = (entry: JournalEntry) => Boolean(entry.source_id);

const getEntrySourceMetadataMap = async (
  entries: JournalEntry[],
): Promise<Map<string, JournalEntryFilterMetadata>> => {
  const metadataByEntryId = new Map<string, JournalEntryFilterMetadata>();
  const idsBySourceType = entries.reduce<Record<string, Set<string>>>((acc, entry) => {
    if (!sourceNeedsMetadataLookup(entry)) return acc;

    acc[entry.source_type] = acc[entry.source_type] ?? new Set<string>();
    acc[entry.source_type].add(entry.source_id as string);
    return acc;
  }, {});
  const getIds = (sourceType: JournalSourceType) => Array.from(idsBySourceType[sourceType] ?? []);
  const [
    transactions,
    salesDocuments,
    salesInvoicePayments,
    salesOverpaymentSettlements,
    salesReturns,
    purchaseDocuments,
    purchaseInvoicePayments,
    openingBalanceLines,
  ] = await Promise.all([
    db.transactions.bulkGet(getIds('POS_TRANSACTION')),
    db.salesDocuments.bulkGet([
      ...getIds('SALES_INVOICE'),
      ...getIds('SALES_INVOICE_PAYMENT'),
    ]),
    db.salesInvoicePayments.bulkGet([
      ...getIds('SALES_INVOICE_PAYMENT'),
      ...getIds('OPENING_BALANCE'),
    ]),
    db.salesOverpaymentSettlements.bulkGet(getIds('SALES_OVERPAYMENT_SETTLEMENT')),
    db.salesReturns.bulkGet(getIds('SALES_RETURN')),
    db.purchaseDocuments.bulkGet([
      ...getIds('PURCHASE_INVOICE'),
      ...getIds('PURCHASE_INVOICE_PAYMENT'),
    ]),
    db.purchaseInvoicePayments.bulkGet([
      ...getIds('PURCHASE_INVOICE_PAYMENT'),
      ...getIds('OPENING_BALANCE'),
    ]),
    db.openingBalanceLines.toArray(),
  ]);
  const transactionById = new Map(transactions.filter(Boolean).map((item) => [item!.id, item!]));
  const salesDocumentById = new Map(salesDocuments.filter(Boolean).map((item) => [item!.id, item!]));
  const salesPaymentById = new Map(salesInvoicePayments.filter(Boolean).map((item) => [item!.id, item!]));
  const salesOverpaymentSettlementById = new Map(salesOverpaymentSettlements.filter(Boolean).map((item) => [item!.id, item!]));
  const salesReturnById = new Map(salesReturns.filter(Boolean).map((item) => [item!.id, item!]));
  const purchaseDocumentById = new Map(purchaseDocuments.filter(Boolean).map((item) => [item!.id, item!]));
  const purchasePaymentById = new Map(purchaseInvoicePayments.filter(Boolean).map((item) => [item!.id, item!]));
  const openingLinesByBatchId = openingBalanceLines.reduce<Map<string, OpeningBalanceLine[]>>((acc, line) => {
    const current = acc.get(line.batch_id) ?? [];
    current.push(line);
    acc.set(line.batch_id, current);
    return acc;
  }, new Map());

  entries.forEach((entry) => {
    const metadata = createMetadata();
    const sourceId = entry.source_id;
    if (!sourceId) {
      metadataByEntryId.set(entry.id, metadata);
      return;
    }

    if (entry.source_type === 'POS_TRANSACTION') {
      addMetadata(metadata, transactionById.get(sourceId));
    } else if (entry.source_type === 'SALES_INVOICE') {
      addMetadata(metadata, salesDocumentById.get(sourceId));
    } else if (entry.source_type === 'SALES_INVOICE_PAYMENT') {
      const payment = salesPaymentById.get(sourceId);
      addMetadata(metadata, payment);
      addMetadata(metadata, payment ? salesDocumentById.get(payment.sales_document_id) : salesDocumentById.get(sourceId));
    } else if (entry.source_type === 'SALES_OVERPAYMENT_SETTLEMENT') {
      const settlement = salesOverpaymentSettlementById.get(sourceId);
      addMetadata(metadata, settlement);
      addMetadata(metadata, settlement ? salesPaymentById.get(settlement.source_payment_id) : undefined);
    } else if (entry.source_type === 'SALES_RETURN') {
      const salesReturn = salesReturnById.get(sourceId);
      addMetadata(metadata, salesReturn);
      addMetadata(metadata, salesReturn?.source_id ? salesDocumentById.get(salesReturn.source_id) : undefined);
    } else if (entry.source_type === 'PURCHASE_INVOICE') {
      addMetadata(metadata, purchaseDocumentById.get(sourceId));
    } else if (entry.source_type === 'PURCHASE_INVOICE_PAYMENT') {
      const payment = purchasePaymentById.get(sourceId);
      addMetadata(metadata, payment);
      addMetadata(metadata, payment ? purchaseDocumentById.get(payment.purchase_document_id) : purchaseDocumentById.get(sourceId));
    } else if (entry.source_type === 'OPENING_BALANCE') {
      const salesPayment = salesPaymentById.get(sourceId);
      const purchasePayment = purchasePaymentById.get(sourceId);
      addMetadata(metadata, salesPayment);
      addMetadata(metadata, purchasePayment);
      openingLinesByBatchId.get(sourceId)?.forEach((line) => {
        addMetadata(metadata, {
          contact_id: line.contact_id,
          currency_code: line.currency_code,
          base_currency_code: line.base_currency_code,
        });
      });
    }

    metadataByEntryId.set(entry.id, metadata);
  });

  return metadataByEntryId;
};

const entryMetadataMatchesFilters = (
  metadata: JournalEntryFilterMetadata | undefined,
  filters: GeneralLedgerReportFilters,
) => {
  const contactId = filters.contactId?.trim();
  const currencyCode = normalizeFilterCode(filters.currencyCode);

  if (contactId && !metadata?.contactIds.has(contactId)) return false;
  if (currencyCode && !metadata?.currencyCodes.has(currencyCode)) return false;

  return true;
};

export const getJournalEntriesWithLines = async (
  filters: GeneralLedgerReportFilters = {},
): Promise<JournalEntryWithLines[]> => {
  const dateMatchedEntries = (await db.journalEntries.orderBy('entry_date').reverse().toArray())
    .filter((entry) => entryMatchesFilters(entry, filters));
  const metadataByEntryId = filters.contactId || filters.currencyCode
    ? await getEntrySourceMetadataMap(dateMatchedEntries)
    : undefined;
  const entries = dateMatchedEntries
    .filter((entry) => entryMetadataMatchesFilters(metadataByEntryId?.get(entry.id), filters));
  const entryIds = new Set(entries.map((entry) => entry.id));
  const lines = (await db.journalEntryLines.toArray())
    .filter((line) => entryIds.has(line.journal_entry_id))
    .filter((line) => !filters.accountId || line.account_id === filters.accountId)
    .filter((line) => !filters.departmentId || line.department_id === filters.departmentId);
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
    .filter((entry) => entry.status === 'POSTED' || entry.status === 'REVERSED')
    .flatMap((entry) => entry.lines.map((line) => ({ entry, line })));
};

const getAccountBalance = (
  debit: number,
  credit: number,
  normalBalance: AccountNormalBalance,
) => normalBalance === 'DEBIT'
  ? roundCurrency(debit - credit)
  : roundCurrency(credit - debit);

const isCostOfRevenueAccount = (line: Pick<JournalEntryLine, 'account_id' | 'account_code' | 'account_name'>) => (
  ACCOUNT_CANDIDATES.cogs.ids.includes(line.account_id) ||
  ACCOUNT_CANDIDATES.cogs.codes.includes(line.account_code) ||
  /^5\d{3}/.test(line.account_code) ||
  line.account_name.toLowerCase().includes('hpp') ||
  line.account_name.toLowerCase().includes('harga pokok')
);

export const getTrialBalanceReport = async (
  filters: GeneralLedgerReportFilters = {},
): Promise<TrialBalanceReport> => {
  const startDate = filters.startDate ? filters.startDate.slice(0, 10) : undefined;
  const [accounts, reportLines] = await Promise.all([
    db.chartOfAccounts.orderBy('code').toArray(),
    getPostedReportLines({
      ...filters,
      startDate: undefined,
    }),
  ]);
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const movementByAccountId = new Map<string, {
    openingDebit: number;
    openingCredit: number;
    movementDebit: number;
    movementCredit: number;
    line: JournalEntryLine;
  }>();

  reportLines.forEach(({ entry, line }) => {
    const current = movementByAccountId.get(line.account_id) ?? {
      openingDebit: 0,
      openingCredit: 0,
      movementDebit: 0,
      movementCredit: 0,
      line,
    };
    if (startDate && entry.entry_date.slice(0, 10) < startDate) {
      current.openingDebit += line.debit;
      current.openingCredit += line.credit;
    } else {
      current.movementDebit += line.debit;
      current.movementCredit += line.credit;
    }
    movementByAccountId.set(line.account_id, current);
  });

  const rows = Array.from(movementByAccountId.entries())
    .map(([accountId, movement]) => {
      const account = accountById.get(accountId);
      const normalBalance = account?.normal_balance ?? getAccountNormalBalance(movement.line.account_type);
      const openingBalance = getAccountBalance(movement.openingDebit, movement.openingCredit, normalBalance);
      const endingBalance = getAccountBalance(
        movement.openingDebit + movement.movementDebit,
        movement.openingCredit + movement.movementCredit,
        normalBalance,
      );
      const isNormalDebit = normalBalance === 'DEBIT';

      return {
        account_id: accountId,
        account_code: account?.code ?? movement.line.account_code,
        account_name: account?.name ?? movement.line.account_name,
        account_type: account?.type ?? movement.line.account_type,
        normal_balance: normalBalance,
        opening_balance: openingBalance,
        debit_movement: roundCurrency(movement.movementDebit),
        credit_movement: roundCurrency(movement.movementCredit),
        ending_balance: endingBalance,
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
  const reportLines = await getPostedReportLines({
    ...filters,
    includeClosingEntries: false,
  });
  const rowsBySection = new Map<IncomeStatementSectionKey, Map<string, IncomeStatementAccountRow>>();
  const addAccountRow = (
    sectionKey: IncomeStatementSectionKey,
    line: JournalEntryLine,
    amount: number,
  ) => {
    const rows = rowsBySection.get(sectionKey) ?? new Map<string, IncomeStatementAccountRow>();
    const current = rows.get(line.account_id) ?? {
      account_id: line.account_id,
      account_code: line.account_code,
      account_name: line.account_name,
      account_type: line.account_type,
      amount: 0,
    };
    current.amount = roundCurrency(current.amount + amount);
    rows.set(line.account_id, current);
    rowsBySection.set(sectionKey, rows);
  };
  const totals = reportLines.reduce((acc, { line }) => {
    const normalBalance = getAccountNormalBalance(line.account_type);
    const balance = getAccountBalance(line.debit, line.credit, normalBalance);

    if (line.account_type === 'REVENUE') {
      acc.revenue += balance;
      addAccountRow('REVENUE', line, balance);
    } else if (line.account_type === 'CONTRA_REVENUE') {
      acc.contra_revenue += balance;
      addAccountRow('CONTRA_REVENUE', line, balance);
    } else if (line.account_type === 'EXPENSE') {
      acc.expense += balance;
      if (isCostOfRevenueAccount(line)) {
        acc.cost_of_revenue += balance;
        addAccountRow('COST_OF_REVENUE', line, balance);
      } else {
        acc.operating_expense += balance;
        addAccountRow('OPERATING_EXPENSE', line, balance);
      }
    }

    return acc;
  }, { revenue: 0, contra_revenue: 0, cost_of_revenue: 0, operating_expense: 0, expense: 0 });
  const revenue = roundCurrency(totals.revenue);
  const contraRevenue = roundCurrency(totals.contra_revenue);
  const costOfRevenue = roundCurrency(totals.cost_of_revenue);
  const operatingExpense = roundCurrency(totals.operating_expense);
  const expense = roundCurrency(totals.expense);
  const netRevenue = roundCurrency(revenue - contraRevenue);
  const grossProfit = roundCurrency(netRevenue - costOfRevenue);
  const createSection = (key: IncomeStatementSectionKey, total: number): IncomeStatementSection => ({
    key,
    total,
    rows: Array.from(rowsBySection.get(key)?.values() ?? [])
      .map((row) => ({ ...row, amount: roundCurrency(row.amount) }))
      .filter((row) => row.amount !== 0)
      .sort((left, right) => left.account_code.localeCompare(right.account_code)),
  });

  return {
    revenue,
    contra_revenue: contraRevenue,
    net_revenue: netRevenue,
    cost_of_revenue: costOfRevenue,
    gross_profit: grossProfit,
    operating_expense: operatingExpense,
    expense,
    net_income: roundCurrency(grossProfit - operatingExpense),
    sections: [
      createSection('REVENUE', revenue),
      createSection('CONTRA_REVENUE', contraRevenue),
      createSection('COST_OF_REVENUE', costOfRevenue),
      createSection('OPERATING_EXPENSE', operatingExpense),
    ],
  };
};

const getBalanceSheetSignedAmount = (row: TrialBalanceRow) => {
  if (row.account_type === 'ASSET' || row.account_type === 'EXPENSE' || row.account_type === 'CONTRA_REVENUE') {
    return roundCurrency(row.debit_balance - row.credit_balance);
  }

  return roundCurrency(row.credit_balance - row.debit_balance);
};

interface BalanceSheetNode extends BalanceSheetTreeRow {
  raw_amount: number;
  children: BalanceSheetNode[];
}

const createBalanceSheetNode = (
  account: ChartOfAccount,
  rawAmount: number,
): BalanceSheetNode => ({
  id: account.id,
  row_type: 'account',
  account_id: account.id,
  account_code: account.code,
  account_name: account.name,
  account_type: account.type,
  normal_balance: account.normal_balance,
  amount: 0,
  raw_amount: rawAmount,
  level: 0,
  is_postable: account.is_postable,
  children: [],
});

const pruneBalanceSheetNodes = (nodes: BalanceSheetNode[]): BalanceSheetTreeRow[] => (
  nodes
    .reduce<BalanceSheetTreeRow[]>((acc, node) => {
      const children = pruneBalanceSheetNodes(node.children);
      const shouldKeep = Math.abs(node.amount) > JOURNAL_TOLERANCE || children.length > 0;
      if (!shouldKeep) return acc;

      const row: BalanceSheetTreeRow = {
        id: node.id,
        row_type: node.row_type,
        account_id: node.account_id,
        account_code: node.account_code,
        account_name: node.account_name,
        account_type: node.account_type,
        normal_balance: node.normal_balance,
        amount: node.amount,
        level: node.level,
        is_postable: node.is_postable,
        children: children.length > 0 ? children : undefined,
      };
      acc.push(row);
      return acc;
    }, [])
);

const buildBalanceSheetAccountRows = (
  accounts: ChartOfAccount[],
  trialRows: TrialBalanceRow[],
  accountType: BalanceSheetSectionKey,
): BalanceSheetTreeRow[] => {
  const trialRowByAccountId = new Map(trialRows.map((row) => [row.account_id, row]));
  const nodeMap = new Map<string, BalanceSheetNode>();

  accounts
    .filter((account) => account.is_active && account.type === accountType)
    .sort((left, right) => left.code.localeCompare(right.code, undefined, { numeric: true, sensitivity: 'base' }))
    .forEach((account) => {
      const trialRow = trialRowByAccountId.get(account.id);
      nodeMap.set(account.id, createBalanceSheetNode(account, trialRow ? getBalanceSheetSignedAmount(trialRow) : 0));
    });

  trialRows
    .filter((row) => row.account_type === accountType && !nodeMap.has(row.account_id))
    .forEach((row) => {
      nodeMap.set(row.account_id, createBalanceSheetNode({
        id: row.account_id,
        code: row.account_code,
        name: row.account_name,
        type: row.account_type,
        normal_balance: row.normal_balance,
        is_postable: true,
        is_system: false,
        is_active: true,
        created_at: '',
        updated_at: '',
      }, getBalanceSheetSignedAmount(row)));
    });

  const roots: BalanceSheetNode[] = [];
  nodeMap.forEach((node) => {
    const parent = node.account_id
      ? nodeMap.get(accounts.find((account) => account.id === node.account_id)?.parent_id ?? '')
      : undefined;

    if (parent) {
      node.level = parent.level + 1;
      parent.children.push(node);
      return;
    }

    roots.push(node);
  });

  const sortAndRollup = (nodes: BalanceSheetNode[], level = 0): number => nodes
    .sort((left, right) => (left.account_code ?? '').localeCompare(right.account_code ?? '', undefined, {
      numeric: true,
      sensitivity: 'base',
    }))
    .reduce((sum, node) => {
      node.level = level;
      const childAmount = sortAndRollup(node.children, level + 1);
      node.amount = roundCurrency(node.raw_amount + childAmount);
      return roundCurrency(sum + node.amount);
    }, 0);

  sortAndRollup(roots);

  return pruneBalanceSheetNodes(roots);
};

const createBalanceSheetSection = (
  key: BalanceSheetSectionKey,
  rows: BalanceSheetTreeRow[],
  total: number,
): BalanceSheetSection => ({
  key,
  total,
  rows,
});

export const getBalanceSheetReport = async (
  filters: GeneralLedgerReportFilters = {},
): Promise<BalanceSheetReport> => {
  const [accounts, trialBalance] = await Promise.all([
    db.chartOfAccounts.orderBy('code').toArray(),
    getTrialBalanceReport({
      ...filters,
      startDate: undefined,
      includeClosingEntries: true,
    }),
  ]);
  const totals = trialBalance.rows.reduce((acc, row) => {
    const balance = getBalanceSheetSignedAmount(row);

    if (row.account_type === 'ASSET') {
      acc.assets += balance;
    } else if (row.account_type === 'LIABILITY') {
      acc.liabilities += balance;
    } else if (row.account_type === 'EQUITY') {
      acc.equity += balance;
    } else if (row.account_type === 'REVENUE' || row.account_type === 'CONTRA_REVENUE' || row.account_type === 'EXPENSE') {
      acc.currentIncome += row.account_type === 'REVENUE' ? balance : -balance;
    }

    return acc;
  }, { assets: 0, liabilities: 0, equity: 0, currentIncome: 0 });
  const assets = roundCurrency(totals.assets);
  const liabilities = roundCurrency(totals.liabilities);
  const equity = roundCurrency(totals.equity);
  const currentPeriodIncome = roundCurrency(totals.currentIncome);
  const totalLiabilitiesAndEquity = roundCurrency(liabilities + equity + currentPeriodIncome);
  const difference = roundCurrency(assets - totalLiabilitiesAndEquity);
  const assetRows = buildBalanceSheetAccountRows(accounts, trialBalance.rows, 'ASSET');
  const liabilityRows = buildBalanceSheetAccountRows(accounts, trialBalance.rows, 'LIABILITY');
  const equityRows = buildBalanceSheetAccountRows(accounts, trialBalance.rows, 'EQUITY');
  const currentIncomeRow: BalanceSheetTreeRow = {
    id: 'current-period-income',
    row_type: 'current_income',
    account_name: 'Laba Berjalan',
    amount: currentPeriodIncome,
    level: 0,
  };
  const equitySectionRows = [
    ...equityRows,
    currentIncomeRow,
  ];

  return {
    assets,
    liabilities,
    equity,
    current_period_income: currentPeriodIncome,
    total_liabilities_and_equity: totalLiabilitiesAndEquity,
    difference,
    is_balanced: Math.abs(difference) <= JOURNAL_TOLERANCE,
    sections: [
      createBalanceSheetSection('ASSET', assetRows, assets),
      createBalanceSheetSection('LIABILITY', liabilityRows, liabilities),
      createBalanceSheetSection('EQUITY', equitySectionRows, roundCurrency(equity + currentPeriodIncome)),
    ],
  };
};

// ============================================================================
// Tutup Buku Akhir Tahun (Year-end closing)
// ============================================================================

export interface ClosingJournalPreviewLine {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  debit: number;
  credit: number;
}

export interface ClosingJournalPreview {
  lines: ClosingJournalPreviewLine[];
  retained_earning_account_id: string;
  retained_earning_account_code: string;
  retained_earning_account_name: string;
  net_income_amount: number;
  total_revenue_amount: number;
  total_contra_revenue_amount: number;
  total_expense_amount: number;
  total_debit: number;
  total_credit: number;
  is_balanced: boolean;
}

/**
 * Resolusi akun ekuitas tujuan closing (Saldo Laba / SHU Belum Dibagi, kode 3100).
 * Harus aktif dan postable.
 */
export const getRetainedEarningsAccount = async (): Promise<ChartOfAccount> => {
  const accounts = await db.chartOfAccounts.toArray();
  return getPostableAccount(accounts, ACCOUNT_CANDIDATES.retainedEarnings, 'Saldo Laba');
};

/**
 * Hitung preview jurnal penutup untuk periode berjalan. Setiap akun nominal
 * (REVENUE, CONTRA_REVENUE, EXPENSE) ditutup line-per-line, selisihnya masuk ke
 * akun Saldo Laba/SHU. Report ini mengecualikan jurnal penutup sebelumnya agar
 * angka net income = laba rugi periode.
 */
export const buildClosingJournalPreview = async (
  periodFilters: { startDate: string; endDate: string },
): Promise<ClosingJournalPreview> => {
  const retainedEarningsAccount = await getRetainedEarningsAccount();
  const reportLines = await getPostedReportLines({
    startDate: periodFilters.startDate,
    endDate: periodFilters.endDate,
    includeClosingEntries: false,
  });

  const movementByAccount = new Map<string, {
    account_code: string;
    account_name: string;
    account_type: AccountType;
    debit: number;
    credit: number;
  }>();

  let totalRevenue = 0;
  let totalContraRevenue = 0;
  let totalExpense = 0;

  reportLines.forEach(({ line }) => {
    if (
      line.account_type !== 'REVENUE' &&
      line.account_type !== 'CONTRA_REVENUE' &&
      line.account_type !== 'EXPENSE'
    ) {
      return;
    }

    const current = movementByAccount.get(line.account_id) ?? {
      account_code: line.account_code,
      account_name: line.account_name,
      account_type: line.account_type,
      debit: 0,
      credit: 0,
    };
    current.debit += line.debit;
    current.credit += line.credit;
    movementByAccount.set(line.account_id, current);
  });

  const lines: ClosingJournalPreviewLine[] = [];

  movementByAccount.forEach((movement, accountId) => {
    const net = roundCurrency(movement.debit - movement.credit);
    if (Math.abs(net) < JOURNAL_TOLERANCE) return;

    // Tutup akun dengan posting berlawanan agar saldonya nol.
    const closingDebit = net < 0 ? Math.abs(net) : 0;
    const closingCredit = net > 0 ? net : 0;

    lines.push({
      account_id: accountId,
      account_code: movement.account_code,
      account_name: movement.account_name,
      account_type: movement.account_type,
      debit: closingDebit,
      credit: closingCredit,
    });

    if (movement.account_type === 'REVENUE') {
      totalRevenue = roundCurrency(totalRevenue + (movement.credit - movement.debit));
    } else if (movement.account_type === 'CONTRA_REVENUE') {
      totalContraRevenue = roundCurrency(totalContraRevenue + (movement.debit - movement.credit));
    } else {
      totalExpense = roundCurrency(totalExpense + (movement.debit - movement.credit));
    }
  });

  const netIncome = roundCurrency(totalRevenue - totalContraRevenue - totalExpense);

  // Line penyeimbang ke Saldo Laba / SHU.
  if (Math.abs(netIncome) >= JOURNAL_TOLERANCE) {
    lines.push({
      account_id: retainedEarningsAccount.id,
      account_code: retainedEarningsAccount.code,
      account_name: retainedEarningsAccount.name,
      account_type: retainedEarningsAccount.type,
      debit: netIncome < 0 ? Math.abs(netIncome) : 0,
      credit: netIncome > 0 ? netIncome : 0,
    });
  }

  const totalDebit = roundCurrency(lines.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = roundCurrency(lines.reduce((sum, line) => sum + line.credit, 0));

  return {
    lines,
    retained_earning_account_id: retainedEarningsAccount.id,
    retained_earning_account_code: retainedEarningsAccount.code,
    retained_earning_account_name: retainedEarningsAccount.name,
    net_income_amount: netIncome,
    total_revenue_amount: totalRevenue,
    total_contra_revenue_amount: totalContraRevenue,
    total_expense_amount: totalExpense,
    total_debit: totalDebit,
    total_credit: totalCredit,
    is_balanced: Math.abs(totalDebit - totalCredit) <= JOURNAL_TOLERANCE,
  };
};

/**
 * Buat & post jurnal penutup (`CLOSING_JOURNAL`) untuk periode. Idempotent per
 * period (source_id = period id). Melewati guard periode locked karena closing
 * memang dijalankan saat periode LOCKED — analog dengan opening balance yang
 * melewati guard cutoff. Harus dipanggil di dalam Dexie transaction yang juga
 * mencakup journalEntries & journalEntryLines.
 */
export const createClosingJournalEntry = async ({
  periodId,
  periodName,
  entryDate,
  lines,
  actor,
}: {
  periodId: string;
  periodName: string;
  entryDate: string;
  lines: ClosingJournalPreviewLine[];
  actor?: Pick<AuthUser, 'id' | 'name'> | null;
}): Promise<JournalEntry> => {
  const existingEntry = await getPostedJournalEntryForSource(
    'CLOSING_JOURNAL',
    periodId,
    SOURCE_EVENTS.YEAR_END_CLOSING_POSTED,
  );
  if (existingEntry) {
    return existingEntry;
  }

  const normalizedLines: NormalizedJournalLine[] = lines.map((line) => ({
    account_id: line.account_id,
    account_code: line.account_code,
    account_name: line.account_name,
    account_type: line.account_type,
    debit: roundCurrency(line.debit),
    credit: roundCurrency(line.credit),
    description: `Jurnal penutup ${periodName}`,
  }));

  return createPostedJournalEntry({
    source_type: 'CLOSING_JOURNAL',
    source_id: periodId,
    source_number: periodName,
    source_event: SOURCE_EVENTS.YEAR_END_CLOSING_POSTED,
    entry_date: entryDate,
    description: `Jurnal penutup akhir periode ${periodName}`,
    lines: normalizedLines,
    actor,
  });
};

/**
 * Reversal jurnal penutup untuk keperluan reopen periode. Harus dipanggil di
 * dalam Dexie transaction yang mencakup journalEntries & journalEntryLines.
 */
export const reverseClosingJournalEntry = async ({
  entryId,
  reason,
  entryDate,
  actor,
}: {
  entryId: string;
  reason: string;
  entryDate: string;
  actor?: Pick<AuthUser, 'id' | 'name'> | null;
}): Promise<JournalEntry | undefined> => {
  const entry = await db.journalEntries.get(entryId);
  if (!entry || entry.status !== 'POSTED') {
    return undefined;
  }

  return reverseJournalEntry(entry, reason, entryDate, actor);
};
