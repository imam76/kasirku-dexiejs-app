import { db } from '@/lib/db';
import { isTauriRuntime, warehousePostgresAdapter, type RemoteWarehouseDto } from '@/services/postgresAdapter';
import type { Warehouse } from '@/types';

export interface WarehouseReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

const EMPTY_WAREHOUSE_READ_SYNC_RESULT: WarehouseReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
};

let isRefreshingWarehousesFromPostgres = false;

const mapRemoteWarehouseToLocal = (
  remoteWarehouse: RemoteWarehouseDto,
  syncedAt: string,
): Warehouse => ({
  id: remoteWarehouse.id,
  name: remoteWarehouse.name,
  code: remoteWarehouse.code ?? undefined,
  address: remoteWarehouse.address ?? undefined,
  phone: remoteWarehouse.phone ?? undefined,
  notes: remoteWarehouse.notes ?? undefined,
  is_active: remoteWarehouse.deleted_at ? false : remoteWarehouse.is_active,
  created_at: remoteWarehouse.created_at,
  updated_at: remoteWarehouse.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteWarehouse.updated_at,
});

const hasLocalUnsyncedChanges = (warehouse: Warehouse) => (
  warehouse.sync_status === 'pending' || warehouse.sync_status === 'failed'
);

const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const shouldApplyRemoteWarehouse = (
  localWarehouse: Warehouse | undefined,
  remoteWarehouse: RemoteWarehouseDto,
) => {
  if (!localWarehouse) return true;
  if (hasLocalUnsyncedChanges(localWarehouse)) return false;

  const localRemoteUpdatedAt = localWarehouse.remote_updated_at ?? localWarehouse.updated_at;
  const remoteTimestamp = toTimestamp(remoteWarehouse.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteWarehouse.updated_at >= localRemoteUpdatedAt;
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

export const mergeRemoteWarehousesIntoDexie = async (
  remoteWarehouses: RemoteWarehouseDto[],
  syncedAt = new Date().toISOString(),
): Promise<WarehouseReadSyncResult> => {
  const result: WarehouseReadSyncResult = {
    ...EMPTY_WAREHOUSE_READ_SYNC_RESULT,
    fetched: remoteWarehouses.length,
  };
  if (remoteWarehouses.length === 0) return result;

  const warehousesToPut: Warehouse[] = [];

  await db.transaction('rw', db.warehouses, async () => {
    for (const remoteWarehouse of remoteWarehouses) {
      const localWarehouse = await db.warehouses.get(remoteWarehouse.id);
      if (!shouldApplyRemoteWarehouse(localWarehouse, remoteWarehouse)) {
        result.skipped += 1;
        continue;
      }

      warehousesToPut.push(mapRemoteWarehouseToLocal(remoteWarehouse, syncedAt));
      if (localWarehouse) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }

    if (warehousesToPut.length > 0) {
      await db.warehouses.bulkPut(warehousesToPut);
    }
  });

  return result;
};

export const refreshWarehousesFromPostgres = async (): Promise<WarehouseReadSyncResult> => {
  if (isRefreshingWarehousesFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_WAREHOUSE_READ_SYNC_RESULT };
  }

  isRefreshingWarehousesFromPostgres = true;
  try {
    const remoteWarehouses = await warehousePostgresAdapter.list();
    return mergeRemoteWarehousesIntoDexie(remoteWarehouses);
  } finally {
    isRefreshingWarehousesFromPostgres = false;
  }
};
