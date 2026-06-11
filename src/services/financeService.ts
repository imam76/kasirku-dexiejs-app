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
import {
  enqueueFinanceTransactionsSync,
  withDeletedFinanceTransactionSync,
  withPendingFinanceTransactionSync,
} from '@/services/financeTransactionSyncService';
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
  let financeTransaction: FinanceTransaction | undefined;

  await db.transaction('rw', [db.financeBalance, db.financeTransactions, db.profitBalance, db.profitLogs], async () => {
    await db.financeBalance.put({
      id: 'current',
      amount: newBalance,
      updated_at: now,
    });

    transactionId = crypto.randomUUID();
    financeTransaction = withPendingFinanceTransactionSync({
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
    }, currentUser, now);
    await db.financeTransactions.add(financeTransaction);

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

  if (financeTransaction) {
    await enqueueFinanceTransactionsSync([financeTransaction], 'create');
  }

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
  const now = new Date().toISOString();
  const deletedAutoTransactions: FinanceTransaction[] = [];
  const newAutoTransactions: FinanceTransaction[] = [];

  await db.transaction('rw', [
    db.transactions,
    db.transactionItems,
    db.financeTransactions,
    db.financeBalance,
    db.stockPurchases,
    db.purchaseDocuments,
    db.purchaseInvoicePayments,
    db.chartOfAccounts,
    db.financeAccountMappings,
    db.generalLedgerSetting,
  ], async () => {
    const autoCategories = [
      FINANCE_CATEGORIES.SALES,
      FINANCE_CATEGORIES.AUTO_COGS,
      FINANCE_CATEGORIES.STOCK_PURCHASE,
    ];
    const existingAutoTransactions = await db.financeTransactions
      .where('category')
      .anyOf(autoCategories)
      .filter((transaction) => !!transaction.reference_id)
      .toArray();

    if (existingAutoTransactions.length > 0) {
      deletedAutoTransactions.push(
        ...existingAutoTransactions.map((transaction) => (
          withDeletedFinanceTransactionSync(transaction, currentUser, now)
        )),
      );
      await db.financeTransactions.bulkDelete(existingAutoTransactions.map((transaction) => transaction.id));
    }

    const posTransactions = (await db.transactions.toArray()).filter(isTransactionActive);
    const stockPurchases = await db.stockPurchases.toArray();
    const purchaseInvoicePayments = (await db.purchaseInvoicePayments.toArray())
      .filter((payment) => payment.status === 'ACTIVE');
    const existingPurchaseInvoicePaymentReferenceIds = new Set(
      (await db.financeTransactions
        .where('category')
        .equals(FINANCE_CATEGORIES.PURCHASE_INVOICE_PAYMENT)
        .filter((transaction) => Boolean(transaction.reference_id) && !transaction.deleted_at)
        .toArray())
        .map((transaction) => transaction.reference_id as string),
    );

    for (const transaction of posTransactions) {
      const accountSnapshot = await getFinanceAccountSnapshotForCategory(FINANCE_CATEGORIES.SALES);
      const cashAccount = await getCashOrBankAccountForPayment(transaction.payment_method);
      newAutoTransactions.push(withPendingFinanceTransactionSync({
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
      }, currentUser, now));
    }

    for (const stockPurchase of stockPurchases) {
      const accountSnapshot = await getFinanceAccountSnapshotForCategory(FINANCE_CATEGORIES.STOCK_PURCHASE);
      const cashAccount = await getCashOrBankAccountForPayment('TUNAI');
      newAutoTransactions.push(withPendingFinanceTransactionSync({
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
      }, currentUser, now));
    }

    for (const payment of purchaseInvoicePayments) {
      if (existingPurchaseInvoicePaymentReferenceIds.has(payment.id)) continue;

      const document = await db.purchaseDocuments.get(payment.purchase_document_id);
      if (!document || document.type !== 'PURCHASE_INVOICE' || document.status === 'VOIDED') continue;

      const paymentMethod = payment.payment_method ?? document.payment_method ?? 'TUNAI';
      const cashAccount = await getCashOrBankAccountForPayment(paymentMethod, payment.cash_account_id);
      newAutoTransactions.push(withPendingFinanceTransactionSync({
        id: crypto.randomUUID(),
        type: 'EXPENSE',
        category: FINANCE_CATEGORIES.PURCHASE_INVOICE_PAYMENT,
        amount: Number(payment.amount || 0),
        description: `Pembayaran purchase invoice ${payment.document_number}`,
        created_at: payment.paid_at,
        reference_id: payment.id,
        payment_method: paymentMethod,
        payment_channel: payment.payment_channel,
        cash_account_id: cashAccount.id,
        cash_account_code: cashAccount.code,
        cash_account_name: cashAccount.name,
        account_id: cashAccount.id,
        account_code: cashAccount.code,
        account_name: cashAccount.name,
        account_type: cashAccount.type,
      }, currentUser, now));
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
      updated_at: now,
    });
  });

  if (deletedAutoTransactions.length > 0) {
    await enqueueFinanceTransactionsSync(deletedAutoTransactions, 'delete');
  }
  if (newAutoTransactions.length > 0) {
    await enqueueFinanceTransactionsSync(newAutoTransactions, 'create');
  }

  await writeActivityLog({
    user: currentUser,
    action: 'FINANCE_RECALCULATED',
    entity: 'financeBalance',
    entity_id: 'current',
    description: `${currentUser?.name ?? 'User'} menghitung ulang saldo finance.`,
  });
};
