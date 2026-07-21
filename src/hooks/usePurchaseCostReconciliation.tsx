import { App } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listPendingPurchaseCosts, reconcilePurchaseReceiptCost, type ReconcilePurchaseReceiptCostInput } from '@/services/purchaseCostReconciliationService';

export const usePurchaseCostReconciliation = () => {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const pendingCostsQuery = useQuery({
    queryKey: ['pendingPurchaseCosts'],
    queryFn: listPendingPurchaseCosts,
  });
  const reconcileMutation = useMutation({
    mutationFn: (input: ReconcilePurchaseReceiptCostInput) => reconcilePurchaseReceiptCost(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingPurchaseCosts'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseDocuments'] });
      queryClient.invalidateQueries({ queryKey: ['transactions-history'] });
      queryClient.invalidateQueries({ queryKey: ['profitBalance'] });
      queryClient.invalidateQueries({ queryKey: ['profitLogs'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      queryClient.invalidateQueries({ queryKey: ['trialBalance'] });
      queryClient.invalidateQueries({ queryKey: ['incomeStatement'] });
      queryClient.invalidateQueries({ queryKey: ['balanceSheet'] });
      message.success('Rekonsiliasi HPP berhasil disimpan.');
    },
    onError: (error: Error) => {
      modal.error({ title: 'Rekonsiliasi HPP gagal', content: error.message });
    },
  });

  return {
    pendingCosts: pendingCostsQuery.data ?? [],
    isLoadingPendingCosts: pendingCostsQuery.isLoading,
    refetchPendingCosts: pendingCostsQuery.refetch,
    reconcilePurchaseReceiptCost: reconcileMutation.mutateAsync,
    isReconciling: reconcileMutation.isPending,
  };
};
