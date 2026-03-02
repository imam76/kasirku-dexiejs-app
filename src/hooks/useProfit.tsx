import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { App } from 'antd';

export const useProfit = () => {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();

  const { data: balance = 0, isLoading: isLoadingBalance } = useQuery({
    queryKey: ['profitBalance'],
    queryFn: async () => {
      const result = await db.profitBalance.get('current');
      return result?.amount || 0;
    },
  });

  const { data: logs = [], isLoading: isLoadingLogs } = useQuery({
    queryKey: ['profitLogs'],
    queryFn: async () => {
      return await db.profitLogs.orderBy('created_at').reverse().toArray();
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: async ({ amount, description }: { amount: number; description: string }) => {
      const currentBalance = await db.profitBalance.get('current');
      const currentAmount = currentBalance?.amount || 0;

      if (amount > currentAmount) {
        throw new Error('Saldo tidak mencukupi');
      }

      const now = new Date().toISOString();
      const newBalance = currentAmount - amount;

      await db.transaction('rw', db.profitBalance, db.profitLogs, async () => {
        await db.profitBalance.put({
          id: 'current',
          amount: newBalance,
          updated_at: now,
        });

        await db.profitLogs.add({
          id: crypto.randomUUID(),
          amount: amount,
          type: 'OUT',
          description,
          created_at: now,
          balance_after: newBalance,
        });
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profitBalance'] });
      queryClient.invalidateQueries({ queryKey: ['profitLogs'] });
      message.success('Penarikan berhasil');
    },
    onError: (error: any) => {
      modal.error({
        title: 'Gagal Menarik Saldo',
        content: error.message || 'Terjadi kesalahan saat menarik saldo.',
      });
    },
  });

  const recalculateMutation = useMutation({
    mutationFn: async () => {
      await db.transaction('rw', db.transactions, db.transactionItems, db.profitLogs, db.profitBalance, async () => {
        // 1. Clear existing profit logs (IN only) and balance
        // We need to keep OUT logs but will update their balance_after
        const withdrawLogs = await db.profitLogs.where('type').equals('OUT').toArray();
        await db.profitLogs.clear(); // Clear all logs to rebuild correctly

        // 2. Get all transactions and items
        const transactions = await db.transactions.orderBy('created_at').toArray();
        const items = await db.transactionItems.toArray();

        // Group items by transaction_id
        const itemsByTransaction = items.reduce((acc, item) => {
          if (!acc[item.transaction_id]) acc[item.transaction_id] = [];
          acc[item.transaction_id].push(item);
          return acc;
        }, {} as Record<string, typeof items>);

        // 3. Combine transactions and withdraws into a single timeline
        const events = [
          ...transactions.map(t => ({ type: 'TRANSACTION', data: t, date: new Date(t.created_at).getTime() })),
          ...withdrawLogs.map(w => ({ type: 'WITHDRAW', data: w, date: new Date(w.created_at).getTime() }))
        ].sort((a, b) => a.date - b.date);

        // 4. Replay events to calculate balance
        let runningBalance = 0;
        const newLogs: any[] = [];

        for (const event of events) {
          if (event.type === 'TRANSACTION') {
            const t = event.data as any;
            const tItems = itemsByTransaction[t.id] || [];

            // Calculate profit for this transaction
            let profit = 0;
            for (const item of tItems) {
              // If profit is recorded, use it. If not, calculate it.
              if (typeof item.profit === 'number') {
                profit += item.profit;
              } else {
                // Fallback for old data: selling_price - purchase_price
                // Assuming purchase_price exists, otherwise 0
                const buyPrice = item.purchase_price || 0;
                const sellPrice = item.price || 0; // item.price is selling_price in TransactionItem
                profit += (sellPrice - buyPrice) * item.quantity;
              }
            }

            if (profit !== 0) {
              runningBalance += profit;
              newLogs.push({
                id: crypto.randomUUID(),
                transaction_id: t.id,
                amount: profit,
                type: 'IN',
                description: `Keuntungan dari transaksi ${t.transaction_number}`,
                created_at: t.created_at,
                balance_after: runningBalance,
              });
            }
          } else if (event.type === 'WITHDRAW') {
            const w = event.data as any;
            runningBalance -= w.amount;
            newLogs.push({
              ...w, // Keep original ID and other fields
              balance_after: runningBalance, // Update balance_after
            });
          }
        }

        // 5. Save new logs and update balance
        if (newLogs.length > 0) {
          await db.profitLogs.bulkAdd(newLogs);
        }
        await db.profitBalance.put({
          id: 'current',
          amount: runningBalance,
          updated_at: new Date().toISOString(),
        });
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profitBalance'] });
      queryClient.invalidateQueries({ queryKey: ['profitLogs'] });
      message.success('Saldo berhasil dihitung ulang');
    },
    onError: (error: any) => {
      console.error('Recalculate error:', error);
      modal.error({
        title: 'Gagal Menghitung Ulang',
        content: error.message || 'Terjadi kesalahan saat menghitung ulang saldo.',
      });
    },
  });

  return {
    balance,
    logs,
    isLoading: isLoadingBalance || isLoadingLogs,
    withdraw: withdrawMutation.mutateAsync,
    isWithdrawing: withdrawMutation.isPending,
    recalculate: recalculateMutation.mutateAsync,
    isRecalculating: recalculateMutation.isPending,
  };
};
