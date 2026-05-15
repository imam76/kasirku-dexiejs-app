import {
  FINANCE_CATEGORIES,
  getFinanceTransactionBusinessType,
  isProfitAffectingFinanceTransaction,
  normalizeFinanceTransactionType,
} from '@/constants/finance';
import { db } from '@/lib/db';
import type { FinanceTransaction, FinanceTransactionType } from '@/types';
import { isTransactionActive } from '@/utils/transactions';

interface AddFinanceTransactionInput {
  type: FinanceTransactionType;
  category: string;
  amount: number;
  description: string;
}

export const addFinanceTransaction = async ({
  type,
  category,
  amount,
  description,
}: AddFinanceTransactionInput) => {
  const normalizedType = normalizeFinanceTransactionType(type, category);
  const currentBalance = await db.financeBalance.get('current');
  const currentAmount = currentBalance?.amount || 0;

  const currentProfitBalance = await db.profitBalance.get('current');
  const currentProfitAmount = currentProfitBalance?.amount || 0;

  const now = new Date().toISOString();
  let newBalance = currentAmount;
  let newProfitBalance = currentProfitAmount;
  const affectsProfit = isProfitAffectingFinanceTransaction(normalizedType, category);

  if (normalizedType === 'INCOME' || normalizedType === 'OPENING_BALANCE') {
    newBalance += amount;
    if (affectsProfit) {
      newProfitBalance += amount;
    }
  } else if (normalizedType === 'EXPENSE') {
    newBalance -= amount;
    if (affectsProfit) {
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
      type: normalizedType,
      category,
      amount,
      description,
      created_at: now,
    });

    if (affectsProfit) {
      await db.profitBalance.put({
        id: 'current',
        amount: newProfitBalance,
        updated_at: now,
      });

      await db.profitLogs.add({
        id: crypto.randomUUID(),
        amount,
        type: normalizedType === 'EXPENSE' ? 'OUT' : 'IN',
        category: 'OPERATIONAL',
        description: `Operasional: ${description || category}`,
        created_at: now,
        balance_after: newProfitBalance,
      });
    }
  });
};

export const recalculateFinance = async () => {
  await db.transaction('rw', [db.transactions, db.transactionItems, db.financeTransactions, db.financeBalance, db.stockPurchases], async () => {
    const autoCategories = [
      FINANCE_CATEGORIES.SALES,
      FINANCE_CATEGORIES.AUTO_COGS,
      FINANCE_CATEGORIES.STOCK_PURCHASE,
    ];
    await db.financeTransactions
      .where('category')
      .anyOf(autoCategories)
      .filter((transaction) => !!transaction.reference_id)
      .delete();

    const posTransactions = (await db.transactions.toArray()).filter(isTransactionActive);
    const stockPurchases = await db.stockPurchases.toArray();
    const newAutoTransactions: FinanceTransaction[] = [];

    for (const transaction of posTransactions) {
      newAutoTransactions.push({
        id: crypto.randomUUID(),
        type: 'INCOME',
        category: FINANCE_CATEGORIES.SALES,
        amount: transaction.total_amount,
        description: `Penjualan dari transaksi ${transaction.transaction_number}`,
        created_at: transaction.created_at,
        reference_id: transaction.id,
      });
    }

    for (const stockPurchase of stockPurchases) {
      newAutoTransactions.push({
        id: crypto.randomUUID(),
        type: 'EXPENSE',
        category: FINANCE_CATEGORIES.STOCK_PURCHASE,
        amount: stockPurchase.total_cost,
        description: `Beli Stok: ${stockPurchase.product_name} (${stockPurchase.quantity} pcs)`,
        created_at: stockPurchase.created_at,
        reference_id: stockPurchase.id,
      });
    }

    if (newAutoTransactions.length > 0) {
      await db.financeTransactions.bulkAdd(newAutoTransactions);
    }

    const allTransactions = await db.financeTransactions.toArray();
    let runningBalance = 0;

    for (const transaction of allTransactions) {
      const businessType = getFinanceTransactionBusinessType(transaction);

      if (businessType === 'INCOME' || businessType === 'OPENING_BALANCE') {
        runningBalance += transaction.amount;
      } else if (businessType === 'EXPENSE') {
        runningBalance -= transaction.amount;
      }
    }

    await db.financeBalance.put({
      id: 'current',
      amount: runningBalance,
      updated_at: new Date().toISOString(),
    });
  });
};
