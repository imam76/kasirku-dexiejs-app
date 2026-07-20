import { FINANCE_CATEGORIES } from '@/constants/finance';
import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import {
  getCashOrBankAccountForPayment,
  postSalesOverpaymentCashRefundJournal,
  postSalesOverpaymentInvoiceAllocationJournal,
  reverseSalesOverpaymentSettlementJournal,
} from '@/services/generalLedgerService';
import { enqueueFinanceTransactionsSync, withPendingFinanceTransactionSync } from '@/services/financeTransactionSyncService';
import { recalculateSalesInvoicePaidAmount } from '@/services/accountsReceivableService';
import { getIssuedReturnSummaryForSource } from '@/services/salesReturnReadService';
import type {
  AccountsReceivableRow,
  ChartOfAccount,
  FinanceTransaction,
  SalesDocument,
  SalesInvoicePayment,
  SalesOverpaymentRow,
  SalesOverpaymentSettlement,
  SalesOverpaymentSettlementAllocation,
  SalesOverpaymentStatus,
} from '@/types';
import { buildReceivableRows } from '@/utils/accountsReceivable/buildReceivableRows';
import {
  getSalesInvoicePaymentAllocatedAmount,
  getSalesInvoicePaymentOverpaymentAmount,
  roundCurrency,
} from '@/utils/accountsReceivable/paymentAmounts';
import { createSalesOverpaymentSettlementNumber } from '@/utils/salesOverpayments/createSalesOverpaymentSettlementNumber';
import {
  snapshotFromDocumentInput,
  toDocumentCurrencyAmount,
} from '@/utils/documentCurrency';

export interface SalesOverpaymentFilters {
  search?: string;
  status?: SalesOverpaymentStatus | 'ALL';
  contactId?: string;
  paidDateFrom?: string;
  paidDateTo?: string;
}

export interface AllocateSalesOverpaymentInput {
  sourcePaymentId: string;
  settlement_date?: string;
  description?: string;
  department_id?: string;
  project_id?: string;
  notes?: string;
  allocations: Array<{
    target_sales_document_id: string;
    amount: number;
  }>;
}

export interface RefundSalesOverpaymentInput {
  sourcePaymentId: string;
  settlement_date?: string;
  description?: string;
  cash_account_id: string;
  amount: number;
  department_id?: string;
  project_id?: string;
  notes?: string;
}

export interface SalesOverpaymentDetail {
  sourcePayment: SalesInvoicePayment;
  row: SalesOverpaymentRow;
  settlements: SalesOverpaymentSettlement[];
  allocations: SalesOverpaymentSettlementAllocation[];
}

const salesOverpaymentTables = [
  db.salesInvoicePayments,
  db.salesOverpaymentSettlements,
  db.salesOverpaymentSettlementAllocations,
  db.salesDocuments,
  db.salesDocumentItems,
  db.salesReturns,
  db.salesReturnItems,
  db.financeTransactions,
  db.financeBalance,
  db.chartOfAccounts,
  db.departments,
  db.projects,
  db.enabledModules,
  db.generalLedgerSetting,
  db.accountingPeriods,
  db.journalEntries,
  db.journalEntryLines,
  db.activityLogs,
];

const toDateKey = (value: string) => value.slice(0, 10);

const getPaymentNumber = (payment: SalesInvoicePayment) => (
  payment.payment_number || `ARP-${toDateKey(payment.paid_at).replace(/-/g, '')}-${payment.id.slice(0, 8).toUpperCase()}`
);

const getPostedSettlementsForSourcePayment = async (sourcePaymentId: string) => (
  db.salesOverpaymentSettlements
    .where('source_payment_id')
    .equals(sourcePaymentId)
    .filter((settlement) => settlement.status === 'POSTED')
    .toArray()
);

const getUsedAmount = (settlements: SalesOverpaymentSettlement[]) => roundCurrency(
  settlements.reduce((sum, settlement) => sum + Number(settlement.total_amount || 0), 0),
);

const getOverpaymentStatus = (
  payment: SalesInvoicePayment,
  initialAmount: number,
  usedAmount: number,
): SalesOverpaymentStatus => {
  if (payment.status === 'VOIDED') return 'CANCELLED';
  const remainingAmount = roundCurrency(Math.max(0, initialAmount - usedAmount));
  if (remainingAmount <= 0.01) return 'SETTLED';
  if (usedAmount > 0.01) return 'PARTIALLY_USED';
  return 'OPEN';
};

const buildOverpaymentRow = async (payment: SalesInvoicePayment): Promise<SalesOverpaymentRow> => {
  const settlements = await getPostedSettlementsForSourcePayment(payment.id);
  const overpaymentAmount = getSalesInvoicePaymentOverpaymentAmount(payment);
  const usedAmount = getUsedAmount(settlements);
  const remainingAmount = payment.status === 'VOIDED'
    ? 0
    : roundCurrency(Math.max(0, overpaymentAmount - usedAmount));
  const status = getOverpaymentStatus(payment, overpaymentAmount, usedAmount);

  return {
    payment_id: payment.id,
    payment_number: getPaymentNumber(payment),
    paid_at: payment.paid_at,
    source_type: payment.source_type,
    sales_document_id: payment.sales_document_id,
    opening_balance_line_id: payment.opening_balance_line_id,
    opening_balance_batch_id: payment.opening_balance_batch_id,
    document_number: payment.document_number,
    contact_id: payment.contact_id,
    customer_name: payment.customer_name,
    total_payment_amount: roundCurrency(payment.amount),
    allocated_payment_amount: getSalesInvoicePaymentAllocatedAmount(payment),
    overpayment_amount: overpaymentAmount,
    used_amount: usedAmount,
    remaining_amount: remainingAmount,
    status,
    cash_account_id: payment.cash_account_id,
    cash_account_code: payment.cash_account_code,
    cash_account_name: payment.cash_account_name,
    currency_code: payment.currency_code,
    currency_name: payment.currency_name,
    currency_symbol: payment.currency_symbol,
    base_currency_code: payment.base_currency_code,
    exchange_rate: payment.exchange_rate,
  };
};

const isSameCustomer = (
  payment: Pick<SalesInvoicePayment, 'contact_id' | 'customer_name'>,
  document: Pick<SalesDocument, 'contact_id' | 'customer_name'>,
) => {
  if (payment.contact_id) return document.contact_id === payment.contact_id;
  return !document.contact_id && document.customer_name.trim().toLowerCase() === payment.customer_name.trim().toLowerCase();
};

const patchSourcePaymentUsage = async (payment: SalesInvoicePayment) => {
  const row = await buildOverpaymentRow(payment);
  await db.salesInvoicePayments.update(payment.id, {
    overpayment_used_amount: row.used_amount,
    overpayment_remaining_amount: row.remaining_amount,
    overpayment_status: row.status,
    overpayment_settled_at: row.status === 'SETTLED' ? new Date().toISOString() : undefined,
    updated_at: new Date().toISOString(),
  });
  return row;
};

const filterRows = (rows: SalesOverpaymentRow[], filters: SalesOverpaymentFilters = {}) => {
  const query = filters.search?.trim().toLowerCase();

  return rows.filter((row) => {
    const matchesSearch = !query || [
      row.payment_number,
      row.document_number,
      row.customer_name,
    ].some((value) => value.toLowerCase().includes(query));
    const matchesStatus = !filters.status || filters.status === 'ALL' || row.status === filters.status;
    const matchesContact = !filters.contactId || row.contact_id === filters.contactId;
    const dateKey = toDateKey(row.paid_at);
    const matchesDateFrom = !filters.paidDateFrom || dateKey >= filters.paidDateFrom;
    const matchesDateTo = !filters.paidDateTo || dateKey <= filters.paidDateTo;

    return matchesSearch && matchesStatus && matchesContact && matchesDateFrom && matchesDateTo;
  });
};

export const listSalesOverpaymentRows = async (
  filters: SalesOverpaymentFilters = {},
): Promise<SalesOverpaymentRow[]> => {
  const payments = await db.salesInvoicePayments
    .orderBy('paid_at')
    .reverse()
    .filter((payment) => getSalesInvoicePaymentOverpaymentAmount(payment) > 0.01)
    .toArray();
  const rows = await Promise.all(payments.map(buildOverpaymentRow));
  return filterRows(rows, filters);
};

export const getSalesOverpaymentDetail = async (sourcePaymentId: string): Promise<SalesOverpaymentDetail> => {
  const sourcePayment = await db.salesInvoicePayments.get(sourcePaymentId);
  if (!sourcePayment || getSalesInvoicePaymentOverpaymentAmount(sourcePayment) <= 0) {
    throw new Error('Saldo lebih bayar tidak ditemukan.');
  }
  const row = await buildOverpaymentRow(sourcePayment);
  const settlements = await db.salesOverpaymentSettlements
    .where('source_payment_id')
    .equals(sourcePaymentId)
    .reverse()
    .sortBy('settlement_date');
  const settlementIds = settlements.map((settlement) => settlement.id);
  const allocations = settlementIds.length > 0
    ? await db.salesOverpaymentSettlementAllocations.where('settlement_id').anyOf(settlementIds).toArray()
    : [];

  return { sourcePayment, row, settlements, allocations };
};

const buildReceivableRowForInvoice = async (invoiceId: string): Promise<AccountsReceivableRow> => {
  const document = await db.salesDocuments.get(invoiceId);
  if (!document || document.type !== 'SALES_INVOICE' || document.status !== 'ISSUED') {
    throw new Error('Sales Invoice target tidak ditemukan atau belum terbit.');
  }

  const [payments, returnSummary] = await Promise.all([
    db.salesInvoicePayments.where('sales_document_id').equals(invoiceId).toArray(),
    getIssuedReturnSummaryForSource('SALES_INVOICE', invoiceId),
  ]);
  const row = buildReceivableRows({
    documents: [document],
    payments,
    returnSummariesByInvoiceId: { [invoiceId]: returnSummary },
  })[0];
  if (!row) throw new Error('Piutang invoice target tidak ditemukan.');
  return row;
};

export const listSalesOverpaymentTargetInvoices = async (sourcePaymentId: string): Promise<AccountsReceivableRow[]> => {
  const sourcePayment = await db.salesInvoicePayments.get(sourcePaymentId);
  if (!sourcePayment) return [];
  const documents = await db.salesDocuments
    .where('type')
    .equals('SALES_INVOICE')
    .filter((document) => (
      document.status === 'ISSUED' &&
      isSameCustomer(sourcePayment, document) &&
      document.id !== sourcePayment.sales_document_id
    ))
    .toArray();
  const invoiceIds = documents.map((document) => document.id);
  const payments = invoiceIds.length > 0
    ? await db.salesInvoicePayments.where('sales_document_id').anyOf(invoiceIds).toArray()
    : [];
  const returnSummaryEntries = await Promise.all(
    documents.map(async (document) => {
      const summary = await getIssuedReturnSummaryForSource('SALES_INVOICE', document.id);
      return [document.id, summary] as const;
    }),
  );

  return buildReceivableRows({
    documents,
    payments,
    returnSummariesByInvoiceId: Object.fromEntries(returnSummaryEntries),
  }).filter((row) => row.balance_due > 0.01);
};

const getDepartmentSnapshot = async (departmentId?: string) => {
  if (!departmentId) return {};
  const department = await db.departments.get(departmentId);
  if (!department) throw new Error('Department tidak ditemukan.');
  return {
    department_id: department.id,
    department_code: department.code,
    department_name: department.name,
  };
};

const getProjectSnapshot = async (projectId?: string) => {
  if (!projectId) return {};
  const project = await db.projects.get(projectId);
  if (!project) throw new Error('Project tidak ditemukan.');
  return {
    project_id: project.id,
    project_code: project.code,
    project_name: project.name,
  };
};

const createCustomerCreditPaymentForTarget = ({
  settlement,
  target,
  amount,
  now,
  createdBy,
  createdByName,
}: {
  settlement: SalesOverpaymentSettlement;
  target: SalesDocument;
  amount: number;
  now: string;
  createdBy?: string;
  createdByName?: string;
}): SalesInvoicePayment => {
  const currencySnapshot = snapshotFromDocumentInput(target, undefined, target.document_date);
  const foreignAmount = toDocumentCurrencyAmount(amount, currencySnapshot);

  return {
    id: crypto.randomUUID(),
    sales_document_id: target.id,
    source_type: 'CUSTOMER_CREDIT_ALLOCATION',
    payment_number: settlement.settlement_number,
    document_number: target.document_number,
    contact_id: target.contact_id,
    customer_name: target.customer_name,
    amount,
    foreign_amount: foreignAmount,
    allocated_amount: amount,
    foreign_allocated_amount: foreignAmount,
    overpayment_amount: 0,
    foreign_overpayment_amount: 0,
    overpayment_used_amount: 0,
    overpayment_remaining_amount: 0,
    overpayment_status: undefined,
    ...currencySnapshot,
    paid_at: settlement.settlement_date,
    overpayment_settlement_id: settlement.id,
    notes: settlement.description,
    status: 'ACTIVE',
    created_by: createdBy,
    created_by_name: createdByName,
    created_at: now,
    updated_at: now,
  };
};

const assertSourcePaymentCanBeSettled = async (sourcePaymentId: string) => {
  const sourcePayment = await db.salesInvoicePayments.get(sourcePaymentId);
  if (!sourcePayment || sourcePayment.status !== 'ACTIVE') {
    throw new Error('Penerimaan lebih bayar tidak ditemukan atau sudah dibatalkan.');
  }
  if (sourcePayment.source_type === 'CUSTOMER_CREDIT_ALLOCATION') {
    throw new Error('Payment hasil alokasi tidak bisa menjadi sumber lebih bayar.');
  }
  const overpaymentAmount = getSalesInvoicePaymentOverpaymentAmount(sourcePayment);
  if (overpaymentAmount <= 0.01) {
    throw new Error('Penerimaan ini tidak memiliki saldo lebih bayar.');
  }
  const row = await buildOverpaymentRow(sourcePayment);
  if (row.remaining_amount <= 0.01) {
    throw new Error('Saldo lebih bayar sudah habis digunakan.');
  }

  return { sourcePayment, row };
};

const assertSettlementAmount = (amount: number, availableAmount: number) => {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Nominal settlement harus lebih dari 0.');
  }
  if (amount > availableAmount + 0.01) {
    throw new Error(`Nominal settlement melebihi sisa lebih bayar. Maksimal Rp ${availableAmount}.`);
  }
};

export const allocateSalesOverpaymentToInvoices = async (input: AllocateSalesOverpaymentInput) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');

  const normalizedAllocations = input.allocations
    .map((allocation) => ({
      target_sales_document_id: allocation.target_sales_document_id,
      amount: roundCurrency(Number(allocation.amount || 0)),
    }))
    .filter((allocation) => allocation.target_sales_document_id && allocation.amount > 0);
  if (normalizedAllocations.length === 0) {
    throw new Error('Pilih minimal satu invoice target.');
  }
  const duplicateTargetId = normalizedAllocations.find((allocation, index) => (
    normalizedAllocations.findIndex((item) => item.target_sales_document_id === allocation.target_sales_document_id) !== index
  ));
  if (duplicateTargetId) {
    throw new Error('Invoice target tidak boleh dipilih lebih dari satu kali.');
  }

  const { sourcePayment, row } = await assertSourcePaymentCanBeSettled(input.sourcePaymentId);
  const totalAmount = roundCurrency(normalizedAllocations.reduce((sum, allocation) => sum + allocation.amount, 0));
  assertSettlementAmount(totalAmount, row.remaining_amount);

  const now = new Date().toISOString();
  const settlementDate = input.settlement_date || now;
  const settlementNumber = await createSalesOverpaymentSettlementNumber(new Date(settlementDate));
  const departmentSnapshot = await getDepartmentSnapshot(input.department_id);
  const projectSnapshot = await getProjectSnapshot(input.project_id);
  const settlement: SalesOverpaymentSettlement = {
    id: crypto.randomUUID(),
    settlement_number: settlementNumber,
    settlement_date: settlementDate,
    method: 'INVOICE_ALLOCATION',
    source_payment_id: sourcePayment.id,
    source_payment_number: getPaymentNumber(sourcePayment),
    source_sales_document_id: sourcePayment.sales_document_id,
    source_document_number: sourcePayment.document_number,
    source_type: sourcePayment.source_type === 'OPENING_RECEIVABLE' ? 'OPENING_RECEIVABLE' : 'SALES_INVOICE',
    opening_balance_line_id: sourcePayment.opening_balance_line_id,
    opening_balance_batch_id: sourcePayment.opening_balance_batch_id,
    contact_id: sourcePayment.contact_id,
    customer_name: sourcePayment.customer_name,
    total_amount: totalAmount,
    description: input.description?.trim() || `Alokasi lebih bayar ${getPaymentNumber(sourcePayment)}`,
    ...departmentSnapshot,
    ...projectSnapshot,
    status: 'POSTED',
    notes: input.notes?.trim() || undefined,
    posted_at: now,
    created_by: currentUser?.id,
    created_by_name: currentUser?.name,
    updated_by: currentUser?.id,
    updated_by_name: currentUser?.name,
    created_at: now,
    updated_at: now,
  };
  const targetDocuments = new Map<string, SalesDocument>();
  const targetPayments: SalesInvoicePayment[] = [];
  const allocations: SalesOverpaymentSettlementAllocation[] = [];

  await db.transaction('rw', salesOverpaymentTables, async () => {
    const locked = await assertSourcePaymentCanBeSettled(sourcePayment.id);
    assertSettlementAmount(totalAmount, locked.row.remaining_amount);

    for (const allocationInput of normalizedAllocations) {
      const target = await db.salesDocuments.get(allocationInput.target_sales_document_id);
      if (!target || target.type !== 'SALES_INVOICE' || target.status !== 'ISSUED') {
        throw new Error('Sales Invoice target tidak ditemukan atau belum terbit.');
      }
      if (!isSameCustomer(sourcePayment, target)) {
        throw new Error(`Invoice ${target.document_number} bukan milik pelanggan yang sama.`);
      }
      if (target.id === sourcePayment.sales_document_id) {
        throw new Error('Invoice asal tidak dapat menjadi target alokasi.');
      }
      const targetRow = await buildReceivableRowForInvoice(target.id);
      if (targetRow.balance_due <= 0.01) {
        throw new Error(`Invoice ${target.document_number} sudah lunas.`);
      }
      if (allocationInput.amount > targetRow.balance_due + 0.01) {
        throw new Error(`Alokasi ke ${target.document_number} melebihi sisa piutang.`);
      }

      const targetPayment = createCustomerCreditPaymentForTarget({
        settlement,
        target,
        amount: allocationInput.amount,
        now,
        createdBy: currentUser?.id,
        createdByName: currentUser?.name,
      });
      targetDocuments.set(target.id, target);
      targetPayments.push(targetPayment);
      allocations.push({
        id: crypto.randomUUID(),
        settlement_id: settlement.id,
        target_sales_document_id: target.id,
        target_document_number: target.document_number,
        target_payment_id: targetPayment.id,
        invoice_date: target.document_date,
        due_date: target.due_date,
        invoice_total_amount: Number(target.total_amount || 0),
        receivable_before_amount: targetRow.balance_due,
        allocation_amount: allocationInput.amount,
        receivable_after_amount: roundCurrency(Math.max(0, targetRow.balance_due - allocationInput.amount)),
        created_at: now,
      });
    }

    await db.salesOverpaymentSettlements.add(settlement);
    await db.salesOverpaymentSettlementAllocations.bulkAdd(allocations);
    await db.salesInvoicePayments.bulkAdd(targetPayments);
    await patchSourcePaymentUsage(sourcePayment);

    for (const targetId of targetDocuments.keys()) {
      await recalculateSalesInvoicePaidAmount(targetId);
    }

    const journalEntry = await postSalesOverpaymentInvoiceAllocationJournal(settlement, allocations, currentUser);
    if (journalEntry) {
      settlement.journal_entry_id = journalEntry.id;
      settlement.updated_at = now;
      await db.salesOverpaymentSettlements.update(settlement.id, {
        journal_entry_id: journalEntry.id,
        updated_at: now,
      });
    }

    await writeActivityLog({
      user: currentUser,
      action: 'SALES_OVERPAYMENT_ALLOCATED',
      entity: 'salesOverpaymentSettlements',
      entity_id: settlement.id,
      description: `${currentUser?.name ?? 'User'} mengalokasikan lebih bayar ${getPaymentNumber(sourcePayment)} sebesar ${totalAmount}.`,
    });
  });

  return settlement;
};

const getCashAccountSnapshot = async (cashAccountId: string): Promise<ChartOfAccount> => {
  if (!cashAccountId) throw new Error('Akun kas/bank wajib dipilih.');
  return getCashOrBankAccountForPayment('TUNAI', cashAccountId);
};

export const refundSalesOverpaymentToCash = async (input: RefundSalesOverpaymentInput) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');

  const { sourcePayment, row } = await assertSourcePaymentCanBeSettled(input.sourcePaymentId);
  const amount = roundCurrency(Number(input.amount || 0));
  assertSettlementAmount(amount, row.remaining_amount);

  const cashAccount = await getCashAccountSnapshot(input.cash_account_id);
  const now = new Date().toISOString();
  const settlementDate = input.settlement_date || now;
  const settlementNumber = await createSalesOverpaymentSettlementNumber(new Date(settlementDate));
  const financeTransactionId = crypto.randomUUID();
  const departmentSnapshot = await getDepartmentSnapshot(input.department_id);
  const projectSnapshot = await getProjectSnapshot(input.project_id);
  const settlement: SalesOverpaymentSettlement = {
    id: crypto.randomUUID(),
    settlement_number: settlementNumber,
    settlement_date: settlementDate,
    method: 'CASH_REFUND',
    source_payment_id: sourcePayment.id,
    source_payment_number: getPaymentNumber(sourcePayment),
    source_sales_document_id: sourcePayment.sales_document_id,
    source_document_number: sourcePayment.document_number,
    source_type: sourcePayment.source_type === 'OPENING_RECEIVABLE' ? 'OPENING_RECEIVABLE' : 'SALES_INVOICE',
    opening_balance_line_id: sourcePayment.opening_balance_line_id,
    opening_balance_batch_id: sourcePayment.opening_balance_batch_id,
    contact_id: sourcePayment.contact_id,
    customer_name: sourcePayment.customer_name,
    total_amount: amount,
    description: input.description?.trim() || `Pengembalian lebih bayar ${getPaymentNumber(sourcePayment)}`,
    ...departmentSnapshot,
    ...projectSnapshot,
    cash_account_id: cashAccount.id,
    cash_account_code: cashAccount.code,
    cash_account_name: cashAccount.name,
    finance_transaction_id: financeTransactionId,
    status: 'POSTED',
    notes: input.notes?.trim() || undefined,
    posted_at: now,
    created_by: currentUser?.id,
    created_by_name: currentUser?.name,
    updated_by: currentUser?.id,
    updated_by_name: currentUser?.name,
    created_at: now,
    updated_at: now,
  };
  let financeTransaction: FinanceTransaction | undefined;

  await db.transaction('rw', salesOverpaymentTables, async () => {
    const locked = await assertSourcePaymentCanBeSettled(sourcePayment.id);
    assertSettlementAmount(amount, locked.row.remaining_amount);

    const currentFinanceBalance = await db.financeBalance.get('current');
    await db.financeBalance.put({
      id: 'current',
      amount: roundCurrency(Number(currentFinanceBalance?.amount || 0) - amount),
      updated_at: now,
    });
    financeTransaction = withPendingFinanceTransactionSync({
      id: financeTransactionId,
      type: 'EXPENSE',
      category: FINANCE_CATEGORIES.CUSTOMER_CREDIT_REFUND,
      amount,
      description: settlement.description || `Pengembalian lebih bayar ${settlement.source_payment_number}`,
      created_at: settlementDate,
      reference_id: settlement.id,
      cash_account_id: cashAccount.id,
      cash_account_code: cashAccount.code,
      cash_account_name: cashAccount.name,
      account_id: cashAccount.id,
      account_code: cashAccount.code,
      account_name: cashAccount.name,
      account_type: cashAccount.type,
    }, currentUser, now);
    await db.financeTransactions.add(financeTransaction);
    await db.salesOverpaymentSettlements.add(settlement);
    await patchSourcePaymentUsage(sourcePayment);

    const journalEntry = await postSalesOverpaymentCashRefundJournal(settlement, currentUser);
    if (journalEntry) {
      settlement.journal_entry_id = journalEntry.id;
      settlement.updated_at = now;
      await db.salesOverpaymentSettlements.update(settlement.id, {
        journal_entry_id: journalEntry.id,
        updated_at: now,
      });
    }

    await writeActivityLog({
      user: currentUser,
      action: 'SALES_OVERPAYMENT_REFUNDED',
      entity: 'salesOverpaymentSettlements',
      entity_id: settlement.id,
      description: `${currentUser?.name ?? 'User'} mengembalikan lebih bayar ${getPaymentNumber(sourcePayment)} sebesar ${amount}.`,
    });
  });

  if (financeTransaction) {
    await enqueueFinanceTransactionsSync([financeTransaction], 'create');
  }

  return settlement;
};

export const reverseSalesOverpaymentSettlement = async (settlementId: string, reason: string) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');

  const settlement = await db.salesOverpaymentSettlements.get(settlementId);
  if (!settlement) throw new Error('Transaksi settlement tidak ditemukan.');
  if (settlement.status !== 'POSTED') throw new Error('Settlement sudah direversal.');
  const normalizedReason = reason.trim();
  if (!normalizedReason) throw new Error('Alasan reversal wajib diisi.');

  const sourcePayment = await db.salesInvoicePayments.get(settlement.source_payment_id);
  if (!sourcePayment) throw new Error('Payment sumber tidak ditemukan.');

  const now = new Date().toISOString();
  let reversalFinanceTransaction: FinanceTransaction | undefined;
  let reversalFinanceTransactionId: string | undefined;
  let reversalJournalEntryId: string | undefined;

  await db.transaction('rw', salesOverpaymentTables, async () => {
    if (settlement.method === 'INVOICE_ALLOCATION') {
      const allocations = await db.salesOverpaymentSettlementAllocations
        .where('settlement_id')
        .equals(settlement.id)
        .toArray();
      const targetPaymentIds = allocations
        .map((allocation) => allocation.target_payment_id)
        .filter((id): id is string => Boolean(id));
      if (targetPaymentIds.length > 0) {
        const targetPayments = await db.salesInvoicePayments.bulkGet(targetPaymentIds);
        await db.salesInvoicePayments.bulkPut(targetPayments.filter(Boolean).map((payment) => ({
          ...payment!,
          status: 'VOIDED' as const,
          voided_at: now,
          void_reason: normalizedReason,
          updated_at: now,
        })));
      }
      for (const allocation of allocations) {
        await recalculateSalesInvoicePaidAmount(allocation.target_sales_document_id);
      }
    } else if (settlement.finance_transaction_id) {
      reversalFinanceTransactionId = crypto.randomUUID();
      const currentFinanceBalance = await db.financeBalance.get('current');
      await db.financeBalance.put({
        id: 'current',
        amount: roundCurrency(Number(currentFinanceBalance?.amount || 0) + Number(settlement.total_amount || 0)),
        updated_at: now,
      });
      reversalFinanceTransaction = withPendingFinanceTransactionSync({
        id: reversalFinanceTransactionId,
        type: 'INCOME',
        category: FINANCE_CATEGORIES.CUSTOMER_CREDIT_REFUND,
        amount: Number(settlement.total_amount || 0),
        description: `Reversal ${settlement.settlement_number}: ${normalizedReason}`,
        created_at: now,
        reference_id: settlement.id,
        cash_account_id: settlement.cash_account_id,
        cash_account_code: settlement.cash_account_code,
        cash_account_name: settlement.cash_account_name,
        account_id: settlement.cash_account_id,
        account_code: settlement.cash_account_code,
        account_name: settlement.cash_account_name,
        account_type: 'ASSET',
      }, currentUser, now);
      await db.financeTransactions.add(reversalFinanceTransaction);
    }

    const reversalEntries = settlement.journal_entry_id
      ? await reverseSalesOverpaymentSettlementJournal(settlement, `Reversal ${settlement.settlement_number}: ${normalizedReason}`, currentUser)
      : [];
    reversalJournalEntryId = reversalEntries[0]?.id;

    await db.salesOverpaymentSettlements.update(settlement.id, {
      status: 'REVERSED',
      reversed_at: now,
      reversal_reason: normalizedReason,
      reversal_finance_transaction_id: reversalFinanceTransactionId,
      reversal_journal_entry_id: reversalJournalEntryId,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
      updated_at: now,
    });
    await patchSourcePaymentUsage(sourcePayment);

    await writeActivityLog({
      user: currentUser,
      action: 'SALES_OVERPAYMENT_REVERSED',
      entity: 'salesOverpaymentSettlements',
      entity_id: settlement.id,
      description: `${currentUser?.name ?? 'User'} reversal settlement lebih bayar ${settlement.settlement_number}. Alasan: ${normalizedReason}`,
    });
  });

  if (reversalFinanceTransaction) {
    await enqueueFinanceTransactionsSync([reversalFinanceTransaction], 'create');
  }
};
