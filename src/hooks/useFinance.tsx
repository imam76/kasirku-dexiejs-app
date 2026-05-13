import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { App } from 'antd';
import { addFinanceTransaction, recalculateFinance } from '@/services/financeService';
import type { FinanceTransactionType } from '@/types';

export const useFinance = () => {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();

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
      description 
    }: { 
      type: FinanceTransactionType; 
      category: string; 
      amount: number; 
      description: string;
    }) => {
      await addFinanceTransaction({
        type,
        category,
        amount,
        description,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeBalance'] });
      queryClient.invalidateQueries({ queryKey: ['financeTransactions'] });
      queryClient.invalidateQueries({ queryKey: ['profitBalance'] });
      queryClient.invalidateQueries({ queryKey: ['profitLogs'] });
      message.success('Transaksi keuangan berhasil dicatat');
    },
    onError: (error: Error) => {
      modal.error({
        title: 'Gagal Mencatat Transaksi',
        content: error.message || 'Terjadi kesalahan saat mencatat transaksi keuangan.',
      });
    },
  });

  const recalculateFinanceMutation = useMutation({
    mutationFn: recalculateFinance,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeBalance'] });
      queryClient.invalidateQueries({ queryKey: ['financeTransactions'] });
      message.success('Data keuangan berhasil dihitung ulang');
    },
    onError: (error: Error) => {
      modal.error({
        title: 'Gagal Menghitung Ulang',
        content: error.message || 'Terjadi kesalahan saat menghitung ulang data keuangan.',
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
