import { useMemo } from 'react';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { App } from 'antd';
import { addFinanceTransaction, recalculateFinance } from '@/services/financeService';
import type { FinanceTransactionType, PaymentMethod } from '@/types';
import { useI18n } from '@/hooks/useI18n';
import {
  listFinanceHistoryPage,
  readFinancePeriodOverview,
  type FinanceHistoryFilters,
} from '@/services/financeHistoryReadService';
import type { DateIdCursor } from '@/services/shared/dateIdCursor';

const FINANCE_HISTORY_PAGE_SIZE = 20;

export const useFinance = (filters: FinanceHistoryFilters) => {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const { t } = useI18n();

  const { data: balance = 0, isLoading: isLoadingBalance } = useQuery({
    queryKey: ['financeBalance'],
    queryFn: async () => {
      const result = await db.financeBalance.get('current');
      return result?.amount || 0;
    },
  });

  const historyQuery = useInfiniteQuery({
    queryKey: [
      'financeTransactions',
      'history',
      filters.startDate,
      filters.endDate,
      filters.accountId ?? 'ALL',
      filters.accountType ?? 'ALL',
    ],
    queryFn: ({ pageParam }) => listFinanceHistoryPage({
      ...filters,
      cursor: pageParam,
      limit: FINANCE_HISTORY_PAGE_SIZE,
    }),
    initialPageParam: undefined as DateIdCursor | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  const transactions = useMemo(() => {
    const uniqueTransactions = new Map(
      (historyQuery.data?.pages ?? []).flatMap((page) => page.rows)
        .map((transaction) => [transaction.id, transaction] as const),
    );
    return [...uniqueTransactions.values()];
  }, [historyQuery.data?.pages]);
  const overviewQuery = useQuery({
    queryKey: [
      'financeTransactions',
      'overview',
      filters.startDate,
      filters.endDate,
      filters.accountId ?? 'ALL',
      filters.accountType ?? 'ALL',
    ],
    queryFn: () => readFinancePeriodOverview(filters),
  });

  const addTransactionMutation = useMutation({
    mutationFn: async ({ 
      type, 
      category, 
      amount, 
      description,
      payment_method,
      payment_channel,
      cash_account_id,
    }: { 
      type: FinanceTransactionType; 
      category: string; 
      amount: number; 
      description: string;
      payment_method?: PaymentMethod;
      payment_channel?: string;
      cash_account_id?: string;
    }) => {
      await addFinanceTransaction({
        type,
        category,
        amount,
        description,
        payment_method,
        payment_channel,
        cash_account_id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cooperativeFieldCashReport'] });
      queryClient.invalidateQueries({ queryKey: ['cooperativeFieldCashCashDetail'] });
      queryClient.invalidateQueries({ queryKey: ['cooperativeCashReport'] });
      queryClient.invalidateQueries({ queryKey: ['cooperativeDailyFieldCashReport'] });
      queryClient.invalidateQueries({ queryKey: ['financeBalance'] });
      queryClient.invalidateQueries({ queryKey: ['financeTransactions'] });
      queryClient.invalidateQueries({ queryKey: ['profitBalance'] });
      queryClient.invalidateQueries({ queryKey: ['profitLogs'] });
      message.success(t('finance.transactionRecorded'));
    },
    onError: (error: Error) => {
      modal.error({
        title: t('finance.recordFailedTitle'),
        content: error.message || t('finance.recordFailedContent'),
      });
    },
  });

  const recalculateFinanceMutation = useMutation({
    mutationFn: recalculateFinance,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cooperativeFieldCashReport'] });
      queryClient.invalidateQueries({ queryKey: ['cooperativeFieldCashCashDetail'] });
      queryClient.invalidateQueries({ queryKey: ['cooperativeCashReport'] });
      queryClient.invalidateQueries({ queryKey: ['cooperativeDailyFieldCashReport'] });
      queryClient.invalidateQueries({ queryKey: ['financeBalance'] });
      queryClient.invalidateQueries({ queryKey: ['financeTransactions'] });
      message.success(t('finance.recalculateSuccess'));
    },
    onError: (error: Error) => {
      modal.error({
        title: t('finance.recalculateFailedTitle'),
        content: error.message || t('finance.recalculateFailedContent'),
      });
    },
  });

  return {
    balance,
    transactions,
    overview: overviewQuery.data,
    isLoading: isLoadingBalance || historyQuery.isLoading || overviewQuery.isLoading,
    isLoadingMore: historyQuery.isFetchingNextPage,
    hasMore: Boolean(historyQuery.hasNextPage),
    loadMore: historyQuery.fetchNextPage,
    addTransaction: addTransactionMutation.mutateAsync,
    isAdding: addTransactionMutation.isPending,
    recalculate: recalculateFinanceMutation.mutateAsync,
    isRecalculating: recalculateFinanceMutation.isPending,
  };
};
