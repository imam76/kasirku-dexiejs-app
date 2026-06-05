import { FINANCE_CATEGORIES } from '@/constants/finance';
import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import { getIssuedReturnSummaryForSource } from '@/services/salesReturnReadService';
import {
  getCashOrBankAccountForPayment,
  postSalesInvoicePaymentRecordJournal,
  reverseSalesInvoicePaymentRecordJournal,
} from '@/services/generalLedgerService';
import { enqueueFinanceTransactionsSync, withPendingFinanceTransactionSync } from '@/services/financeTransactionSyncService';
import type {
  AccountsReceivableRow,
  FinanceTransaction,
  PaymentMethod,
  SalesDocument,
  SalesInvoicePayment,
  SalesInvoicePaymentStatus,
} from '@/types';
import { buildReceivableRows } from '@/utils/accountsReceivable/buildReceivableRows';
import { calculateReceivableBalance } from '@/utils/accountsReceivable/calculateReceivableBalance';
import { createInvoicePaymentSnapshot } from '@/utils/accountsReceivable/createInvoicePaymentSnapshot';
import { validateInvoicePayment } from '@/utils/accountsReceivable/validateInvoicePayment';
import {
  snapshotFromDocumentInput,
  toBaseCurrencyAmount,
  type DocumentCurrencySnapshot,
} from '@/utils/documentCurrency';

export interface RecordSalesInvoicePaymentInput {
  amount: number;
  paid_at?: string;
  payment_method?: PaymentMethod;
  payment_channel?: string;
  cash_account_id?: string;
  notes?: string;
}

export interface AccountsReceivableFilters {
  search?: string;
  paymentStatus?: SalesInvoicePaymentStatus | 'ALL';
  agingBucket?: AccountsReceivableRow['aging_bucket'] | 'ALL';
  dueDateFrom?: string;
  dueDateTo?: string;
  invoiceDateFrom?: string;
  invoiceDateTo?: string;
}

export interface SalesInvoicePaymentSummary {
  payments: SalesInvoicePayment[];
  activePayments: SalesInvoicePayment[];
  activePaymentAmount: number;
  voidedPaymentAmount: number;
}

const accountsReceivableTables = [
  db.salesDocuments,
  db.salesDocumentItems,
  db.salesInvoicePayments,
  db.salesReturns,
  db.salesReturnItems,
  db.financeTransactions,
  db.financeBalance,
  db.chartOfAccounts,
  db.enabledModules,
  db.generalLedgerSetting,
  db.journalEntries,
  db.journalEntryLines,
  db.activityLogs,
];

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const sortPaymentsByPaidAtDesc = (payments: SalesInvoicePayment[]) => (
  [...payments].sort((left, right) => right.paid_at.localeCompare(left.paid_at))
);

const getActivePayments = async (invoiceId: string) => (
  db.salesInvoicePayments
    .where('sales_document_id')
    .equals(invoiceId)
    .filter((payment) => payment.status === 'ACTIVE')
    .toArray()
);

const buildSalesInvoiceAggregatePatch = async (
  document: SalesDocument,
  activePayments: SalesInvoicePayment[],
  updatedAt: string,
) => {
  const returnSummary = await getIssuedReturnSummaryForSource('SALES_INVOICE', document.id);
  const activePaymentAmount = roundCurrency(
    activePayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
  );
  const calculation = calculateReceivableBalance({
    invoiceTotal: Number(document.total_amount || 0),
    activePaymentAmount,
    returnCreditAmount: Number(returnSummary.credit_amount || 0),
    dueDate: document.due_date,
  });
  const latestPayment = sortPaymentsByPaidAtDesc(activePayments)[0];

  return {
    paid_amount: activePaymentAmount,
    payment_status: calculation.payment_status,
    paid_at: latestPayment?.paid_at,
    payment_method: latestPayment?.payment_method,
    cash_account_id: latestPayment?.cash_account_id,
    cash_account_code: latestPayment?.cash_account_code,
    cash_account_name: latestPayment?.cash_account_name,
    finance_transaction_id: latestPayment?.finance_transaction_id,
    updated_at: updatedAt,
  };
};

const filterReceivableRows = (
  rows: AccountsReceivableRow[],
  filters: AccountsReceivableFilters = {},
) => {
  const query = filters.search?.trim().toLowerCase();

  return rows.filter((row) => {
    const matchesSearch = !query || [
      row.document_number,
      row.customer_name,
    ].some((value) => value.toLowerCase().includes(query));
    const matchesPaymentStatus = !filters.paymentStatus ||
      filters.paymentStatus === 'ALL' ||
      row.payment_status === filters.paymentStatus;
    const matchesAging = !filters.agingBucket ||
      filters.agingBucket === 'ALL' ||
      row.aging_bucket === filters.agingBucket;
    const matchesDueDateFrom = !filters.dueDateFrom || (row.due_date && row.due_date >= filters.dueDateFrom);
    const matchesDueDateTo = !filters.dueDateTo || (row.due_date && row.due_date <= filters.dueDateTo);
    const matchesInvoiceDateFrom = !filters.invoiceDateFrom || row.document_date >= filters.invoiceDateFrom;
    const matchesInvoiceDateTo = !filters.invoiceDateTo || row.document_date <= filters.invoiceDateTo;

    return matchesSearch &&
      matchesPaymentStatus &&
      matchesAging &&
      matchesDueDateFrom &&
      matchesDueDateTo &&
      matchesInvoiceDateFrom &&
      matchesInvoiceDateTo;
  });
};

export const getSalesInvoicePaymentSummary = async (invoiceId: string): Promise<SalesInvoicePaymentSummary> => {
  const payments = await db.salesInvoicePayments
    .where('sales_document_id')
    .equals(invoiceId)
    .toArray();
  const activePayments = payments.filter((payment) => payment.status === 'ACTIVE');
  const activePaymentAmount = roundCurrency(
    activePayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
  );
  const voidedPaymentAmount = roundCurrency(
    payments
      .filter((payment) => payment.status === 'VOIDED')
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
  );

  return {
    payments: sortPaymentsByPaidAtDesc(payments),
    activePayments,
    activePaymentAmount,
    voidedPaymentAmount,
  };
};

export const recalculateSalesInvoicePaidAmount = async (invoiceId: string) => {
  const document = await db.salesDocuments.get(invoiceId);
  if (!document || document.type !== 'SALES_INVOICE') return;

  const activePayments = await getActivePayments(invoiceId);
  const now = new Date().toISOString();
  const aggregatePatch = await buildSalesInvoiceAggregatePatch(document, activePayments, now);

  await db.salesDocuments.update(invoiceId, aggregatePatch);
};

export const listAccountsReceivableRows = async (
  filters: AccountsReceivableFilters = {},
): Promise<AccountsReceivableRow[]> => {
  const documents = await db.salesDocuments
    .where('type')
    .equals('SALES_INVOICE')
    .filter((document) => document.status === 'ISSUED')
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
  const rows = buildReceivableRows({
    documents,
    payments,
    returnSummariesByInvoiceId: Object.fromEntries(returnSummaryEntries),
  });

  return filterReceivableRows(rows, filters);
};

export const recordSalesInvoicePayment = async (
  invoiceId: string,
  input: RecordSalesInvoicePaymentInput,
) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');

  const document = await db.salesDocuments.get(invoiceId);
  const activePayments = await getActivePayments(invoiceId);
  const returnSummary = document
    ? await getIssuedReturnSummaryForSource('SALES_INVOICE', document.id)
    : undefined;
  const activePaymentAmount = activePayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const documentCurrencySnapshot = document
    ? snapshotFromDocumentInput(document, undefined, document.document_date)
    : undefined;
  const currentBalance = calculateReceivableBalance({
    invoiceTotal: Number(document?.total_amount || 0),
    activePaymentAmount,
    returnCreditAmount: Number(returnSummary?.credit_amount || 0),
    dueDate: document?.due_date,
  });
  const foreignAmount = roundCurrency(Number(input.amount || 0));
  const amount = roundCurrency(toBaseCurrencyAmount(
    foreignAmount,
    documentCurrencySnapshot as DocumentCurrencySnapshot | undefined,
  ));

  validateInvoicePayment({
    document,
    amount,
    balanceDue: currentBalance.balance_due,
  });

  const now = new Date().toISOString();
  const paidAt = input.paid_at || now;
  const paymentMethod = input.payment_method ?? document?.payment_method ?? 'TUNAI';
  const cashAccount = await getCashOrBankAccountForPayment(paymentMethod, input.cash_account_id);
  const paymentId = crypto.randomUUID();
  const financeTransactionId = crypto.randomUUID();
  const payment = createInvoicePaymentSnapshot({
    id: paymentId,
    document: document as SalesDocument,
    amount,
    foreignAmount,
    paidAt,
    paymentMethod,
    paymentChannel: input.payment_channel,
    cashAccount,
    financeTransactionId,
    notes: input.notes,
    createdBy: currentUser?.id,
    createdByName: currentUser?.name,
    now,
  });
  let savedPayment = payment;
  let financeTransaction: FinanceTransaction | undefined;

  await db.transaction('rw', accountsReceivableTables, async () => {
    const currentFinanceBalance = await db.financeBalance.get('current');
    await db.financeBalance.put({
      id: 'current',
      amount: roundCurrency(Number(currentFinanceBalance?.amount || 0) + amount),
      updated_at: now,
    });
    financeTransaction = withPendingFinanceTransactionSync({
      id: financeTransactionId,
      type: 'INCOME',
      category: FINANCE_CATEGORIES.SALES_INVOICE_PAYMENT,
      amount,
      description: `Pembayaran invoice ${payment.document_number}`,
      created_at: paidAt,
      reference_id: payment.id,
      payment_method: payment.payment_method,
      payment_channel: payment.payment_channel,
      cash_account_id: cashAccount.id,
      cash_account_code: cashAccount.code,
      cash_account_name: cashAccount.name,
      account_id: cashAccount.id,
      account_code: cashAccount.code,
      account_name: cashAccount.name,
      account_type: cashAccount.type,
    }, currentUser, now);
    await db.financeTransactions.add(financeTransaction);
    await db.salesInvoicePayments.add(payment);

    const journalEntry = await postSalesInvoicePaymentRecordJournal(document as SalesDocument, payment, currentUser);
    if (journalEntry) {
      savedPayment = {
        ...payment,
        journal_entry_id: journalEntry.id,
        updated_at: now,
      };
      await db.salesInvoicePayments.update(payment.id, {
        journal_entry_id: journalEntry.id,
        updated_at: now,
      });
    }

    const aggregatePatch = await buildSalesInvoiceAggregatePatch(
      document as SalesDocument,
      [...activePayments, savedPayment],
      now,
    );
    await db.salesDocuments.update(invoiceId, aggregatePatch);
    await writeActivityLog({
      user: currentUser,
      action: 'SALES_INVOICE_PAYMENT_RECORDED',
      entity: 'salesInvoicePayments',
      entity_id: payment.id,
      description: `${currentUser?.name ?? 'User'} mencatat pembayaran invoice ${payment.document_number} sebesar ${amount}.`,
    });
  });

  if (financeTransaction) {
    await enqueueFinanceTransactionsSync([financeTransaction], 'create');
  }

  return savedPayment;
};

export const voidSalesInvoicePayment = async (paymentId: string, reason: string) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');

  const payment = await db.salesInvoicePayments.get(paymentId);
  if (!payment) throw new Error('Payment invoice tidak ditemukan.');
  if (payment.status !== 'ACTIVE') throw new Error('Payment invoice sudah void.');

  const normalizedReason = reason.trim();
  if (!normalizedReason) {
    throw new Error('Alasan void pembayaran wajib diisi.');
  }

  const document = await db.salesDocuments.get(payment.sales_document_id);
  if (!document || document.type !== 'SALES_INVOICE') {
    throw new Error('Sales Invoice payment tidak valid.');
  }

  const now = new Date().toISOString();
  let reversalFinanceTransactionId: string | undefined;
  let reversalJournalEntryId: string | undefined;
  let reversalFinanceTransaction: FinanceTransaction | undefined;

  await db.transaction('rw', accountsReceivableTables, async () => {
    if (payment.finance_transaction_id) {
      reversalFinanceTransactionId = crypto.randomUUID();
      const currentFinanceBalance = await db.financeBalance.get('current');
      await db.financeBalance.put({
        id: 'current',
        amount: roundCurrency(Number(currentFinanceBalance?.amount || 0) - Number(payment.amount || 0)),
        updated_at: now,
      });
      reversalFinanceTransaction = withPendingFinanceTransactionSync({
        id: reversalFinanceTransactionId,
        type: 'EXPENSE',
        category: FINANCE_CATEGORIES.SALES_INVOICE_PAYMENT,
        amount: Number(payment.amount || 0),
        description: `Void pembayaran invoice ${payment.document_number}`,
        created_at: now,
        reference_id: payment.id,
        payment_method: payment.payment_method,
        payment_channel: payment.payment_channel,
        cash_account_id: payment.cash_account_id,
        cash_account_code: payment.cash_account_code,
        cash_account_name: payment.cash_account_name,
        account_id: payment.cash_account_id,
        account_code: payment.cash_account_code,
        account_name: payment.cash_account_name,
        account_type: 'ASSET',
      }, currentUser, now);
      await db.financeTransactions.add(reversalFinanceTransaction);
    }

    const reversalEntries = payment.journal_entry_id
      ? await reverseSalesInvoicePaymentRecordJournal(payment, `Void pembayaran invoice ${payment.document_number}: ${normalizedReason}`, currentUser)
      : [];
    reversalJournalEntryId = reversalEntries[0]?.id;

    await db.salesInvoicePayments.update(payment.id, {
      status: 'VOIDED',
      voided_at: now,
      void_reason: normalizedReason,
      reversal_finance_transaction_id: reversalFinanceTransactionId,
      reversal_journal_entry_id: reversalJournalEntryId,
      updated_at: now,
    });

    const activePaymentsAfterVoid = (await getActivePayments(document.id))
      .filter((activePayment) => activePayment.id !== payment.id);
    const aggregatePatch = await buildSalesInvoiceAggregatePatch(document, activePaymentsAfterVoid, now);
    await db.salesDocuments.update(document.id, aggregatePatch);
    await writeActivityLog({
      user: currentUser,
      action: 'SALES_INVOICE_PAYMENT_VOIDED',
      entity: 'salesInvoicePayments',
      entity_id: payment.id,
      description: `${currentUser?.name ?? 'User'} void pembayaran invoice ${payment.document_number}. Alasan: ${normalizedReason}`,
    });
  });

  if (reversalFinanceTransaction) {
    await enqueueFinanceTransactionsSync([reversalFinanceTransaction], 'create');
  }

  return {
    ...payment,
    status: 'VOIDED' as const,
    voided_at: now,
    void_reason: normalizedReason,
    reversal_finance_transaction_id: reversalFinanceTransactionId,
    reversal_journal_entry_id: reversalJournalEntryId,
    updated_at: now,
  };
};
