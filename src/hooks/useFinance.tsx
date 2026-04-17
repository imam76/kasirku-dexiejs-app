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
        // Pengeluaran manual juga mengurangi profit
        newProfitBalance -= amount;
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
          category !== 'PEMBELIAN_STOK' && 
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
      await db.transaction('rw', [db.transactions, db.transactionItems, db.financeTransactions, db.financeBalance, db.stockPurchases], async () => {
        // 1. Delete only auto-generated entries (those with reference_id)
        const autoCategories = ['PENJUALAN', 'HPP_OTOMATIS', 'PEMBELIAN_STOK'];
        await db.financeTransactions
          .where('category')
          .anyOf(autoCategories)
          .filter(t => !!t.reference_id)
          .delete();

        // 2. Get source data for auto-regeneration
        const posTransactions = await db.transactions.toArray();
        const stockPurchases = await db.stockPurchases.toArray();

        // 3. Create new auto-generated entries
        const newAutoTransactions: FinanceTransaction[] = [];
        
        // Sales entries
        for (const t of posTransactions) {
          newAutoTransactions.push({
            id: crypto.randomUUID(),
            type: 'INCOME',
            category: 'PENJUALAN',
            amount: t.total_amount,
            description: `Penjualan dari transaksi ${t.transaction_number}`,
            created_at: t.created_at,
            reference_id: t.id,
          });
        }

        // Stock Purchase entries
        for (const sp of stockPurchases) {
          newAutoTransactions.push({
            id: crypto.randomUUID(),
            type: 'EXPENSE',
            category: 'PEMBELIAN_STOK',
            amount: sp.total_cost,
            description: `Beli Stok: ${sp.product_name} (${sp.quantity} pcs)`,
            created_at: sp.created_at,
            reference_id: sp.id,
          });
        }

        // 4. Save new auto-generated entries
        if (newAutoTransactions.length > 0) {
          await db.financeTransactions.bulkAdd(newAutoTransactions);
        }

        // 5. Calculate final balance from ALL transactions (manual + new auto)
        const allTransactions = await db.financeTransactions.toArray();
        let runningBalance = 0;
        
        for (const ft of allTransactions) {
          if (ft.type === 'INCOME' || ft.type === 'OPENING_BALANCE') {
            runningBalance += ft.amount;
          } else if (ft.type === 'EXPENSE') {
            runningBalance -= ft.amount;
          }
        }

        // 6. Update final balance
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
