import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { db } from '@/lib/db';
import {
  recordCashBankTransfer,
  voidCashBankTransfer,
  type RecordCashBankTransferInput,
} from '@/services/cashBankTransferService';
import { useI18n } from '@/hooks/useI18n';

const invalidateCashBankTransferQueries = (queryClient: QueryClient) => {
  queryClient.invalidateQueries({ queryKey: ['cooperativeFieldCashReport'] });
  queryClient.invalidateQueries({ queryKey: ['cooperativeFieldCashCashDetail'] });
  queryClient.invalidateQueries({ queryKey: ['cooperativeCashReport'] });
  queryClient.invalidateQueries({ queryKey: ['cooperativeDailyFieldCashReport'] });
  queryClient.invalidateQueries({ queryKey: ['financeTransactions'] });
  queryClient.invalidateQueries({ queryKey: ['financeBalance'] });
  queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
  queryClient.invalidateQueries({ queryKey: ['trialBalance'] });
  queryClient.invalidateQueries({ queryKey: ['balanceSheet'] });
};

export const useCashBankTransfer = () => {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const { t } = useI18n();

  const { data: cashBankAccounts = [], isLoading: isLoadingCashBankAccounts } = useQuery({
    queryKey: ['cashBankAccounts'],
    queryFn: async () => {
      return db.chartOfAccounts
        .orderBy('code')
        .filter((account) => account.type === 'ASSET' && account.is_active && account.is_postable)
        .toArray();
    },
  });

  const recordTransferMutation = useMutation({
    mutationFn: (input: RecordCashBankTransferInput) => recordCashBankTransfer(input),
    onSuccess: () => {
      invalidateCashBankTransferQueries(queryClient);
      message.success(t('finance.transferSuccess'));
    },
    onError: (error: Error) => {
      modal.error({
        title: t('finance.transferFailedTitle'),
        content: error.message || t('finance.transferFailedContent'),
      });
    },
  });

  const voidTransferMutation = useMutation({
    mutationFn: ({ transferGroupId, reason }: { transferGroupId: string; reason: string }) => (
      voidCashBankTransfer(transferGroupId, reason)
    ),
    onSuccess: () => {
      invalidateCashBankTransferQueries(queryClient);
      message.success(t('finance.transferSuccess'));
    },
    onError: (error: Error) => {
      modal.error({
        title: t('finance.transferFailedTitle'),
        content: error.message || t('finance.transferFailedContent'),
      });
    },
  });

  return {
    cashBankAccounts,
    isLoadingCashBankAccounts,
    recordTransfer: recordTransferMutation.mutateAsync,
    isRecordingTransfer: recordTransferMutation.isPending,
    voidTransfer: voidTransferMutation.mutateAsync,
    isVoidingTransfer: voidTransferMutation.isPending,
  };
};
