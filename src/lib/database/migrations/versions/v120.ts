import type {
  FinanceTransaction,
  PosTransactionPayment,
  Transaction,
  TransactionItem,
} from '@/types';
import { normalizeStoredTimestamp } from '@/utils/timestamps';
import type { KasirkuDB } from '../../KasirkuDB';

export function registerMigrationV120(db: KasirkuDB) {
  db.version(120).stores({}).upgrade(async (migration) => {
    await migration.table<Transaction>('transactions').toCollection().modify((transaction) => {
      transaction.created_at = normalizeStoredTimestamp(transaction.created_at) ?? transaction.created_at;
      transaction.updated_at = normalizeStoredTimestamp(transaction.updated_at) ?? transaction.updated_at;
      transaction.voided_at = normalizeStoredTimestamp(transaction.voided_at);
      transaction.receipt_printed_at = normalizeStoredTimestamp(transaction.receipt_printed_at);
      transaction.last_synced_at = normalizeStoredTimestamp(transaction.last_synced_at);
      transaction.remote_updated_at = normalizeStoredTimestamp(transaction.remote_updated_at);
    });

    await migration.table<TransactionItem>('transactionItems').toCollection().modify((item) => {
      item.created_at = normalizeStoredTimestamp(item.created_at) ?? item.created_at;
      item.price_edited_at = normalizeStoredTimestamp(item.price_edited_at);
      item.hpp_reconciled_at = normalizeStoredTimestamp(item.hpp_reconciled_at);
    });

    await migration.table<PosTransactionPayment>('posTransactionPayments').toCollection().modify((payment) => {
      payment.created_at = normalizeStoredTimestamp(payment.created_at) ?? payment.created_at;
    });

    await migration.table<FinanceTransaction>('financeTransactions').toCollection().modify((transaction) => {
      transaction.created_at = normalizeStoredTimestamp(transaction.created_at) ?? transaction.created_at;
      transaction.updated_at = normalizeStoredTimestamp(transaction.updated_at);
      transaction.deleted_at = normalizeStoredTimestamp(transaction.deleted_at);
      transaction.cash_bank_reconciled_at = normalizeStoredTimestamp(transaction.cash_bank_reconciled_at);
      transaction.last_synced_at = normalizeStoredTimestamp(transaction.last_synced_at);
      transaction.remote_updated_at = normalizeStoredTimestamp(transaction.remote_updated_at);
    });
  });
}
