import { FINANCE_CATEGORIES } from '@/constants/finance';
import { db } from '@/lib/db';
import type { AuthUser, FinanceTransaction, StockPurchase } from '@/types';
import { withPendingFinanceTransactionSync } from '@/services/financeTransactionSyncService';
import { getFinanceAccountSnapshotForCategory } from '@/utils/chartOfAccounts/getFinanceAccountSnapshotForCategory';
import { getCashOrBankAccountForPayment, postStockPurchaseJournal } from '@/services/generalLedgerService';

interface RecordStockPurchaseInput {
  productId: string;
  productName: string;
  sku?: string;
  quantity: number;
  costPerUnit: number;
  totalCost: number;
  description: string;
  createdAt: string;
  actor?: Pick<AuthUser, 'id' | 'name'> | null;
}

export interface RecordStockPurchaseResult {
  purchase: StockPurchase;
  financeTransaction: FinanceTransaction;
}

export const recordStockPurchase = async ({
  productId,
  productName,
  sku,
  quantity,
  costPerUnit,
  totalCost,
  description,
  createdAt,
  actor,
}: RecordStockPurchaseInput): Promise<RecordStockPurchaseResult> => {
  const purchase: StockPurchase = {
    id: crypto.randomUUID(),
    product_id: productId,
    product_name: productName,
    sku,
    quantity,
    cost_per_unit: costPerUnit,
    total_cost: totalCost,
    created_at: createdAt,
    updated_at: createdAt,
  };
  let financeTransaction: FinanceTransaction | undefined;

  await db.transaction('rw', [
    db.stockPurchases,
    db.financeBalance,
    db.financeTransactions,
    db.chartOfAccounts,
    db.financeAccountMappings,
    db.enabledModules,
    db.journalEntries,
    db.journalEntryLines,
  ], async () => {
    await db.stockPurchases.add(purchase);

    const currentFinanceBalance = await db.financeBalance.get('current');
    await db.financeBalance.put({
      id: 'current',
      amount: (currentFinanceBalance?.amount || 0) - totalCost,
      updated_at: createdAt,
    });
    const cashAccount = await getCashOrBankAccountForPayment('TUNAI');

    financeTransaction = withPendingFinanceTransactionSync({
      id: crypto.randomUUID(),
      type: 'EXPENSE',
      category: FINANCE_CATEGORIES.STOCK_PURCHASE,
      amount: totalCost,
      description,
      created_at: createdAt,
      reference_id: purchase.id,
      payment_method: 'TUNAI',
      cash_account_id: cashAccount.id,
      cash_account_code: cashAccount.code,
      cash_account_name: cashAccount.name,
      ...await getFinanceAccountSnapshotForCategory(FINANCE_CATEGORIES.STOCK_PURCHASE),
    }, undefined, createdAt);
    await db.financeTransactions.add(financeTransaction);

    await postStockPurchaseJournal(purchase, actor);
  });

  if (!financeTransaction) {
    throw new Error('Finance transaction pembelian stok gagal dibuat.');
  }

  return {
    purchase,
    financeTransaction,
  };
};
