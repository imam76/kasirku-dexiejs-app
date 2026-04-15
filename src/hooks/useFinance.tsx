import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { App } from 'antd';
import { FinanceTransaction, FinanceTransactionType } from '@/types';

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
      const currentBalance = await db.financeBalance.get('current');
      const currentAmount = currentBalance?.amount || 0;

      const currentProfitBalance = await db.profitBalance.get('current');
      const currentProfitAmount = currentProfitBalance?.amount || 0;

      const now = new Date().toISOString();
      let newBalance = currentAmount;
      let newProfitBalance = currentProfitAmount;

      if (type === 'INCOME' || type === 'OPENING_BALANCE') {
        newBalance += amount;
        // Pemasukan manual (selain Penjualan yang ditangani useTransaction) juga masuk ke profit
        if (category !== 'PENJUALAN') {
          newProfitBalance += amount;
        }
      } else if (type === 'EXPENSE') {
        newBalance -= amount;
        // Pengeluaran manual (selain HPP yang ditangani useTransaction) juga mengurangi profit
        if (category !== 'HPP_OTOMATIS') {
          newProfitBalance -= amount;
        }
      }

      await db.transaction('rw', [db.financeBalance, db.financeTransactions, db.profitBalance, db.profitLogs], async () => {
        await db.financeBalance.put({
          id: 'current',
          amount: newBalance,
          updated_at: now,
        });

        await db.financeTransactions.add({
          id: crypto.randomUUID(),
          type,
          category,
          amount,
          description,
          created_at: now,
        });

        // Sync with profit if it's manual finance transaction (and not a withdrawal, which is handled in useProfit)
        if (
          category !== 'PENJUALAN' && 
          category !== 'HPP_OTOMATIS' && 
          category !== 'PENARIKAN_SALDO' &&
          type !== 'OPENING_BALANCE'
        ) {
          await db.profitBalance.put({
            id: 'current',
            amount: newProfitBalance,
            updated_at: now,
          });

          await db.profitLogs.add({
            id: crypto.randomUUID(),
            amount: amount,
            type: type === 'EXPENSE' ? 'OUT' : 'IN',
            category: 'OPERATIONAL',
            description: `Operasional: ${description || category}`,
            created_at: now,
            balance_after: newProfitBalance,
          });
        }
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
    mutationFn: async () => {
      await db.transaction('rw', [db.transactions, db.transactionItems, db.financeTransactions, db.financeBalance], async () => {
        // 1. Get all POS transactions and items to re-sync income and HPP
        const posTransactions = await db.transactions.toArray();
        const posItems = await db.transactionItems.toArray();
        
        // Group items by transaction_id to calculate HPP per transaction
        const hppByTransaction = posItems.reduce((acc, item) => {
          const hpp = (item.purchase_price || 0) * item.quantity;
          acc[item.transaction_id] = (acc[item.transaction_id] || 0) + hpp;
          return acc;
        }, {} as Record<string, number>);

        // 2. Get manual finance transactions (non-sales and non-auto-HPP)
        const manualTransactions = await db.financeTransactions
          .where('category')
          .noneOf(['PENJUALAN', 'HPP_OTOMATIS'])
          .toArray();

        // 3. Rebuild finance transactions
        await db.financeTransactions.clear();

        // 4. Create entries for Sales and HPP
        const autoTransactions: FinanceTransaction[] = [];
        
        for (const t of posTransactions) {
          const now = t.created_at;
          
          // Add Sales Income
          autoTransactions.push({
            id: crypto.randomUUID(),
            type: 'INCOME',
            category: 'PENJUALAN',
            amount: t.total_amount,
            description: `Penjualan dari transaksi ${t.transaction_number}`,
            created_at: now,
            reference_id: t.id,
          });

          // Add HPP Expense
          const hppAmount = hppByTransaction[t.id] || 0;
          if (hppAmount > 0) {
            autoTransactions.push({
              id: crypto.randomUUID(),
              type: 'EXPENSE',
              category: 'HPP_OTOMATIS',
              amount: hppAmount,
              description: `HPP dari transaksi ${t.transaction_number}`,
              created_at: now,
              reference_id: t.id,
            });
          }
        }

        // 5. Combine and sort
        const newFinanceTransactions: FinanceTransaction[] = [
          ...autoTransactions,
          ...manualTransactions
        ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        // 6. Calculate balance
        let runningBalance = 0;
        for (const ft of newFinanceTransactions) {
          if (ft.type === 'INCOME' || ft.type === 'OPENING_BALANCE') {
            runningBalance += ft.amount;
          } else if (ft.type === 'EXPENSE') {
            runningBalance -= ft.amount;
          }
        }

        // 7. Save
        if (newFinanceTransactions.length > 0) {
          await db.financeTransactions.bulkAdd(newFinanceTransactions);
        }
        await db.financeBalance.put({
          id: 'current',
          amount: runningBalance,
          updated_at: new Date().toISOString(),
        });
      });
    },
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
