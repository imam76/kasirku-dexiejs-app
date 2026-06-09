import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import type { SyncQueueItem, SyncQueueStatus } from '@/types';

type SyncQueueCounts = Record<SyncQueueStatus, number>;

export interface SyncQueueEntitySummary {
  entity: string;
  pending: number;
  processing: number;
  failed: number;
  total: number;
  latestUpdatedAt?: string;
}

const emptyCounts: SyncQueueCounts = {
  pending: 0,
  processing: 0,
  synced: 0,
  failed: 0,
};

const sortByLatestUpdate = (items: SyncQueueItem[]) => (
  items.slice().sort((firstItem, secondItem) => secondItem.updated_at.localeCompare(firstItem.updated_at))
);

export const useSyncQueueDetails = () => {
  const snapshot = useLiveQuery(async () => {
    const queueItems = await db.syncQueue.toArray();
    const counts = queueItems.reduce<SyncQueueCounts>((acc, item) => {
      acc[item.status] += 1;
      return acc;
    }, { ...emptyCounts });

    const activeItems = sortByLatestUpdate(
      queueItems.filter((item) => item.status === 'pending' || item.status === 'processing' || item.status === 'failed'),
    );
    const recentSyncedItems = sortByLatestUpdate(
      queueItems.filter((item) => item.status === 'synced'),
    ).slice(0, 10);

    const entitySummaryByName = activeItems.reduce<Record<string, SyncQueueEntitySummary>>((acc, item) => {
      const currentSummary = acc[item.entity] ?? {
        entity: item.entity,
        pending: 0,
        processing: 0,
        failed: 0,
        total: 0,
        latestUpdatedAt: item.updated_at,
      };

      if (item.status === 'pending' || item.status === 'processing' || item.status === 'failed') {
        currentSummary[item.status] += 1;
      }

      currentSummary.total += 1;
      currentSummary.latestUpdatedAt = !currentSummary.latestUpdatedAt || item.updated_at > currentSummary.latestUpdatedAt
        ? item.updated_at
        : currentSummary.latestUpdatedAt;
      acc[item.entity] = currentSummary;

      return acc;
    }, {});

    const lastSyncedItem = recentSyncedItems[0];

    return {
      activeItems,
      counts,
      entitySummaries: Object.values(entitySummaryByName)
        .sort((firstSummary, secondSummary) => secondSummary.total - firstSummary.total),
      lastSyncedAt: lastSyncedItem?.updated_at,
      recentSyncedItems,
    };
  }, [], {
    activeItems: [] as SyncQueueItem[],
    counts: emptyCounts,
    entitySummaries: [] as SyncQueueEntitySummary[],
    lastSyncedAt: undefined,
    recentSyncedItems: [] as SyncQueueItem[],
  });

  return useMemo(() => snapshot, [snapshot]);
};
