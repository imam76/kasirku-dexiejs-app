import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useSyncActivityStore } from '@/store/syncActivityStore';
import type { SyncQueueItem, SyncQueueStatus } from '@/types';

type SyncQueueCounts = Record<SyncQueueStatus, number>;

const emptyCounts: SyncQueueCounts = {
  pending: 0,
  processing: 0,
  synced: 0,
  failed: 0,
};

const getInitialOnlineState = () => (
  typeof navigator === 'undefined' ? true : navigator.onLine
);

export const useSyncStatus = () => {
  const phase = useSyncActivityStore((state) => state.phase);
  const activityErrorMessage = useSyncActivityStore((state) => state.errorMessage);
  const [isOnline, setIsOnline] = useState(getInitialOnlineState);

  useEffect(() => {
    const updateOnlineState = () => setIsOnline(getInitialOnlineState());

    window.addEventListener('online', updateOnlineState);
    window.addEventListener('offline', updateOnlineState);

    return () => {
      window.removeEventListener('online', updateOnlineState);
      window.removeEventListener('offline', updateOnlineState);
    };
  }, []);

  const queueSnapshot = useLiveQuery(async () => {
    const queueItems = await db.syncQueue.toArray();
    const counts = queueItems.reduce<SyncQueueCounts>((acc, item) => {
      acc[item.status] += 1;
      return acc;
    }, { ...emptyCounts });
    const lastSyncedItem = queueItems
      .filter((item) => item.status === 'synced')
      .sort((firstItem, secondItem) => secondItem.updated_at.localeCompare(firstItem.updated_at))[0];
    const failedItems = queueItems
      .filter((item) => item.status === 'failed')
      .sort((firstItem, secondItem) => secondItem.updated_at.localeCompare(firstItem.updated_at))
      .slice(0, 3);

    return {
      counts,
      lastSyncedAt: lastSyncedItem?.updated_at,
      failedItems,
    };
  }, [], {
    counts: emptyCounts,
    lastSyncedAt: undefined,
    failedItems: [] as SyncQueueItem[],
  });

  return useMemo(() => {
    const counts = queueSnapshot?.counts ?? emptyCounts;
    const isUploading = counts.processing > 0 || phase === 'uploading';
    const isRefreshing = phase === 'refreshing';
    const hasFailed = counts.failed > 0 || phase === 'error';
    const hasPending = counts.pending > 0;
    const isBusy = isUploading || isRefreshing;

    return {
      counts,
      failedItems: queueSnapshot?.failedItems ?? [],
      lastSyncedAt: queueSnapshot?.lastSyncedAt,
      phase,
      activityErrorMessage,
      isOnline,
      isBusy,
      hasFailed,
      hasPending,
      isUploading,
      isRefreshing,
    };
  }, [activityErrorMessage, isOnline, phase, queueSnapshot]);
};
