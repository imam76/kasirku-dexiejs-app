import { useMemo } from 'react';
import { App } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { useI18n } from '@/hooks/useI18n';
import { db } from '@/lib/db';
import {
  getIssuedPurchaseReturnCreditByInvoiceId,
  recordOpeningPayablePayment,
  recordPurchaseInvoicePayment,
  voidPurchaseInvoicePayment,
  type AccountsPayableFilters,
  type RecordPurchaseInvoicePaymentInput,
} from '@/services/accountsPayableService';
import type { AccountsPayableRow, PurchaseInvoicePayment } from '@/types';
import { buildOpeningPayableRows } from '@/utils/accountsPayable/buildOpeningPayableRows';
import { buildPayableRows } from '@/utils/accountsPayable/buildPayableRows';

export interface AccountsPayableSummary {
  invoice_count: number;
  open_invoice_count: number;
  overdue_invoice_count: number;
  total_outstanding: number;
  total_current: number;
  total_overdue: number;
  paid_in_period: number;
}

const PAYABLE_RELATED_QUERY_KEYS = [
  'accountsPayable',
  'purchaseDocuments',
  'financeBalance',
  'financeTransactions',
  'journalEntries',
  'trialBalance',
  'incomeStatement',
  'balanceSheet',
];

const isDateInRange = (value: string, from?: string, to?: string) => {
  const dateKey = value.slice(0, 10);
  return (!from || dateKey >= from) && (!to || dateKey <= to);
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

interface RecordPayablePaymentMutationInput {
  invoiceId?: string;
  row?: AccountsPayableRow;
  input: RecordPurchaseInvoicePaymentInput;
}

export const useAccountsPayable = (filters: AccountsPayableFilters = {}) => {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const payableData = useLiveQuery(async () => {
    const [documents, payableBatches] = await Promise.all([
      db.purchaseDocuments
        .where('type')
        .equals('PURCHASE_INVOICE')
        .toArray(),
      db.openingBalanceBatches
        .where('module')
        .equals('PAYABLE')
        .filter((batch) => batch.status === 'POSTED')
        .toArray(),
    ]);
    const invoiceIds = documents.map((document) => document.id);
    const payments = invoiceIds.length > 0
      ? await db.purchaseInvoicePayments.where('purchase_document_id').anyOf(invoiceIds).toArray()
      : [];
    const openingBatchIds = payableBatches.map((batch) => batch.id);
    const openingPayableLines = openingBatchIds.length > 0
      ? await db.openingBalanceLines.where('batch_id').anyOf(openingBatchIds).toArray()
      : [];
    const openingLineIds = openingPayableLines.map((line) => line.id);
    const openingPayments = openingLineIds.length > 0
      ? await db.purchaseInvoicePayments.where('purchase_document_id').anyOf(openingLineIds).toArray()
      : [];

    return {
      documents,
      payments: [...payments, ...openingPayments],
      invoicePayments: payments,
      openingPayableLines,
      openingPayments,
      returnCreditByInvoiceId: await getIssuedPurchaseReturnCreditByInvoiceId(),
    };
  }, [], {
    documents: [],
    payments: [],
    invoicePayments: [],
    openingPayableLines: [],
    openingPayments: [],
    returnCreditByInvoiceId: {},
  });

  const allRows = useMemo(() => [
    ...buildPayableRows({
      documents: payableData.documents,
      payments: payableData.invoicePayments,
      returnCreditByInvoiceId: payableData.returnCreditByInvoiceId,
      asOfDate: filters.asOfDate,
    }),
    ...buildOpeningPayableRows({
      lines: payableData.openingPayableLines,
      payments: payableData.openingPayments,
      asOfDate: filters.asOfDate,
    }),
  ], [filters.asOfDate, payableData]);
  const payableRows = useMemo(() => filterPayableRows(allRows, filters), [allRows, filters]);
  const summary = useMemo<AccountsPayableSummary>(() => {
    const paidInPeriod = payableData.payments
      .filter((payment) => payment.status === 'ACTIVE')
      .filter((payment) => isDateInRange(payment.paid_at, filters.invoiceDateFrom, filters.invoiceDateTo))
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

    return payableRows.reduce<AccountsPayableSummary>((acc, row) => {
      acc.invoice_count += 1;
      if (row.balance_due > 0) {
        acc.open_invoice_count += 1;
        acc.total_outstanding += row.balance_due;
      }
      if (row.aging_bucket === 'CURRENT') {
        acc.total_current += row.balance_due;
      } else if (row.balance_due > 0) {
        acc.overdue_invoice_count += 1;
        acc.total_overdue += row.balance_due;
      }
      return acc;
    }, {
      invoice_count: 0,
      open_invoice_count: 0,
      overdue_invoice_count: 0,
      total_outstanding: 0,
      total_current: 0,
      total_overdue: 0,
      paid_in_period: paidInPeriod,
    });
  }, [filters.invoiceDateFrom, filters.invoiceDateTo, payableData.payments, payableRows]);

  const invalidate = () => {
    PAYABLE_RELATED_QUERY_KEYS.forEach((queryKey) => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    });
  };

  const recordPaymentMutation = useMutation({
    mutationFn: ({ invoiceId, row, input }: RecordPayablePaymentMutationInput) => {
      if (row?.source_type === 'OPENING_PAYABLE') {
        return recordOpeningPayablePayment(row.opening_balance_line_id ?? row.purchase_document_id, input);
      }
      return recordPurchaseInvoicePayment(invoiceId ?? row?.purchase_document_id ?? '', input);
    },
    onSuccess: () => {
      invalidate();
      message.success(t('accountsPayable.message.paymentSuccess'));
    },
    onError: (error: Error) => modal.error({ title: t('accountsPayable.error.paymentTitle'), content: error.message }),
  });

  const voidPaymentMutation = useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) => voidPurchaseInvoicePayment(paymentId, reason),
    onSuccess: () => {
      invalidate();
      message.success(t('accountsPayable.message.voidSuccess'));
    },
    onError: (error: Error) => modal.error({ title: t('accountsPayable.error.voidTitle'), content: error.message }),
  });

  const getInvoicePayments = (invoiceId: string): PurchaseInvoicePayment[] => (
    payableData.payments
      .filter((payment) => payment.purchase_document_id === invoiceId)
      .sort((left, right) => right.paid_at.localeCompare(left.paid_at))
  );

  return {
    payableRows,
    allRows,
    summary,
    payments: payableData.payments,
    getInvoicePayments,
    recordPayment: recordPaymentMutation.mutateAsync,
    voidPayment: voidPaymentMutation.mutateAsync,
    isMutating: recordPaymentMutation.isPending || voidPaymentMutation.isPending,
  };
};
