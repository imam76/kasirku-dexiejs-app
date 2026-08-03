import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { PosTransactionPayment, Transaction, TransactionItem } from '../types';
import { groupPosPaymentsByTransaction } from '@/utils/posSplitPayment';
import { voidTransaction as voidTransactionService } from '@/services/transactionVoidService';
import {
  filterTransactionHistory,
  normalizeTransactionHistorySearch,
} from '@/utils/transactionHistorySearch';

interface TransactionWithItems extends Transaction {
  items?: TransactionItem[];
  payments?: PosTransactionPayment[];
}

const PAGE_SIZE = 10;

export const useHistory = () => {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPageState] = useState(1);
  const [searchTerm, setSearchTermState] = useState('');
  const normalizedSearchTerm = normalizeTransactionHistorySearch(searchTerm);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['transactions-history', page, normalizedSearchTerm],
    queryFn: async () => {
      let transactions: Transaction[];
      let totalCount: number;

      if (normalizedSearchTerm) {
        const [allTransactions, allItems, products] = await Promise.all([
          db.transactions.orderBy('created_at').reverse().toArray(),
          db.transactionItems.toArray(),
          db.products.toArray(),
        ]);
        const filteredTransactions = filterTransactionHistory(
          allTransactions,
          allItems,
          products,
          normalizedSearchTerm,
        );
        totalCount = filteredTransactions.length;
        const lastPage = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
        const currentPage = Math.min(page, lastPage);
        const from = (currentPage - 1) * PAGE_SIZE;
        transactions = filteredTransactions.slice(from, from + PAGE_SIZE);
      } else {
        totalCount = await db.transactions.count();
        const lastPage = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
        const currentPage = Math.min(page, lastPage);
        const from = (currentPage - 1) * PAGE_SIZE;
        transactions = await db.transactions
          .orderBy('created_at')
          .reverse()
          .offset(from)
          .limit(PAGE_SIZE)
          .toArray();
      }

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
        totalCount,
      };
    },
  });

  const setPage = useCallback((nextPage: number) => {
    setExpandedId(null);
    setPageState(Math.max(1, nextPage));
  }, []);

  const setSearchTerm = useCallback((value: string) => {
    setExpandedId(null);
    setPageState(1);
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
    transactions: data?.data ?? [],
    totalCount: data?.totalCount ?? 0,
    page,
    pageSize: PAGE_SIZE,
    searchTerm,
    expandedId,
    isLoading,
    isError,
    error,
    setPage,
    setSearchTerm,
    toggleExpand,
    refetch,
    voidTransaction: voidMutation.mutateAsync,
    isVoiding: voidMutation.isPending,
  };
};
