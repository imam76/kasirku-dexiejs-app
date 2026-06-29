import { db } from '@/lib/db';
import {
  cooperativeAreaPostgresAdapter,
  isTauriRuntime,
  postgresAdapter,
  type RemoteCooperativeAreaDto,
} from '@/services/postgresAdapter';
import type { CooperativeArea } from '@/types';

export interface CooperativeAreaReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

export interface CooperativeAreaPushSyncResult {
  attempted: number;
  pushed: number;
  failed: number;
  skipped: number;
}

const EMPTY_READ_SYNC_RESULT: CooperativeAreaReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
};

const EMPTY_PUSH_SYNC_RESULT: CooperativeAreaPushSyncResult = {
  attempted: 0,
  pushed: 0,
  failed: 0,
  skipped: 0,
};

let isRefreshingCooperativeAreasFromPostgres = false;
let isPushingCooperativeAreasToPostgres = false;

const optionalString = (value: string | null | undefined) => value ?? undefined;

const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const hasLocalUnsyncedChanges = (area: CooperativeArea) => (
  area.sync_status === 'pending' || area.sync_status === 'failed'
);

const shouldApplyRemoteArea = (
  localArea: CooperativeArea | undefined,
  remoteArea: RemoteCooperativeAreaDto,
) => {
  if (!localArea) return true;
  if (hasLocalUnsyncedChanges(localArea)) return false;

  const localRemoteUpdatedAt = localArea.remote_updated_at ?? localArea.updated_at;
  const remoteTimestamp = toTimestamp(remoteArea.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteArea.updated_at >= localRemoteUpdatedAt;
};

const canUsePostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

const mapRemoteAreaToLocal = (
  remoteArea: RemoteCooperativeAreaDto,
  syncedAt: string,
): CooperativeArea => ({
  id: remoteArea.id,
  name: remoteArea.name,
  code: optionalString(remoteArea.code),
  description: optionalString(remoteArea.description),
  is_active: remoteArea.deleted_at ? false : remoteArea.is_active,
  created_at: remoteArea.created_at,
  updated_at: remoteArea.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteArea.updated_at,
});

const mapLocalAreaToRemote = (area: CooperativeArea): RemoteCooperativeAreaDto => ({
  id: area.id,
  name: area.name,
  code: area.code ?? null,
  description: area.description ?? null,
  is_active: area.is_active,
  created_at: area.created_at,
  updated_at: area.updated_at,
  deleted_at: null,
});

export const mergeRemoteCooperativeAreasIntoDexie = async (
  remoteAreas: RemoteCooperativeAreaDto[],
  syncedAt = new Date().toISOString(),
): Promise<CooperativeAreaReadSyncResult> => {
  const result = { ...EMPTY_READ_SYNC_RESULT, fetched: remoteAreas.length };
  if (remoteAreas.length === 0) return result;

  await db.transaction('rw', db.cooperativeAreas, async () => {
    const areasToPut: CooperativeArea[] = [];

    for (const remoteArea of remoteAreas) {
      const localArea = await db.cooperativeAreas.get(remoteArea.id);
      if (!shouldApplyRemoteArea(localArea, remoteArea)) {
        result.skipped += 1;
        continue;
      }

      areasToPut.push(mapRemoteAreaToLocal(remoteArea, syncedAt));
      if (localArea) result.updated += 1;
      else result.inserted += 1;
    }

    if (areasToPut.length > 0) {
      await db.cooperativeAreas.bulkPut(areasToPut);
    }
  });

  return result;
};

export const refreshCooperativeAreasFromPostgres = async (): Promise<CooperativeAreaReadSyncResult> => {
  if (isRefreshingCooperativeAreasFromPostgres || !canUsePostgres()) {
    return { ...EMPTY_READ_SYNC_RESULT };
  }

  isRefreshingCooperativeAreasFromPostgres = true;
  try {
    const remoteAreas = await cooperativeAreaPostgresAdapter.list();
    return mergeRemoteCooperativeAreasIntoDexie(remoteAreas);
  } finally {
    isRefreshingCooperativeAreasFromPostgres = false;
  }
};

export const pushLocalCooperativeAreasToPostgres = async (): Promise<CooperativeAreaPushSyncResult> => {
  if (isPushingCooperativeAreasToPostgres || !canUsePostgres()) {
    return { ...EMPTY_PUSH_SYNC_RESULT };
  }

  const postgresHealth = await postgresAdapter.healthCheck();
  if (!postgresHealth.available) {
    return { ...EMPTY_PUSH_SYNC_RESULT };
  }

  isPushingCooperativeAreasToPostgres = true;
  try {
    const result = { ...EMPTY_PUSH_SYNC_RESULT };
    const localAreas = await db.cooperativeAreas.toArray();
    const areasToPush = localAreas.filter((area) => (
      area.sync_status === 'pending' ||
      area.sync_status === 'failed' ||
      !area.remote_updated_at
    ));

    result.skipped = localAreas.length - areasToPush.length;

    for (const area of areasToPush) {
      result.attempted += 1;
      try {
        const remoteArea = await cooperativeAreaPostgresAdapter.upsert(mapLocalAreaToRemote(area));
        if (remoteArea) {
          await mergeRemoteCooperativeAreasIntoDexie([remoteArea]);
          result.pushed += 1;
        }
      } catch (error) {
        result.failed += 1;
        if (area.sync_status === 'pending' || area.sync_status === 'failed') {
          await db.cooperativeAreas.update(area.id, {
            sync_status: 'failed',
            sync_error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return result;
  } finally {
    isPushingCooperativeAreasToPostgres = false;
  }
};
