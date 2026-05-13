import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { App } from 'antd';
import { recalculateProfit, withdrawProfit } from '@/services/profitService';

export const useProfit = () => {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();

  const { data: balance = 0, isLoading: isLoadingBalance } = useQuery({
    queryKey: ['profitBalance'],
    queryFn: async () => {
      const result = await db.profitBalance.get('current');
      return result?.amount || 0;
    },
  });

  const { data: logs = [], isLoading: isLoadingLogs } = useQuery({
    queryKey: ['profitLogs'],
    queryFn: async () => {
      return await db.profitLogs.orderBy('created_at').reverse().toArray();
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: withdrawProfit,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profitBalance'] });
      queryClient.invalidateQueries({ queryKey: ['profitLogs'] });
      queryClient.invalidateQueries({ queryKey: ['financeBalance'] });
      queryClient.invalidateQueries({ queryKey: ['financeTransactions'] });
      message.success('Penarikan berhasil');
    },
    onError: (error: Error) => {
      modal.error({
        title: 'Gagal Menarik Saldo',
        content: error.message || 'Terjadi kesalahan saat menarik saldo.',
      });
    },
  });

  const recalculateMutation = useMutation({
    mutationFn: recalculateProfit,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profitBalance'] });
      queryClient.invalidateQueries({ queryKey: ['profitLogs'] });
      message.success('Saldo berhasil dihitung ulang');
    },
    onError: (error: Error) => {
      console.error('Recalculate error:', error);
      modal.error({
        title: 'Gagal Menghitung Ulang',
        content: error.message || 'Terjadi kesalahan saat menghitung ulang saldo.',
      });
    },
  });

  return {
    balance,
    logs,
    isLoading: isLoadingBalance || isLoadingLogs,
    withdraw: withdrawMutation.mutateAsync,
    isWithdrawing: withdrawMutation.isPending,
    recalculate: recalculateMutation.mutateAsync,
    isRecalculating: recalculateMutation.isPending,
  };
};
