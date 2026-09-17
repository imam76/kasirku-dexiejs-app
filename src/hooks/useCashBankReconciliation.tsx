import { useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { db } from '@/lib/db';
import {
  createCashBankReconciliation,
  listCashBankReconciliationCandidates,
  listCashBankReconciliations,
  voidCashBankReconciliation,
  type CreateCashBankReconciliationInput,
} from '@/services/cashBankReconciliationService';
import type { DateIdCursor } from '@/services/shared/dateIdCursor';

export const useCashBankReconciliation = ({
  cashAccountId,
  statementDate,
  historyStartDate = '0000-01-01T00:00:00.000Z',
  historyEndDate = '\uffff',
}: {
  cashAccountId?: string;
  statementDate?: string;
  historyStartDate?: string;
  historyEndDate?: string;
} = {}) => {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();

  const cashBankAccountsQuery = useQuery({
    queryKey: ['cashBankReconciliationAccounts'],
    queryFn: async () => {
      const usedCashAccountIds = new Set(
        (await db.financeTransactions.orderBy('cash_account_id').uniqueKeys())
          .filter((key): key is string => typeof key === 'string' && key.length > 0),
      );

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

  const reconciliationsQuery = useInfiniteQuery({
    queryKey: [
      'cashBankReconciliations',
      cashAccountId ?? 'ALL',
      historyStartDate,
      historyEndDate,
    ],
    queryFn: ({ pageParam }) => listCashBankReconciliations({
      cashAccountId,
      startDate: historyStartDate,
      endDate: historyEndDate,
      cursor: pageParam,
      limit: 20,
    }),
    initialPageParam: undefined as DateIdCursor | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  const reconciliations = useMemo(() => {
    const uniqueRows = new Map(
      (reconciliationsQuery.data?.pages ?? []).flatMap((page) => page.rows)
        .map((row) => [row.id, row] as const),
    );
    return [...uniqueRows.values()];
  }, [reconciliationsQuery.data?.pages]);

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
    reconciliations,
    isLoadingReconciliations: reconciliationsQuery.isLoading,
    isLoadingMoreReconciliations: reconciliationsQuery.isFetchingNextPage,
    hasMoreReconciliations: Boolean(reconciliationsQuery.hasNextPage),
    loadMoreReconciliations: reconciliationsQuery.fetchNextPage,
    createReconciliation: createMutation.mutateAsync,
    isCreatingReconciliation: createMutation.isPending,
    voidReconciliation: voidMutation.mutateAsync,
    isVoidingReconciliation: voidMutation.isPending,
  };
};
