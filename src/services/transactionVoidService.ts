import { db } from '@/lib/db';
import type { Product, TransactionItem } from '@/types';
import { konversiSatuanProduk } from '@/utils/pricing';
import { resolveTransactionItemUnit } from '@/utils/salesUnits';
import { getTransactionProfit, isTransactionVoided } from '@/utils/transactions';

interface VoidTransactionInput {
  transactionId: string;
  reason: string;
}

const numberOrFallback = (value: unknown, fallback: number) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

const getReturnedStockQuantity = (item: TransactionItem, product: Product) => {
  if (item.base_unit && item.conversion_value) {
    const quantityInBaseUnit = item.quantity * numberOrFallback(item.conversion_value, 1);
    return konversiSatuanProduk(quantityInBaseUnit, product, item.base_unit, product.purchase_unit);
  }

  return konversiSatuanProduk(
    item.quantity,
    product,
    resolveTransactionItemUnit(item, product),
    product.purchase_unit,
  );
};

export const voidTransaction = async ({ transactionId, reason }: VoidTransactionInput) => {
  const now = new Date().toISOString();
  const normalizedReason = reason.trim() || 'Transaksi dibatalkan';

  await db.transaction(
    'rw',
    [
      db.transactions,
      db.transactionItems,
      db.products,
      db.profitLogs,
      db.profitBalance,
      db.financeTransactions,
      db.financeBalance,
    ],
    async () => {
      const transaction = await db.transactions.get(transactionId);
      if (!transaction) {
        throw new Error('Transaksi tidak ditemukan');
      }

      if (isTransactionVoided(transaction)) {
        throw new Error('Transaksi sudah dibatalkan');
      }

      const items = await db.transactionItems
        .where('transaction_id')
        .equals(transactionId)
        .toArray();

      for (const item of items) {
        const product = await db.products.get(item.product_id);
        if (!product) continue;

        const returnedQuantity = getReturnedStockQuantity(item, product);
        await db.products.update(product.id, {
          stock: product.stock + returnedQuantity,
        });
      }

      await db.transactions.update(transactionId, {
        status: 'VOIDED',
        voided_at: now,
        void_reason: normalizedReason,
      });

      const totalProfit = getTransactionProfit(items);
      const currentProfitBalance = await db.profitBalance.get('current');
      const nextProfitBalance = (currentProfitBalance?.amount || 0) - totalProfit;

      await db.profitBalance.put({
        id: 'current',
        amount: nextProfitBalance,
        updated_at: now,
      });

      if (totalProfit !== 0) {
        await db.profitLogs.add({
          id: crypto.randomUUID(),
          transaction_id: transaction.id,
          amount: Math.abs(totalProfit),
          type: totalProfit > 0 ? 'OUT' : 'IN',
          category: 'VOID',
          description: `Pembatalan profit transaksi ${transaction.transaction_number}: ${normalizedReason}`,
          created_at: now,
          balance_after: nextProfitBalance,
        });
      }

      const currentFinanceBalance = await db.financeBalance.get('current');
      const nextFinanceBalance = (currentFinanceBalance?.amount || 0) - transaction.total_amount;

      await db.financeTransactions
        .where('reference_id')
        .equals(transaction.id)
        .delete();

      await db.financeBalance.put({
        id: 'current',
        amount: nextFinanceBalance,
        updated_at: now,
      });
    },
  );
};
