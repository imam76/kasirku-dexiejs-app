import { FINANCE_CATEGORIES, isProfitAffectingFinanceTransaction } from '@/constants/finance';
import { db } from '@/lib/db';
import type { FinanceTransaction, ProfitLog, Transaction } from '@/types';

interface WithdrawProfitInput {
  amount: number;
  description: string;
}

export const withdrawProfit = async ({ amount, description }: WithdrawProfitInput) => {
  const currentBalance = await db.profitBalance.get('current');
  const currentAmount = currentBalance?.amount || 0;

  if (amount > currentAmount) {
    throw new Error('Saldo tidak mencukupi');
  }

  const now = new Date().toISOString();
  const newBalance = currentAmount - amount;

  const currentFinanceBalance = await db.financeBalance.get('current');
  const currentFinanceAmount = currentFinanceBalance?.amount || 0;
  const newFinanceBalance = currentFinanceAmount - amount;

  await db.transaction('rw', [db.profitBalance, db.profitLogs, db.financeBalance, db.financeTransactions], async () => {
    await db.profitBalance.put({
      id: 'current',
      amount: newBalance,
      updated_at: now,
    });

    await db.profitLogs.add({
      id: crypto.randomUUID(),
      amount,
      type: 'OUT',
      category: 'WITHDRAW',
      description,
      created_at: now,
      balance_after: newBalance,
    });

    await db.financeBalance.put({
      id: 'current',
      amount: newFinanceBalance,
      updated_at: now,
    });

    await db.financeTransactions.add({
      id: crypto.randomUUID(),
      type: 'EXPENSE',
      category: FINANCE_CATEGORIES.WITHDRAWAL,
      amount,
      description: `Penarikan Saldo: ${description}`,
      created_at: now,
    });
  });
};

export const recalculateProfit = async () => {
  await db.transaction('rw', [db.transactions, db.transactionItems, db.profitLogs, db.profitBalance, db.financeTransactions], async () => {
    const existingLogs = await db.profitLogs.toArray();
    const withdrawLogs = existingLogs.filter((log) =>
      log.type === 'OUT' &&
      (log.category === 'WITHDRAW' || !log.description.startsWith('Operasional: '))
    );

    await db.profitLogs.clear();

    const transactions = await db.transactions.orderBy('created_at').toArray();
    const items = await db.transactionItems.toArray();
    const manualFinanceTransactions = await db.financeTransactions
      .filter((transaction) => isProfitAffectingFinanceTransaction(transaction.type, transaction.category))
      .toArray();

    const itemsByTransaction = items.reduce((acc, item) => {
      if (!acc[item.transaction_id]) acc[item.transaction_id] = [];
      acc[item.transaction_id].push(item);
      return acc;
    }, {} as Record<string, typeof items>);

    const events = [
      ...transactions.map((transaction) => ({
        type: 'TRANSACTION',
        data: transaction,
        date: new Date(transaction.created_at).getTime(),
      })),
      ...withdrawLogs.map((withdraw) => ({
        type: 'WITHDRAW',
        data: withdraw,
        date: new Date(withdraw.created_at).getTime(),
      })),
      ...manualFinanceTransactions.map((transaction) => ({
        type: 'FINANCE_MANUAL',
        data: transaction,
        date: new Date(transaction.created_at).getTime(),
      })),
    ].sort((a, b) => a.date - b.date);

    let runningBalance = 0;
    const newLogs: ProfitLog[] = [];

    for (const event of events) {
      if (event.type === 'TRANSACTION') {
        const transaction = event.data as Transaction;
        const transactionItems = itemsByTransaction[transaction.id] || [];
        let profit = 0;

        for (const item of transactionItems) {
          if (typeof item.profit === 'number') {
            profit += item.profit;
          } else {
            const buyPrice = item.purchase_price || 0;
            const sellPrice = item.price || 0;
            profit += (sellPrice - buyPrice) * item.quantity;
          }
        }

        if (profit !== 0) {
          runningBalance += profit;
          newLogs.push({
            id: crypto.randomUUID(),
            transaction_id: transaction.id,
            amount: profit,
            type: 'IN',
            category: 'SALES',
            description: `Keuntungan dari transaksi ${transaction.transaction_number}`,
            created_at: transaction.created_at,
            balance_after: runningBalance,
          });
        }
      } else if (event.type === 'WITHDRAW') {
        const withdraw = event.data as ProfitLog;
        runningBalance -= withdraw.amount;
        newLogs.push({
          ...withdraw,
          category: 'WITHDRAW',
          balance_after: runningBalance,
        });
      } else if (event.type === 'FINANCE_MANUAL') {
        const transaction = event.data as FinanceTransaction;
        const isExpense = transaction.type === 'EXPENSE';
        const amount = isExpense ? -transaction.amount : transaction.amount;

        runningBalance += amount;
        newLogs.push({
          id: crypto.randomUUID(),
          amount: transaction.amount,
          type: isExpense ? 'OUT' : 'IN',
          category: 'OPERATIONAL',
          description: `Operasional: ${transaction.description || transaction.category}`,
          created_at: transaction.created_at,
          balance_after: runningBalance,
        });
      }
    }

    if (newLogs.length > 0) {
      await db.profitLogs.bulkAdd(newLogs);
    }

    await db.profitBalance.put({
      id: 'current',
      amount: runningBalance,
      updated_at: new Date().toISOString(),
    });
  });
};
