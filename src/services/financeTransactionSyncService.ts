import { enqueueFinanceTransactionSync } from '@/services/syncQueueService';
import type { AuthUser, FinanceTransaction, SyncQueueOperation } from '@/types';

type FinanceTransactionActor = Pick<AuthUser, 'id' | 'name'> | null | undefined;

const toPositiveVersion = (version: number | null | undefined) => (
  typeof version === 'number' && Number.isFinite(version) && version > 0 ? version : 1
);

export const withPendingFinanceTransactionSync = (
  transaction: FinanceTransaction,
  actor?: FinanceTransactionActor,
  updatedAt = transaction.updated_at ?? transaction.created_at ?? new Date().toISOString(),
): FinanceTransaction => ({
  ...transaction,
  version: toPositiveVersion(transaction.version),
  created_by: transaction.created_by ?? actor?.id,
  created_by_name: transaction.created_by_name ?? actor?.name,
  updated_by: actor?.id ?? transaction.updated_by,
  updated_by_name: actor?.name ?? transaction.updated_by_name,
  updated_at: updatedAt,
  sync_status: 'pending',
  sync_error: undefined,
});

export const withDeletedFinanceTransactionSync = (
  transaction: FinanceTransaction,
  actor?: FinanceTransactionActor,
  deletedAt = new Date().toISOString(),
): FinanceTransaction => ({
  ...transaction,
  version: toPositiveVersion(transaction.version) + 1,
  updated_by: actor?.id ?? transaction.updated_by,
  updated_by_name: actor?.name ?? transaction.updated_by_name,
  updated_at: deletedAt,
  deleted_at: deletedAt,
  sync_status: 'pending',
  sync_error: undefined,
});

export const enqueueFinanceTransactionsSync = async (
  transactions: FinanceTransaction[],
  operation: Extract<SyncQueueOperation, 'create' | 'update' | 'delete'>,
) => {
  for (const transaction of transactions) {
    await enqueueFinanceTransactionSync(transaction, operation);
  }
};
