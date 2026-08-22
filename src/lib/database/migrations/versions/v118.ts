import type { Promo, Transaction } from '@/types';
import type { KasirkuDB } from '../../KasirkuDB';

/**
 * transactions/promos had no cross-device sync before (see transaction_repository.rs and
 * promo_repository.rs - new this migration). Mark every existing row pending so the next
 * Sync DB run uploads sales/promos that until now only lived in this device's Dexie.
 */
export function registerMigrationV118(db: KasirkuDB) {
  db.version(118).stores({
    transactions: 'id, transaction_number, payment_method, payment_method_id, payment_method_code, cashier_session_id, restaurant_session_id, &restaurant_order_id, cashier_user_id, member_contact_id, member_number, created_at, updated_at, sync_status',
    promos: 'id, active, type, applies_to, voucher_code, priority, start_at, end_at, created_at, updated_at, sync_status',
  }).upgrade(async (tx) => {
    const transactionTable = tx.table<Transaction, string>('transactions');
    const transactions = await transactionTable.toArray();
    const transactionsToMark = transactions
      .filter((transaction) => !transaction.sync_status)
      .map((transaction) => ({
        ...transaction,
        updated_at: transaction.updated_at ?? transaction.created_at,
        sync_status: 'pending' as const,
        sync_error: undefined,
      }));
    if (transactionsToMark.length > 0) {
      await transactionTable.bulkPut(transactionsToMark);
    }

    const promoTable = tx.table<Promo, string>('promos');
    const promos = await promoTable.toArray();
    const promosToMark = promos
      .filter((promo) => !promo.sync_status)
      .map((promo) => ({ ...promo, sync_status: 'pending' as const, sync_error: undefined }));
    if (promosToMark.length > 0) {
      await promoTable.bulkPut(promosToMark);
    }
  });
}
