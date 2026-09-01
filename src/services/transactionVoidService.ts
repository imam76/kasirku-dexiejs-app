import { db } from '@/lib/db';
import type { FinanceTransaction, Membership, Product, StockMutation, TransactionItem } from '@/types';
import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';
import { konversiSatuanProduk } from '@/utils/pricing';
import { resolveTransactionItemUnit } from '@/utils/salesUnits';
import { getTransactionProfit, isTransactionExpense, isTransactionVoided } from '@/utils/transactions';
import { reversePosExpenseJournal, reversePosSaleJournal } from '@/services/generalLedgerService';
import { createStockMutation, enqueueStockMutations } from '@/services/stockMutationSyncService';
import { enqueueFinanceTransactionsSync, withDeletedFinanceTransactionSync } from '@/services/financeTransactionSyncService';
import { addInventoryLot } from '@/utils/inventory/addInventoryLot';
import { normalisasiHargaProduk } from '@/utils/pricing';
import { recordMembershipPointTransaction } from '@/services/membershipService';
import { enqueueMembershipSync, enqueueStockAffectedProductsForSync, enqueueTransactionBundleSync } from '@/services/syncQueueService';

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
  const touchedProductIds = new Set<string>();
  const deletedFinanceTransactions: FinanceTransaction[] = [];
  let updatedMemberForSync: Membership | undefined;

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
      db.accountingPeriods,
      db.journalEntries,
      db.journalEntryLines,
      db.inventoryLots,
      db.memberships,
      db.membershipPointTransactions,
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

      const memberId = transaction.member_id ?? transaction.member_contact_id;
      const member = memberId
        ? await db.memberships.get(memberId)
        : undefined;

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
          sync_status: 'pending',
          sync_error: undefined,
        });
        touchedProductIds.add(product.id);

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
        updated_at: now,
        sync_status: 'pending',
        sync_error: undefined,
      });

      if (member && (
        Number(transaction.membership_points_earned || 0) > 0 ||
        Number(transaction.membership_points_redeemed || 0) > 0
      )) {
        const earnedPoints = Math.max(0, Math.floor(Number(transaction.membership_points_earned || 0)));
        const redeemedPoints = Math.max(0, Math.floor(Number(transaction.membership_points_redeemed || 0)));
        const redeemedAmount = Number(transaction.membership_point_discount_amount || 0);
        let runningBalance = Number(member.points_balance || 0);

        if (earnedPoints > 0) {
          runningBalance -= earnedPoints;
          await recordMembershipPointTransaction({
            member,
            transactionId: transaction.id,
            transactionNumber: transaction.transaction_number,
            type: 'VOID_EARN_REVERSAL',
            pointsDelta: -earnedPoints,
            amountValue: 0,
            balanceAfter: runningBalance,
            reason: `Pembatalan poin transaksi ${transaction.transaction_number}: ${normalizedReason}`,
            actor: currentUser,
            createdAt: now,
          });
        }

        if (redeemedPoints > 0) {
          runningBalance += redeemedPoints;
          await recordMembershipPointTransaction({
            member,
            transactionId: transaction.id,
            transactionNumber: transaction.transaction_number,
            type: 'VOID_REDEEM_REVERSAL',
            pointsDelta: redeemedPoints,
            amountValue: redeemedAmount,
            balanceAfter: runningBalance,
            reason: `Pengembalian poin redeem transaksi ${transaction.transaction_number}: ${normalizedReason}`,
            actor: currentUser,
            createdAt: now,
          });
        }

        updatedMemberForSync = {
          ...member,
          points_balance: runningBalance,
          updated_at: now,
          sync_status: 'pending',
          sync_error: undefined,
        };

        await db.memberships.put(updatedMemberForSync);
      }

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

      if (!isTransactionExpense(transaction)) {
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
      } else {
        await reversePosExpenseJournal(transaction, `Pembalikan pengeluaran POS ${transaction.transaction_number}: ${normalizedReason}`, currentUser);
      }
    },
  );

  await enqueueStockMutations(stockMutations);
  if (touchedProductIds.size > 0) {
    await enqueueStockAffectedProductsForSync(touchedProductIds);
  }
  if (deletedFinanceTransactions.length > 0) {
    await enqueueFinanceTransactionsSync(deletedFinanceTransactions, 'delete');
  }
  if (updatedMemberForSync) {
    await enqueueMembershipSync(updatedMemberForSync, 'update');
  }

  const voidedTransaction = await db.transactions.get(transactionId);
  if (voidedTransaction) {
    const voidedItems = await db.transactionItems.where('transaction_id').equals(transactionId).toArray();
    await enqueueTransactionBundleSync(voidedTransaction, voidedItems, 'update');
  }

  await writeActivityLog({
    user: currentUser,
    action: 'TRANSACTION_VOID',
    entity: 'transactions',
    entity_id: transactionId,
    description: `${currentUser?.name ?? 'User'} membatalkan transaksi ${transactionNumber}. Alasan: ${normalizedReason}`,
  });
};
