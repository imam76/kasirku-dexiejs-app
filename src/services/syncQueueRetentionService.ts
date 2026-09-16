import Dexie from 'dexie';
import { db } from '@/lib/db';

/**
 * Synced rows keep their full payload forever otherwise. Nothing reads them again
 * after upload, but they still charge storage, first-open migrations and backups.
 * Retention is what keeps the cashier database from growing without bound.
 */
export const SYNC_QUEUE_SYNCED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const PRUNE_BATCH_SIZE = 500;

export interface SyncQueuePruneResult {
  deleted: number;
  cutoff: string;
}

/**
 * Delete synced rows older than the retention window, in bounded batches so a
 * large backlog never becomes one long write transaction.
 *
 * The newest synced row is always kept: the sync indicator reads its timestamp
 * for "last synced", and a device idle longer than the window would otherwise
 * lose that time entirely. Counts stay correct because the read-model middleware
 * applies the delete delta to `syncQueueSummary` in the same transaction.
 */
export const pruneSyncedSyncQueueItems = async (
  now: number = Date.now(),
): Promise<SyncQueuePruneResult> => {
  const cutoff = new Date(now - SYNC_QUEUE_SYNCED_RETENTION_MS).toISOString();
  const newestSynced = await db.syncQueue
    .where('[status+updated_at]')
    .between(['synced', Dexie.minKey], ['synced', Dexie.maxKey])
    .reverse()
    .limit(1)
    .primaryKeys() as string[];
  const keep = new Set(newestSynced);

  let deleted = 0;
  for (;;) {
    const keys = await db.syncQueue
      .where('[status+updated_at]')
      .between(['synced', Dexie.minKey], ['synced', cutoff], true, false)
      .limit(PRUNE_BATCH_SIZE)
      .primaryKeys() as string[];
    const removable = keys.filter((key) => !keep.has(key));

    if (removable.length > 0) {
      await db.syncQueue.bulkDelete(removable);
      deleted += removable.length;
    }
    // Fewer keys than a full batch means the window is drained; a full batch of
    // nothing but kept rows cannot repeat because at most one row is ever kept.
    if (removable.length === 0 || keys.length < PRUNE_BATCH_SIZE) break;
  }

  return { deleted, cutoff };
};
