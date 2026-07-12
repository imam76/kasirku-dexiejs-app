import { FINANCE_CATEGORIES } from '@/constants/finance';
import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import {
  getCashOrBankAccountForPayment,
  postPurchaseInvoicePaymentRecordJournal,
  reversePurchaseInvoicePaymentRecordJournal,
} from '@/services/generalLedgerService';
import { enqueueFinanceTransactionsSync, withPendingFinanceTransactionSync } from '@/services/financeTransactionSyncService';
import type {
  AccountsPayableRow,
  FinanceTransaction,
  PaymentMethod,
  PurchaseDocument,
  PurchaseInvoicePayment,
  PurchaseInvoicePaymentStatus,
} from '@/types';
import { buildPayableRows } from '@/utils/accountsPayable/buildPayableRows';
import { createPayablePaymentSnapshot } from '@/utils/accountsPayable/createPayablePaymentSnapshot';
import { validatePayablePayment } from '@/utils/accountsPayable/validatePayablePayment';
import { calculateInvoiceBalance, roundCurrency } from '@/utils/invoiceBalance/calculateInvoiceBalance';
import {
  snapshotFromDocumentInput,
  toBaseCurrencyAmount,
  type DocumentCurrencySnapshot,
} from '@/utils/documentCurrency';

export interface RecordPurchaseInvoicePaymentInput {
  amount: number;
  paid_at?: string;
  payment_method?: PaymentMethod;
  payment_channel?: string;
  cash_account_id?: string;
  notes?: string;
}

export interface AccountsPayableFilters {
  search?: string;
  paymentStatus?: PurchaseInvoicePaymentStatus | 'ALL';
  agingBucket?: AccountsPayableRow['aging_bucket'] | 'ALL';
  dueDateFrom?: string;
  dueDateTo?: string;
  invoiceDateFrom?: string;
  invoiceDateTo?: string;
  asOfDate?: string;
}

export interface PurchaseInvoicePaymentSummary {
  payments: PurchaseInvoicePayment[];
  activePayments: PurchaseInvoicePayment[];
  activePaymentAmount: number;
  voidedPaymentAmount: number;
}

const accountsPayableTables = [
  db.purchaseDocuments,
  db.purchaseDocumentItems,
  db.purchaseInvoicePayments,
  db.financeTransactions,
  db.financeBalance,
  db.chartOfAccounts,
  db.enabledModules,
  db.generalLedgerSetting,
  db.accountingPeriods,
  db.journalEntries,
  db.journalEntryLines,
  db.activityLogs,
];

const sortPaymentsByPaidAtDesc = (payments: PurchaseInvoicePayment[]) => (
  [...payments].sort((left, right) => right.paid_at.localeCompare(left.paid_at))
);

const getActivePayments = async (invoiceId: string) => (
  db.purchaseInvoicePayments
    .where('purchase_document_id')
    .equals(invoiceId)
    .filter((payment) => payment.status === 'ACTIVE')
    .toArray()
);

export const getIssuedPurchaseReturnCreditByInvoiceId = async () => {
  const returns = await db.purchaseDocuments
    .where('type')
    .equals('PURCHASE_RETURN')
    .filter((document) => document.status === 'ISSUED' && Boolean(document.source_document_id))
    .toArray();

  return returns.reduce<Record<string, number>>((acc, document) => {
    const sourceId = document.source_document_id;
    if (!sourceId) return acc;
    acc[sourceId] = roundCurrency((acc[sourceId] || 0) + Number(document.total_amount || 0));
    return acc;
  }, {});
};

const buildPurchaseInvoiceAggregatePatch = async (
  document: PurchaseDocument,
  activePayments: PurchaseInvoicePayment[],
  updatedAt: string,
) => {
  const returnCreditByInvoiceId = await getIssuedPurchaseReturnCreditByInvoiceId();
  const activePaymentAmount = roundCurrency(
    activePayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
  );
  const calculation = calculateInvoiceBalance({
    invoiceTotal: Number(document.total_amount || 0),
    activePaymentAmount,
    returnCreditAmount: returnCreditByInvoiceId[document.id] || 0,
    dueDate: document.due_date,
  });
  const latestPayment = sortPaymentsByPaidAtDesc(activePayments)[0];

  return {
    paid_amount: activePaymentAmount,
    payment_status: calculation.payment_status as PurchaseInvoicePaymentStatus,
    paid_at: latestPayment?.paid_at,
    payment_method: latestPayment?.payment_method,
    cash_account_id: latestPayment?.cash_account_id,
    cash_account_code: latestPayment?.cash_account_code,
    cash_account_name: latestPayment?.cash_account_name,
    finance_transaction_id: latestPayment?.finance_transaction_id,
    updated_at: updatedAt,
  };
};

const filterPayableRows = (
  rows: AccountsPayableRow[],
  filters: AccountsPayableFilters = {},
) => {
  const query = filters.search?.trim().toLowerCase();

  return rows.filter((row) => {
    const matchesSearch = !query || [
      row.document_number,
      row.supplier_name,
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

export const getPurchaseInvoicePaymentSummary = async (invoiceId: string): Promise<PurchaseInvoicePaymentSummary> => {
  const payments = await db.purchaseInvoicePayments
    .where('purchase_document_id')
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

export const recalculatePurchaseInvoicePaidAmount = async (invoiceId: string) => {
  const document = await db.purchaseDocuments.get(invoiceId);
  if (!document || document.type !== 'PURCHASE_INVOICE') return;

  const activePayments = await getActivePayments(invoiceId);
  const now = new Date().toISOString();
  const aggregatePatch = await buildPurchaseInvoiceAggregatePatch(document, activePayments, now);

  await db.purchaseDocuments.update(invoiceId, aggregatePatch);
};

export const recalculatePurchaseInvoicePaymentsForReturnSource = async (sourceId?: string) => {
  if (!sourceId) return;
  await recalculatePurchaseInvoicePaidAmount(sourceId);
};

export const listAccountsPayableRows = async (
  filters: AccountsPayableFilters = {},
): Promise<AccountsPayableRow[]> => {
  const documents = await db.purchaseDocuments
    .where('type')
    .equals('PURCHASE_INVOICE')
    .filter((document) => document.status === 'ISSUED')
    .toArray();
  const invoiceIds = documents.map((document) => document.id);
  const payments = invoiceIds.length > 0
    ? await db.purchaseInvoicePayments.where('purchase_document_id').anyOf(invoiceIds).toArray()
    : [];
  const rows = buildPayableRows({
    documents,
    payments,
    returnCreditByInvoiceId: await getIssuedPurchaseReturnCreditByInvoiceId(),
    asOfDate: filters.asOfDate,
  });

  return filterPayableRows(rows, filters);
};

export const recordPurchaseInvoicePayment = async (
  invoiceId: string,
  input: RecordPurchaseInvoicePaymentInput,
) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');

  const document = await db.purchaseDocuments.get(invoiceId);
  const activePayments = await getActivePayments(invoiceId);
  const returnCreditByInvoiceId = await getIssuedPurchaseReturnCreditByInvoiceId();
  const activePaymentAmount = activePayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const documentCurrencySnapshot = document
    ? snapshotFromDocumentInput(document, undefined, document.document_date)
    : undefined;
  const currentBalance = calculateInvoiceBalance({
    invoiceTotal: Number(document?.total_amount || 0),
    activePaymentAmount,
    returnCreditAmount: document ? returnCreditByInvoiceId[document.id] || 0 : 0,
    dueDate: document?.due_date,
  });
  const foreignAmount = roundCurrency(Number(input.amount || 0));
  const amount = roundCurrency(toBaseCurrencyAmount(
    foreignAmount,
    documentCurrencySnapshot as DocumentCurrencySnapshot | undefined,
  ));

  validatePayablePayment({
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
  const payment = createPayablePaymentSnapshot({
    id: paymentId,
    document: document as PurchaseDocument,
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

  await db.transaction('rw', accountsPayableTables, async () => {
    const currentFinanceBalance = await db.financeBalance.get('current');
    await db.financeBalance.put({
      id: 'current',
      amount: roundCurrency(Number(currentFinanceBalance?.amount || 0) - amount),
      updated_at: now,
    });
    financeTransaction = withPendingFinanceTransactionSync({
      id: financeTransactionId,
      type: 'EXPENSE',
      category: FINANCE_CATEGORIES.PURCHASE_INVOICE_PAYMENT,
      amount,
      description: `Pembayaran purchase invoice ${payment.document_number}`,
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
    await db.purchaseInvoicePayments.add(payment);

    const journalEntry = await postPurchaseInvoicePaymentRecordJournal(document as PurchaseDocument, payment, currentUser);
    if (journalEntry) {
      savedPayment = {
        ...payment,
        journal_entry_id: journalEntry.id,
        updated_at: now,
      };
      await db.purchaseInvoicePayments.update(payment.id, {
        journal_entry_id: journalEntry.id,
        updated_at: now,
      });
    }

    const aggregatePatch = await buildPurchaseInvoiceAggregatePatch(
      document as PurchaseDocument,
      [...activePayments, savedPayment],
      now,
    );
    await db.purchaseDocuments.update(invoiceId, aggregatePatch);
    await writeActivityLog({
      user: currentUser,
      action: 'PURCHASE_INVOICE_PAYMENT_RECORDED',
      entity: 'purchaseInvoicePayments',
      entity_id: payment.id,
      description: `${currentUser?.name ?? 'User'} mencatat pembayaran purchase invoice ${payment.document_number} sebesar ${amount}.`,
    });
  });

  if (financeTransaction) {
    await enqueueFinanceTransactionsSync([financeTransaction], 'create');
  }

  return savedPayment;
};

export const voidPurchaseInvoicePayment = async (paymentId: string, reason: string) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');

  const payment = await db.purchaseInvoicePayments.get(paymentId);
  if (!payment) throw new Error('Payment purchase invoice tidak ditemukan.');
  if (payment.status !== 'ACTIVE') throw new Error('Payment purchase invoice sudah void.');

  const normalizedReason = reason.trim();
  if (!normalizedReason) {
    throw new Error('Alasan void pembayaran wajib diisi.');
  }

  const document = await db.purchaseDocuments.get(payment.purchase_document_id);
  if (!document || document.type !== 'PURCHASE_INVOICE') {
    throw new Error('Purchase Invoice payment tidak valid.');
  }

  const now = new Date().toISOString();
  let reversalFinanceTransactionId: string | undefined;
  let reversalJournalEntryId: string | undefined;
  let reversalFinanceTransaction: FinanceTransaction | undefined;

  await db.transaction('rw', accountsPayableTables, async () => {
    if (payment.finance_transaction_id) {
      reversalFinanceTransactionId = crypto.randomUUID();
      const currentFinanceBalance = await db.financeBalance.get('current');
      await db.financeBalance.put({
        id: 'current',
        amount: roundCurrency(Number(currentFinanceBalance?.amount || 0) + Number(payment.amount || 0)),
        updated_at: now,
      });
      reversalFinanceTransaction = withPendingFinanceTransactionSync({
        id: reversalFinanceTransactionId,
        type: 'INCOME',
        category: FINANCE_CATEGORIES.PURCHASE_INVOICE_PAYMENT,
        amount: Number(payment.amount || 0),
        description: `Void pembayaran purchase invoice ${payment.document_number}`,
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
      ? await reversePurchaseInvoicePaymentRecordJournal(payment, `Void pembayaran purchase invoice ${payment.document_number}: ${normalizedReason}`, currentUser)
      : [];
    reversalJournalEntryId = reversalEntries[0]?.id;

    await db.purchaseInvoicePayments.update(payment.id, {
      status: 'VOIDED',
      voided_at: now,
      void_reason: normalizedReason,
      reversal_finance_transaction_id: reversalFinanceTransactionId,
      reversal_journal_entry_id: reversalJournalEntryId,
      updated_at: now,
    });

    const activePaymentsAfterVoid = (await getActivePayments(document.id))
      .filter((activePayment) => activePayment.id !== payment.id);
    const aggregatePatch = await buildPurchaseInvoiceAggregatePatch(document, activePaymentsAfterVoid, now);
    await db.purchaseDocuments.update(document.id, aggregatePatch);
    await writeActivityLog({
      user: currentUser,
      action: 'PURCHASE_INVOICE_PAYMENT_VOIDED',
      entity: 'purchaseInvoicePayments',
      entity_id: payment.id,
      description: `${currentUser?.name ?? 'User'} void pembayaran purchase invoice ${payment.document_number}. Alasan: ${normalizedReason}`,
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
