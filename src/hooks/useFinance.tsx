import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { App } from 'antd';
import { addFinanceTransaction, recalculateFinance } from '@/services/financeService';
import type { FinanceTransactionType, PaymentMethod } from '@/types';
import { useI18n } from '@/hooks/useI18n';

export const useFinance = () => {
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

  const { data: transactions = [], isLoading: isLoadingTransactions } = useQuery({
    queryKey: ['financeTransactions'],
    queryFn: async () => {
      return await db.financeTransactions.orderBy('created_at').reverse().toArray();
    },
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
    isLoading: isLoadingBalance || isLoadingTransactions,
    addTransaction: addTransactionMutation.mutateAsync,
    isAdding: addTransactionMutation.isPending,
    recalculate: recalculateFinanceMutation.mutateAsync,
    isRecalculating: recalculateFinanceMutation.isPending,
  };
};
