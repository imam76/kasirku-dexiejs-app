import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { db } from '@/lib/db';
import {
  createCashBankReconciliation,
  listCashBankReconciliationCandidates,
  listCashBankReconciliations,
  voidCashBankReconciliation,
  type CreateCashBankReconciliationInput,
} from '@/services/cashBankReconciliationService';

export const useCashBankReconciliation = ({
  cashAccountId,
  statementDate,
}: {
  cashAccountId?: string;
  statementDate?: string;
} = {}) => {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();

  const cashBankAccountsQuery = useQuery({
    queryKey: ['cashBankReconciliationAccounts'],
    queryFn: async () => {
      const transactions = await db.financeTransactions
        .filter((transaction) => !transaction.deleted_at && Boolean(transaction.cash_account_id))
        .toArray();
      const usedCashAccountIds = new Set(transactions.map((transaction) => transaction.cash_account_id as string));

      return db.chartOfAccounts
        .orderBy('code')
        .filter((account) => (
          account.type === 'ASSET' &&
          account.is_active &&
          account.is_postable &&
          usedCashAccountIds.has(account.id)
        ))
        .toArray();
    },
  });

  const adjustmentAccountsQuery = useQuery({
    queryKey: ['cashBankReconciliationAdjustmentAccounts', cashAccountId],
    queryFn: async () => db.chartOfAccounts
      .orderBy('code')
      .filter((account) => (
        account.is_active &&
        account.is_postable &&
        account.id !== cashAccountId
      ))
      .toArray(),
  });

  const candidatesQuery = useQuery({
    queryKey: ['cashBankReconciliationCandidates', cashAccountId, statementDate],
    queryFn: () => listCashBankReconciliationCandidates({ cashAccountId, statementDate }),
    enabled: Boolean(cashAccountId && statementDate),
  });

  const reconciliationsQuery = useQuery({
    queryKey: ['cashBankReconciliations', cashAccountId ?? 'ALL'],
    queryFn: () => listCashBankReconciliations(cashAccountId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['cashBankReconciliationAccounts'] });
    queryClient.invalidateQueries({ queryKey: ['cashBankReconciliationCandidates'] });
    queryClient.invalidateQueries({ queryKey: ['cashBankReconciliations'] });
    queryClient.invalidateQueries({ queryKey: ['financeTransactions'] });
    queryClient.invalidateQueries({ queryKey: ['financeBalance'] });
    queryClient.invalidateQueries({ queryKey: ['profitBalance'] });
    queryClient.invalidateQueries({ queryKey: ['profitLogs'] });
    queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
    queryClient.invalidateQueries({ queryKey: ['trialBalance'] });
    queryClient.invalidateQueries({ queryKey: ['incomeStatement'] });
    queryClient.invalidateQueries({ queryKey: ['balanceSheet'] });
  };

  const createMutation = useMutation({
    mutationFn: (input: CreateCashBankReconciliationInput) => createCashBankReconciliation(input),
    onSuccess: () => {
      invalidate();
      message.success('Rekonsiliasi Cash & Bank berhasil disimpan.');
    },
    onError: (error: Error) => {
      modal.error({
        title: 'Rekonsiliasi Cash & Bank gagal',
        content: error.message,
      });
    },
  });

  const voidMutation = useMutation({
    mutationFn: ({ reconciliationId, reason }: { reconciliationId: string; reason: string }) => (
      voidCashBankReconciliation(reconciliationId, reason)
    ),
    onSuccess: () => {
      invalidate();
      message.success('Rekonsiliasi Cash & Bank berhasil di-void.');
    },
    onError: (error: Error) => {
      modal.error({
        title: 'Void rekonsiliasi gagal',
        content: error.message,
      });
    },
  });

  return {
    cashBankAccounts: cashBankAccountsQuery.data ?? [],
    isLoadingCashBankAccounts: cashBankAccountsQuery.isLoading,
    adjustmentAccounts: adjustmentAccountsQuery.data ?? [],
    isLoadingAdjustmentAccounts: adjustmentAccountsQuery.isLoading,
    candidates: candidatesQuery.data,
    isLoadingCandidates: candidatesQuery.isLoading,
    reconciliations: reconciliationsQuery.data ?? [],
    isLoadingReconciliations: reconciliationsQuery.isLoading,
    createReconciliation: createMutation.mutateAsync,
    isCreatingReconciliation: createMutation.isPending,
    voidReconciliation: voidMutation.mutateAsync,
    isVoidingReconciliation: voidMutation.isPending,
  };
};
