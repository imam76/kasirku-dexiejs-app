import {
  FINANCE_CATEGORIES,
  getFinanceTransactionBusinessType,
  isProfitAffectingFinanceTransaction,
  normalizeFinanceTransactionType,
} from '@/constants/finance';
import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import type { FinanceTransaction, FinanceTransactionType, PaymentMethod } from '@/types';
import { getCashOrBankAccountForPayment } from '@/services/generalLedgerService';
import { getFinanceAccountSnapshotForCategory } from '@/utils/chartOfAccounts/getFinanceAccountSnapshotForCategory';
import { isTransactionActive } from '@/utils/transactions';

interface AddFinanceTransactionInput {
  type: FinanceTransactionType;
  category: string;
  amount: number;
  description: string;
  payment_method?: PaymentMethod;
  payment_channel?: string;
  cash_account_id?: string;
}

export const addFinanceTransaction = async ({
  type,
  category,
  amount,
  description,
  payment_method,
  payment_channel,
  cash_account_id,
}: AddFinanceTransactionInput) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');
  const normalizedType = normalizeFinanceTransactionType(type, category);
  const currentBalance = await db.financeBalance.get('current');
  const currentAmount = currentBalance?.amount || 0;

  const currentProfitBalance = await db.profitBalance.get('current');
  const currentProfitAmount = currentProfitBalance?.amount || 0;

  const now = new Date().toISOString();
  let newBalance = currentAmount;
  let newProfitBalance = currentProfitAmount;
  const affectsProfit = isProfitAffectingFinanceTransaction(normalizedType, category);
  const accountSnapshot = await getFinanceAccountSnapshotForCategory(category);
  const paymentMethod = payment_method ?? 'TUNAI';
  const cashAccount = await getCashOrBankAccountForPayment(paymentMethod, cash_account_id);

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

  let transactionId = '';

  await db.transaction('rw', [db.financeBalance, db.financeTransactions, db.profitBalance, db.profitLogs], async () => {
    await db.financeBalance.put({
      id: 'current',
      amount: newBalance,
      updated_at: now,
    });

    transactionId = crypto.randomUUID();
    await db.financeTransactions.add({
      id: transactionId,
      type: normalizedType,
      category,
      amount,
      description,
      created_at: now,
      payment_method: paymentMethod,
      payment_channel,
      cash_account_id: cashAccount.id,
      cash_account_code: cashAccount.code,
      cash_account_name: cashAccount.name,
      ...accountSnapshot,
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

  await writeActivityLog({
    user: currentUser,
    action: 'FINANCE_TRANSACTION_CREATED',
    entity: 'financeTransactions',
    entity_id: transactionId,
    description: `${currentUser?.name ?? 'User'} mencatat transaksi finance ${category} sebesar ${amount}.`,
  });
};

export const recalculateFinance = async () => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');

  await db.transaction('rw', [db.transactions, db.transactionItems, db.financeTransactions, db.financeBalance, db.stockPurchases, db.chartOfAccounts, db.financeAccountMappings], async () => {
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
      const accountSnapshot = await getFinanceAccountSnapshotForCategory(FINANCE_CATEGORIES.SALES);
      const cashAccount = await getCashOrBankAccountForPayment(transaction.payment_method);
      newAutoTransactions.push({
        id: crypto.randomUUID(),
        type: 'INCOME',
        category: FINANCE_CATEGORIES.SALES,
        amount: transaction.total_amount,
        description: `Penjualan dari transaksi ${transaction.transaction_number}`,
        created_at: transaction.created_at,
        reference_id: transaction.id,
        payment_method: transaction.payment_method,
        cash_account_id: cashAccount.id,
        cash_account_code: cashAccount.code,
        cash_account_name: cashAccount.name,
        ...accountSnapshot,
      });
    }

    for (const stockPurchase of stockPurchases) {
      const accountSnapshot = await getFinanceAccountSnapshotForCategory(FINANCE_CATEGORIES.STOCK_PURCHASE);
      const cashAccount = await getCashOrBankAccountForPayment('TUNAI');
      newAutoTransactions.push({
        id: crypto.randomUUID(),
        type: 'EXPENSE',
        category: FINANCE_CATEGORIES.STOCK_PURCHASE,
        amount: stockPurchase.total_cost,
        description: `Beli Stok: ${stockPurchase.product_name} (${stockPurchase.quantity} pcs)`,
        created_at: stockPurchase.created_at,
        reference_id: stockPurchase.id,
        payment_method: 'TUNAI',
        cash_account_id: cashAccount.id,
        cash_account_code: cashAccount.code,
        cash_account_name: cashAccount.name,
        ...accountSnapshot,
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

  await writeActivityLog({
    user: currentUser,
    action: 'FINANCE_RECALCULATED',
    entity: 'financeBalance',
    entity_id: 'current',
    description: `${currentUser?.name ?? 'User'} menghitung ulang saldo finance.`,
  });
};
