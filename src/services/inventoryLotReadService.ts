import { db } from '@/lib/db';
import {
  inventoryLotConsumptionPostgresAdapter,
  inventoryLotPostgresAdapter,
  isTauriRuntime,
  type RemoteInventoryLotConsumptionDto,
  type RemoteInventoryLotDto,
} from '@/services/postgresAdapter';
import { getLaterUpdatedAt, toTimestamp } from '@/services/shared/remoteRefreshCursor';
import { pullStoredUpdatedAtIdPages } from '@/services/shared/syncCursorStore';
import type { InventoryLot, InventoryLotConsumption } from '@/types';

export interface InventoryLotReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

const EMPTY_RESULT: InventoryLotReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
};

const INVENTORY_LOT_REFRESH_LIMIT = 500;
const INVENTORY_LOT_CONSUMPTION_REFRESH_LIMIT = 500;

let isRefreshingInventoryLotsFromPostgres = false;
let isRefreshingInventoryLotConsumptionsFromPostgres = false;

const optionalString = (value: string | null | undefined) => value ?? undefined;
const optionalNumber = (value: number | null | undefined) => value ?? undefined;

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

const hasLocalUnsyncedChanges = (item: { sync_status?: string }) => (
  item.sync_status === 'pending' || item.sync_status === 'failed'
);

const shouldApplyRemoteLot = (
  local: InventoryLot | undefined,
  remoteUpdatedAt: string,
) => {
  if (!local) return true;
  if (hasLocalUnsyncedChanges(local)) return false;

  const localRemoteUpdatedAt = local.remote_updated_at ?? local.updated_at;
  const remoteTimestamp = toTimestamp(remoteUpdatedAt);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteUpdatedAt >= localRemoteUpdatedAt;
};

const mapRemoteInventoryLotToLocal = (remote: RemoteInventoryLotDto, syncedAt: string): InventoryLot => ({
  id: remote.id,
  product_id: remote.product_id,
  product_name: remote.product_name,
  sku: optionalString(remote.sku),
  source_type: remote.source_type,
  source_id: optionalString(remote.source_id),
  source_line_id: optionalString(remote.source_line_id),
  quantity_received: remote.quantity_received,
  quantity_remaining: remote.quantity_remaining,
  cost_per_unit: remote.cost_per_unit,
  cost_status: remote.cost_status ?? undefined,
  estimate_source: remote.estimate_source ?? undefined,
  estimated_cost_per_unit: optionalNumber(remote.estimated_cost_per_unit),
  final_cost_per_unit: optionalNumber(remote.final_cost_per_unit),
  cost_finalized_at: optionalString(remote.cost_finalized_at),
  cost_reconciliation_id: optionalString(remote.cost_reconciliation_id),
  received_at: remote.received_at,
  created_at: remote.created_at,
  updated_at: remote.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remote.updated_at,
});

const mapRemoteInventoryLotConsumptionToLocal = (
  remote: RemoteInventoryLotConsumptionDto,
  syncedAt: string,
): InventoryLotConsumption => ({
  id: remote.id,
  lot_id: remote.lot_id,
  product_id: remote.product_id,
  product_name: remote.product_name,
  source_type: remote.source_type,
  source_id: remote.source_id,
  source_line_id: remote.source_line_id,
  quantity: remote.quantity,
  cost_per_unit_at_consumption: remote.cost_per_unit_at_consumption,
  cost_status_at_consumption: remote.cost_status_at_consumption,
  created_at: remote.created_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
});

/**
 * `quantity_remaining` is intentionally never overwritten on an existing local lot here - it
 * only moves through the atomic decrement applied server-side when a consumption event is
 * pushed (see inventory_lot_repository.rs upsert_inventory_lot_consumption). Overwriting it from
 * a pull could clobber a more recent local optimistic decrement from consumeFifoLots() that
 * hasn't finished pushing yet. This mirrors the same exclusion on the push/upsert side
 * (upsert_inventory_lot never updates quantity_remaining on conflict either) - the field only
 * ever gets its initial value once, at the lot's first insert on a given device.
 */
export const mergeRemoteInventoryLotsIntoDexie = async (
  remoteLots: RemoteInventoryLotDto[],
  syncedAt = new Date().toISOString(),
): Promise<InventoryLotReadSyncResult> => {
  const result = { ...EMPTY_RESULT, fetched: remoteLots.length };
  if (remoteLots.length === 0) return result;

  await db.transaction('rw', db.inventoryLots, async () => {
    for (const remote of remoteLots) {
      const local = await db.inventoryLots.get(remote.id);
      if (!shouldApplyRemoteLot(local, remote.updated_at)) {
        result.skipped += 1;
        continue;
      }

      if (local) {
        await db.inventoryLots.update(local.id, {
          product_name: remote.product_name,
          sku: optionalString(remote.sku),
          cost_per_unit: remote.cost_per_unit,
          cost_status: remote.cost_status ?? undefined,
          estimate_source: remote.estimate_source ?? undefined,
          estimated_cost_per_unit: optionalNumber(remote.estimated_cost_per_unit),
          final_cost_per_unit: optionalNumber(remote.final_cost_per_unit),
          cost_finalized_at: optionalString(remote.cost_finalized_at),
          cost_reconciliation_id: optionalString(remote.cost_reconciliation_id),
          updated_at: remote.updated_at,
          sync_status: 'synced',
          sync_error: undefined,
          last_synced_at: syncedAt,
          remote_updated_at: remote.updated_at,
        } satisfies Partial<InventoryLot>);
        result.updated += 1;
      } else {
        await db.inventoryLots.put(mapRemoteInventoryLotToLocal(remote, syncedAt));
        result.inserted += 1;
      }
    }
  });

  return result;
};

/**
 * Append-only, same as stock_mutations: a consumption id is immutable once created, so merging
 * never needs conflict checks - a plain id-keyed bulkPut is safe and idempotent.
 */
export const mergeRemoteInventoryLotConsumptionsIntoDexie = async (
  remoteConsumptions: RemoteInventoryLotConsumptionDto[],
  syncedAt = new Date().toISOString(),
): Promise<InventoryLotReadSyncResult> => {
  const result = { ...EMPTY_RESULT, fetched: remoteConsumptions.length };
  if (remoteConsumptions.length === 0) return result;

  const existingIds = new Set(
    await db.inventoryLotConsumptions
      .where('id')
      .anyOf(remoteConsumptions.map((consumption) => consumption.id))
      .primaryKeys(),
  );
  const toPut = remoteConsumptions.map((remote) => mapRemoteInventoryLotConsumptionToLocal(remote, syncedAt));
  result.inserted = toPut.filter((consumption) => !existingIds.has(consumption.id)).length;

  await db.inventoryLotConsumptions.bulkPut(toPut);

  return result;
};

export const refreshInventoryLotsFromPostgres = async (): Promise<InventoryLotReadSyncResult> => {
  if (isRefreshingInventoryLotsFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_RESULT };
  }

  isRefreshingInventoryLotsFromPostgres = true;
  try {
    const aggregate = { ...EMPTY_RESULT };
    await pullStoredUpdatedAtIdPages({
      entity: 'inventoryLots',
      pageSize: INVENTORY_LOT_REFRESH_LIMIT,
      loadPage: (cursor) => inventoryLotPostgresAdapter.list({
        updatedAfter: cursor?.updatedAt,
        cursorId: cursor?.id,
        limit: INVENTORY_LOT_REFRESH_LIMIT,
      }),
      mergePage: async (remoteLots) => {
        const result = await mergeRemoteInventoryLotsIntoDexie(remoteLots);
        aggregate.fetched += result.fetched;
        aggregate.inserted += result.inserted;
        aggregate.updated += result.updated;
        aggregate.skipped += result.skipped;
      },
      getUpdatedAt: (lot) => lot.updated_at,
      getId: (lot) => lot.id,
    });

    return aggregate;
  } finally {
    isRefreshingInventoryLotsFromPostgres = false;
  }
};

const getLatestLocalInventoryLotConsumptionCreatedAt = async () => {
  const consumptions = await db.inventoryLotConsumptions.toArray();
  return consumptions.reduce<string | undefined>(
    (latest, consumption) => getLaterUpdatedAt(latest, consumption.created_at),
    undefined,
  );
};

const getLatestRemoteInventoryLotConsumptionCreatedAt = (remoteConsumptions: RemoteInventoryLotConsumptionDto[]) => (
  remoteConsumptions.reduce<string | undefined>(
    (latest, consumption) => getLaterUpdatedAt(latest, consumption.created_at),
    undefined,
  )
);

export const refreshInventoryLotConsumptionsFromPostgres = async (): Promise<InventoryLotReadSyncResult> => {
  if (isRefreshingInventoryLotConsumptionsFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_RESULT };
  }

  isRefreshingInventoryLotConsumptionsFromPostgres = true;
  try {
    const aggregate = { ...EMPTY_RESULT };
    let createdAfter = await getLatestLocalInventoryLotConsumptionCreatedAt();

    while (true) {
      const remoteConsumptions = await inventoryLotConsumptionPostgresAdapter.list({
        createdAfter,
        limit: INVENTORY_LOT_CONSUMPTION_REFRESH_LIMIT,
      });
      const result = await mergeRemoteInventoryLotConsumptionsIntoDexie(remoteConsumptions);
      aggregate.fetched += result.fetched;
      aggregate.inserted += result.inserted;

      if (remoteConsumptions.length < INVENTORY_LOT_CONSUMPTION_REFRESH_LIMIT) break;

      const nextCreatedAfter = getLatestRemoteInventoryLotConsumptionCreatedAt(remoteConsumptions);
      if (!nextCreatedAfter || nextCreatedAfter === createdAfter) break;
      createdAfter = nextCreatedAfter;
    }

    return aggregate;
  } finally {
    isRefreshingInventoryLotConsumptionsFromPostgres = false;
  }
};
