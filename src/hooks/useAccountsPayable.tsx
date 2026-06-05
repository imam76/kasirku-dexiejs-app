import { useMemo } from 'react';
import { App } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { useI18n } from '@/hooks/useI18n';
import { db } from '@/lib/db';
import {
  getIssuedPurchaseReturnCreditByInvoiceId,
  recordPurchaseInvoicePayment,
  voidPurchaseInvoicePayment,
  type AccountsPayableFilters,
  type RecordPurchaseInvoicePaymentInput,
} from '@/services/accountsPayableService';
import type { AccountsPayableRow, PurchaseInvoicePayment } from '@/types';
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

export const useAccountsPayable = (filters: AccountsPayableFilters = {}) => {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const payableData = useLiveQuery(async () => {
    const documents = await db.purchaseDocuments
      .where('type')
      .equals('PURCHASE_INVOICE')
      .toArray();
    const invoiceIds = documents.map((document) => document.id);
    const payments = invoiceIds.length > 0
      ? await db.purchaseInvoicePayments.where('purchase_document_id').anyOf(invoiceIds).toArray()
      : [];

    return {
      documents,
      payments,
      returnCreditByInvoiceId: await getIssuedPurchaseReturnCreditByInvoiceId(),
    };
  }, [], {
    documents: [],
    payments: [],
    returnCreditByInvoiceId: {},
  });

  const allRows = useMemo(() => buildPayableRows({
    ...payableData,
    asOfDate: filters.asOfDate,
  }), [filters.asOfDate, payableData]);
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
    mutationFn: ({ invoiceId, input }: { invoiceId: string; input: RecordPurchaseInvoicePaymentInput }) => (
      recordPurchaseInvoicePayment(invoiceId, input)
    ),
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
