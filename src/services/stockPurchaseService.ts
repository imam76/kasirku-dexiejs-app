import { FINANCE_CATEGORIES } from '@/constants/finance';
import { db } from '@/lib/db';
import type { StockPurchase } from '@/types';
import { getFinanceAccountSnapshotForCategory } from '@/utils/chartOfAccounts/getFinanceAccountSnapshotForCategory';

interface RecordStockPurchaseInput {
  productId: string;
  productName: string;
  sku?: string;
  quantity: number;
  costPerUnit: number;
  totalCost: number;
  description: string;
  createdAt: string;
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
}: RecordStockPurchaseInput): Promise<StockPurchase> => {
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

  await db.stockPurchases.add(purchase);

  const currentFinanceBalance = await db.financeBalance.get('current');
  await db.financeBalance.put({
    id: 'current',
    amount: (currentFinanceBalance?.amount || 0) - totalCost,
    updated_at: createdAt,
  });

  await db.financeTransactions.add({
    id: crypto.randomUUID(),
    type: 'EXPENSE',
    category: FINANCE_CATEGORIES.STOCK_PURCHASE,
    amount: totalCost,
    description,
    created_at: createdAt,
    reference_id: purchase.id,
    ...await getFinanceAccountSnapshotForCategory(FINANCE_CATEGORIES.STOCK_PURCHASE),
  });

  return purchase;
};
