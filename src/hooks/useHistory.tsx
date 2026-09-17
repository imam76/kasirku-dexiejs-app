import { useCallback, useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { voidTransaction as voidTransactionService } from '@/services/transactionVoidService';
import { listTransactionHistoryPage } from '@/services/transactionHistoryReadService';
import type { DateIdCursor } from '@/services/shared/dateIdCursor';
import {
  normalizeTransactionHistorySearch,
} from '@/utils/transactionHistorySearch';

const PAGE_SIZE = 20;

export const useHistory = ({
  startDate,
  endDate,
}: {
  startDate: string;
  endDate: string;
}) => {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchTerm, setSearchTermState] = useState('');
  const normalizedSearchTerm = normalizeTransactionHistorySearch(searchTerm);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['transactions-history', startDate, endDate, normalizedSearchTerm],
    queryFn: ({ pageParam }) => listTransactionHistoryPage({
      startDate,
      endDate,
      search: normalizedSearchTerm,
      cursor: pageParam,
      limit: PAGE_SIZE,
    }),
    initialPageParam: undefined as DateIdCursor | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const transactions = useMemo(() => {
    const uniqueRows = new Map(
      (data?.pages ?? []).flatMap((result) => result.rows)
        .map((transaction) => [transaction.id, transaction] as const),
    );
    return [...uniqueRows.values()];
  }, [data?.pages]);

  const loadMore = useCallback(async () => {
    setExpandedId(null);
    await fetchNextPage();
  }, [fetchNextPage]);

  const setSearchTerm = useCallback((value: string) => {
    setExpandedId(null);
    setSearchTermState(value);
  }, []);

  const toggleExpand = (transactionId: string) => {
    setExpandedId((currentId) => currentId === transactionId ? null : transactionId);
  };

  const voidMutation = useMutation({
    mutationFn: voidTransactionService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions-history'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['profitBalance'] });
      queryClient.invalidateQueries({ queryKey: ['profitLogs'] });
      queryClient.invalidateQueries({ queryKey: ['financeBalance'] });
      queryClient.invalidateQueries({ queryKey: ['financeTransactions'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      queryClient.invalidateQueries({ queryKey: ['trialBalance'] });
      queryClient.invalidateQueries({ queryKey: ['incomeStatement'] });
      queryClient.invalidateQueries({ queryKey: ['balanceSheet'] });
      queryClient.invalidateQueries({ queryKey: ['posSalesReport'] });
      queryClient.invalidateQueries({ queryKey: ['transactionDetailReport'] });
      queryClient.invalidateQueries({ queryKey: ['expenseReport'] });
      queryClient.invalidateQueries({ queryKey: ['expenseCategories'] });
    },
  });

  return {
    transactions,
    searchTerm,
    expandedId,
    isLoading,
    isLoadingMore: isFetchingNextPage,
    hasMore: Boolean(hasNextPage),
    isError,
    error,
    loadMore,
    setSearchTerm,
    toggleExpand,
    refetch,
    voidTransaction: voidMutation.mutateAsync,
    isVoiding: voidMutation.isPending,
  };
};
