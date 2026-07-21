import { useMemo } from 'react';
import { App } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { useI18n } from '@/hooks/useI18n';
import { db } from '@/lib/db';
import {
  allocateSalesOverpaymentToInvoices,
  getSalesOverpaymentDetail,
  listSalesOverpaymentRows,
  listSalesOverpaymentTargetInvoices,
  refundSalesOverpaymentToCash,
  reverseSalesOverpaymentSettlement,
  type AllocateSalesOverpaymentInput,
  type RefundSalesOverpaymentInput,
  type SalesOverpaymentFilters,
} from '@/services/salesOverpaymentService';

const SALES_OVERPAYMENT_RELATED_QUERY_KEYS = [
  'salesOverpayments',
  'accountsReceivable',
  'salesDocuments',
  'financeBalance',
  'financeTransactions',
  'journalEntries',
  'trialBalance',
  'incomeStatement',
  'balanceSheet',
];

export const useSalesOverpayments = (filters: SalesOverpaymentFilters = {}) => {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);
  const overpaymentRows = useLiveQuery(
    () => listSalesOverpaymentRows(filters),
    [filterKey],
    [],
  );
  const settlements = useLiveQuery(
    () => db.salesOverpaymentSettlements.orderBy('settlement_date').reverse().toArray(),
    [],
    [],
  );
  const allocations = useLiveQuery(
    () => db.salesOverpaymentSettlementAllocations.toArray(),
    [],
    [],
  );

  const invalidate = () => {
    SALES_OVERPAYMENT_RELATED_QUERY_KEYS.forEach((queryKey) => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    });
  };

  const allocateMutation = useMutation({
    mutationFn: (input: AllocateSalesOverpaymentInput) => allocateSalesOverpaymentToInvoices(input),
    onSuccess: () => {
      invalidate();
      message.success(t('salesOverpayments.message.allocateSuccess'));
    },
    onError: (error: Error) => modal.error({ title: t('salesOverpayments.error.allocateTitle'), content: error.message }),
  });

  const refundMutation = useMutation({
    mutationFn: (input: RefundSalesOverpaymentInput) => refundSalesOverpaymentToCash(input),
    onSuccess: () => {
      invalidate();
      message.success(t('salesOverpayments.message.refundSuccess'));
    },
    onError: (error: Error) => modal.error({ title: t('salesOverpayments.error.refundTitle'), content: error.message }),
  });

  const reverseMutation = useMutation({
    mutationFn: ({ settlementId, reason }: { settlementId: string; reason: string }) => (
      reverseSalesOverpaymentSettlement(settlementId, reason)
    ),
    onSuccess: () => {
      invalidate();
      message.success(t('salesOverpayments.message.reverseSuccess'));
    },
    onError: (error: Error) => modal.error({ title: t('salesOverpayments.error.reverseTitle'), content: error.message }),
  });

  return {
    overpaymentRows,
    settlements,
    allocations,
    loadDetail: getSalesOverpaymentDetail,
    listTargets: listSalesOverpaymentTargetInvoices,
    allocateToInvoices: allocateMutation.mutateAsync,
    refundToCash: refundMutation.mutateAsync,
    reverseSettlement: reverseMutation.mutateAsync,
    isMutating: allocateMutation.isPending || refundMutation.isPending || reverseMutation.isPending,
  };
};
