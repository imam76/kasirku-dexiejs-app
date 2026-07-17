import type * as DatabaseTypes from '@/types';
import { buildLegacyPosTransactionPayment } from '@/utils/posSplitPayment';
import type { KasirkuDB } from '../../KasirkuDB';

export function registerMigrationV099(db: KasirkuDB) {
  db.version(99).stores({
    posTransactionPayments: 'id, transaction_id, [transaction_id+sequence], payment_method_id, payment_method_code, created_at',
  }).upgrade(async (tx) => {
    const transactionTable = tx.table<DatabaseTypes.Transaction, string>('transactions');
    const paymentTable = tx.table<DatabaseTypes.PosTransactionPayment, string>('posTransactionPayments');
    const transactions = await transactionTable.toArray();
    if (transactions.length === 0) return;

    await paymentTable.bulkPut(transactions.map(buildLegacyPosTransactionPayment));
    await transactionTable.bulkPut(transactions.map((transaction) => ({
      ...transaction,
      payment_mode: 'SINGLE' as const,
    })));
  });
}
