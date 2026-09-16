import Dexie from 'dexie';
import { db } from '@/lib/db';
import type { SyncQueueItem, SyncQueueStatus } from '@/types';

export type SyncQueueCounts = Record<SyncQueueStatus, number>;

export const EMPTY_SYNC_COUNTS: SyncQueueCounts = {
  pending: 0,
  processing: 0,
  synced: 0,
  failed: 0,
};

export const EMPTY_SYNC_SNAPSHOT = {
  counts: EMPTY_SYNC_COUNTS,
  lastSyncedAt: undefined as string | undefined,
  failedItems: [] as SyncQueueItem[],
};

export const readSyncStatusSnapshot = () => db.transaction('r', db.syncQueue, db.syncQueueSummary, async () => {
  const [summary, latestSyncedKey, failedItems] = await Promise.all([
    db.syncQueueSummary.get('current'),
    // Read the timestamp from the index without deserializing a synced payload.
    db.syncQueue.where('[status+updated_at]')
      .between(['synced', Dexie.minKey], ['synced', Dexie.maxKey])
      .reverse().limit(1).keys(),
    db.syncQueue.where('[status+updated_at]')
      .between(['failed', Dexie.minKey], ['failed', Dexie.maxKey])
      .reverse().limit(3).toArray(),
  ]);

  const latestKey = latestSyncedKey[0];
  return {
    counts: summary?.counts ?? { ...EMPTY_SYNC_COUNTS },
    lastSyncedAt: Array.isArray(latestKey) && typeof latestKey[1] === 'string' ? latestKey[1] : undefined,
    failedItems,
  };
});
