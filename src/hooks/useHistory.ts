import { useState, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { Transaction, TransactionItem } from '../types';

interface TransactionWithItems extends Transaction {
  items?: TransactionItem[];
}

const PAGE_SIZE = 10;

export const useHistory = () => {
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

      const data = await Promise.all(
        transactions.map(async (t) => {
          const items = await db.transactionItems
            .where('transaction_id')
            .equals(t.id)
            .toArray();
          return { ...t, items } as TransactionWithItems;
        })
      );

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
  };
};
