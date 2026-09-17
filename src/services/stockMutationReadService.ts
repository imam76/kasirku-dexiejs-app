import { db } from '@/lib/db';
import {
  isTauriRuntime,
  stockMutationPostgresAdapter,
  type RemoteStockMutationDto,
} from '@/services/postgresAdapter';
import { pullStoredUpdatedAtIdPages } from '@/services/shared/syncCursorStore';
import { getStockAfterMutation } from '@/services/shared/stockMutationMaterialization';
import type { Product, StockMutation } from '@/types';
import { toCanonicalIsoTimestamp } from '@/utils/timestamps';

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
  occurred_at: toCanonicalIsoTimestamp(remote.occurred_at),
  created_at: toCanonicalIsoTimestamp(remote.created_at),
});

/**
 * The ledger is append-only and rows are immutable once created. A remote row materializes its
 * stock effect only when its id is not present locally yet. Keeping the product update and ledger
 * insert in one transaction makes retries idempotent: either both writes commit, or neither does.
 */
export const mergeRemoteStockMutationsIntoDexie = async (
  remoteMutations: RemoteStockMutationDto[],
): Promise<StockMutationReadSyncResult> => {
  const result = { ...EMPTY_STOCK_MUTATION_READ_SYNC_RESULT, fetched: remoteMutations.length };
  if (remoteMutations.length === 0) return result;

  // Defensive de-duplication also prevents a malformed/repeated page from applying a delta twice.
  const toPut = [...new Map(
    remoteMutations
      .map(mapRemoteStockMutationToLocal)
      .map((mutation) => [mutation.id, mutation]),
  ).values()];

  await db.transaction('rw', db.stockMutations, db.products, async () => {
    const existingIds = new Set(
      await db.stockMutations.where('id').anyOf(toPut.map((mutation) => mutation.id)).primaryKeys(),
    );
    const newMutations = toPut.filter((mutation) => !existingIds.has(mutation.id));
    result.inserted = newMutations.length;

    const productCache = new Map<string, Product | undefined>();
    for (const mutation of newMutations) {
      const product = productCache.has(mutation.product_id)
        ? productCache.get(mutation.product_id)
        : await db.products.get(mutation.product_id);
      if (!product) continue;

      const stock = getStockAfterMutation(Number(product.stock || 0), mutation);
      await db.products.update(product.id, { stock });
      productCache.set(product.id, { ...product, stock });
    }

    await db.stockMutations.bulkPut(toPut);
  });

  return result;
};

export const refreshStockMutationsFromPostgres = async (): Promise<StockMutationReadSyncResult> => {
  if (isRefreshingStockMutationsFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_STOCK_MUTATION_READ_SYNC_RESULT };
  }

  isRefreshingStockMutationsFromPostgres = true;
  try {
    const aggregate = { ...EMPTY_STOCK_MUTATION_READ_SYNC_RESULT };
    await pullStoredUpdatedAtIdPages({
      entity: 'stockMutations',
      pageSize: STOCK_MUTATION_REFRESH_LIMIT,
      loadPage: (cursor) => stockMutationPostgresAdapter.list({
        serverCreatedAfter: cursor?.updatedAt,
        cursorId: cursor?.id,
        limit: STOCK_MUTATION_REFRESH_LIMIT,
      }),
      mergePage: async (remoteMutations) => {
        const result = await mergeRemoteStockMutationsIntoDexie(remoteMutations);
        aggregate.fetched += result.fetched;
        aggregate.inserted += result.inserted;
      },
      getUpdatedAt: (mutation) => mutation.server_created_at ?? mutation.created_at,
      getId: (mutation) => mutation.id,
    });

    return aggregate;
  } finally {
    isRefreshingStockMutationsFromPostgres = false;
  }
};
