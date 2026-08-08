import { db } from '@/lib/db';
import {
  isTauriRuntime,
  stockMutationPostgresAdapter,
  type RemoteStockMutationDto,
} from '@/services/postgresAdapter';
import { getLaterUpdatedAt } from '@/services/shared/remoteRefreshCursor';
import type { StockMutation } from '@/types';

export interface StockMutationReadSyncResult {
  fetched: number;
  inserted: number;
}

const EMPTY_STOCK_MUTATION_READ_SYNC_RESULT: StockMutationReadSyncResult = {
  fetched: 0,
  inserted: 0,
};

const STOCK_MUTATION_REFRESH_LIMIT = 500;

let isRefreshingStockMutationsFromPostgres = false;

const optionalString = (value: string | null | undefined) => value ?? undefined;

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

const mapRemoteStockMutationToLocal = (remote: RemoteStockMutationDto): StockMutation => ({
  id: remote.id,
  product_id: remote.product_id,
  product_name: remote.product_name,
  sku: optionalString(remote.sku),
  warehouse_id: optionalString(remote.warehouse_id),
  warehouse_code: optionalString(remote.warehouse_code),
  warehouse_name: optionalString(remote.warehouse_name),
  source_type: remote.source_type,
  source_id: remote.source_id,
  source_number: optionalString(remote.source_number),
  source_line_id: remote.source_line_id,
  quantity_delta: remote.quantity_delta,
  unit: remote.unit,
  stock_unit: remote.stock_unit,
  source_quantity: remote.source_quantity ?? undefined,
  source_unit: remote.source_unit ?? undefined,
  reason: optionalString(remote.reason),
  actor_user_id: optionalString(remote.actor_user_id),
  actor_user_name: optionalString(remote.actor_user_name),
  occurred_at: remote.occurred_at,
  created_at: remote.created_at,
});

/**
 * The ledger is append-only and rows are immutable once created (see
 * stock_mutation_repository.rs upsert_stock_mutation_in_tx), so merging never needs conflict
 * checks against local edits - a plain id-keyed bulkPut is safe and idempotent.
 */
export const mergeRemoteStockMutationsIntoDexie = async (
  remoteMutations: RemoteStockMutationDto[],
): Promise<StockMutationReadSyncResult> => {
  const result = { ...EMPTY_STOCK_MUTATION_READ_SYNC_RESULT, fetched: remoteMutations.length };
  if (remoteMutations.length === 0) return result;

  const existingIds = new Set(
    await db.stockMutations.where('id').anyOf(remoteMutations.map((mutation) => mutation.id)).primaryKeys(),
  );
  const toPut = remoteMutations.map(mapRemoteStockMutationToLocal);
  result.inserted = toPut.filter((mutation) => !existingIds.has(mutation.id)).length;

  await db.stockMutations.bulkPut(toPut);

  return result;
};

const getLatestLocalStockMutationCreatedAt = async () => {
  const mutations = await db.stockMutations.toArray();
  return mutations.reduce<string | undefined>(
    (latest, mutation) => getLaterUpdatedAt(latest, mutation.created_at),
    undefined,
  );
};

const getLatestRemoteStockMutationCreatedAt = (remoteMutations: RemoteStockMutationDto[]) => (
  remoteMutations.reduce<string | undefined>(
    (latest, mutation) => getLaterUpdatedAt(latest, mutation.created_at),
    undefined,
  )
);

export const refreshStockMutationsFromPostgres = async (): Promise<StockMutationReadSyncResult> => {
  if (isRefreshingStockMutationsFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_STOCK_MUTATION_READ_SYNC_RESULT };
  }

  isRefreshingStockMutationsFromPostgres = true;
  try {
    const aggregate = { ...EMPTY_STOCK_MUTATION_READ_SYNC_RESULT };
    let createdAfter = await getLatestLocalStockMutationCreatedAt();

    while (true) {
      const remoteMutations = await stockMutationPostgresAdapter.list({
        createdAfter,
        limit: STOCK_MUTATION_REFRESH_LIMIT,
      });
      const result = await mergeRemoteStockMutationsIntoDexie(remoteMutations);
      aggregate.fetched += result.fetched;
      aggregate.inserted += result.inserted;

      if (remoteMutations.length < STOCK_MUTATION_REFRESH_LIMIT) break;

      const nextCreatedAfter = getLatestRemoteStockMutationCreatedAt(remoteMutations);
      if (!nextCreatedAfter || nextCreatedAfter === createdAfter) break;
      createdAfter = nextCreatedAfter;
    }

    return aggregate;
  } finally {
    isRefreshingStockMutationsFromPostgres = false;
  }
};
