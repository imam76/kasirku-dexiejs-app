import { db } from '@/lib/db';
import type { FinanceTransaction, Product, StockMutation, TransactionItem } from '@/types';
import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';
import { konversiSatuanProduk } from '@/utils/pricing';
import { resolveTransactionItemUnit } from '@/utils/salesUnits';
import { getTransactionProfit, isTransactionVoided } from '@/utils/transactions';
import { reversePosSaleJournal } from '@/services/generalLedgerService';
import { createStockMutation, enqueueStockMutations } from '@/services/stockMutationSyncService';
import { enqueueFinanceTransactionsSync, withDeletedFinanceTransactionSync } from '@/services/financeTransactionSyncService';
import { addInventoryLot } from '@/utils/inventory/addInventoryLot';
import { normalisasiHargaProduk } from '@/utils/pricing';

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
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'TRANSACTION_VOID');

  const now = new Date().toISOString();
  const normalizedReason = reason.trim() || 'Transaksi dibatalkan';
  let transactionNumber = transactionId;
  const stockMutations: StockMutation[] = [];
  const deletedFinanceTransactions: FinanceTransaction[] = [];

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
      db.enabledModules,
      db.generalLedgerSetting,
      db.journalEntries,
      db.journalEntryLines,
      db.inventoryLots,
    ],
    async () => {
      const transaction = await db.transactions.get(transactionId);
      if (!transaction) {
        throw new Error('Transaksi tidak ditemukan');
      }
      transactionNumber = transaction.transaction_number;

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

        if (returnedQuantity > 0) {
          // Create a FIFO lot for the returned stock using the cost snapshot from the original sale
          const costPerStockUnit = normalisasiHargaProduk(
            item.purchase_price,
            product,
            item.unit,
            product.purchase_unit,
          );
          await addInventoryLot({
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            sourceType: 'POS_VOID',
            sourceId: transaction.id,
            sourceLineId: item.id,
            quantityReceived: returnedQuantity,
            costPerUnit: costPerStockUnit,
            costStatus: item.hpp_status ?? 'FINAL',
            receivedAt: now,
          });

          const sourceUnit = resolveTransactionItemUnit(item, product);
          stockMutations.push(createStockMutation({
            product,
            sourceType: 'POS_TRANSACTION_VOID',
            sourceId: transaction.id,
            sourceNumber: transaction.transaction_number,
            sourceLineId: item.id,
            quantityDelta: returnedQuantity,
            sourceQuantity: item.quantity,
            sourceUnit,
            reason: normalizedReason,
            actor: currentUser,
            occurredAt: now,
          }));
        }
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

      const financeTransactionsToDelete = await db.financeTransactions
        .where('reference_id')
        .equals(transaction.id)
        .toArray();

      if (financeTransactionsToDelete.length > 0) {
        deletedFinanceTransactions.push(
          ...financeTransactionsToDelete.map((financeTransaction) => (
            withDeletedFinanceTransactionSync(financeTransaction, currentUser, now)
          )),
        );
        await db.financeTransactions.bulkDelete(financeTransactionsToDelete.map((financeTransaction) => financeTransaction.id));
      }

      await db.financeBalance.put({
        id: 'current',
        amount: nextFinanceBalance,
        updated_at: now,
      });

      await reversePosSaleJournal(transaction, `Pembalikan jurnal POS ${transaction.transaction_number}: ${normalizedReason}`, currentUser);
    },
  );

  await enqueueStockMutations(stockMutations);
  if (deletedFinanceTransactions.length > 0) {
    await enqueueFinanceTransactionsSync(deletedFinanceTransactions, 'delete');
  }

  await writeActivityLog({
    user: currentUser,
    action: 'TRANSACTION_VOID',
    entity: 'transactions',
    entity_id: transactionId,
    description: `${currentUser?.name ?? 'User'} membatalkan transaksi ${transactionNumber}. Alasan: ${normalizedReason}`,
  });
};
