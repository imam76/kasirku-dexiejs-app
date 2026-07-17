import { useState, useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { PosTransactionPayment, Transaction, TransactionItem } from '../types';
import { groupPosPaymentsByTransaction } from '@/utils/posSplitPayment';
import { voidTransaction as voidTransactionService } from '@/services/transactionVoidService';

interface TransactionWithItems extends Transaction {
  items?: TransactionItem[];
  payments?: PosTransactionPayment[];
}

const PAGE_SIZE = 10;

export const useHistory = () => {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['transactions-history'],
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam * PAGE_SIZE;

      const transactions = await db.transactions
        .orderBy('created_at')
        .reverse()
        .offset(from)
        .limit(PAGE_SIZE)
        .toArray();

      const count = await db.transactions.count();

      const ids = transactions.map((transaction) => transaction.id);
      const [items, payments] = ids.length > 0 ? await Promise.all([
        db.transactionItems.where('transaction_id').anyOf(ids).toArray(),
        db.posTransactionPayments.where('transaction_id').anyOf(ids).toArray(),
      ]) : [[], []];
      const itemsByTransaction = new Map<string, TransactionItem[]>();
      items.forEach((item) => itemsByTransaction.set(item.transaction_id, [...(itemsByTransaction.get(item.transaction_id) ?? []), item]));
      const paymentsByTransaction = groupPosPaymentsByTransaction(payments);
      const data = transactions.map((transaction) => ({
        ...transaction,
        items: itemsByTransaction.get(transaction.id) ?? [],
        payments: paymentsByTransaction.get(transaction.id) ?? [],
      } as TransactionWithItems));

      return {
        data,
        nextPage: data.length === PAGE_SIZE ? pageParam + 1 : undefined,
        totalCount: count,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });

  const transactions = useMemo(() => {
    return data?.pages.flatMap((page) => page.data) ?? [];
  }, [data]);

  const toggleExpand = (transactionId: string) => {
    setExpandedId(expandedId === transactionId ? null : transactionId);
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
    },
  });

  return {
    transactions,
    expandedId,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    isError,
    error,
    toggleExpand,
    loadMore: fetchNextPage,
    refetch,
    voidTransaction: voidMutation.mutateAsync,
    isVoiding: voidMutation.isPending,
  };
};
