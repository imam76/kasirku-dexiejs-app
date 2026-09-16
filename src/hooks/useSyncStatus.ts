import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSyncActivityStore } from '@/store/syncActivityStore';
import { EMPTY_SYNC_COUNTS, EMPTY_SYNC_SNAPSHOT, readSyncStatusSnapshot } from '@/services/syncStatusReadService';

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

  const queueSnapshot = useLiveQuery(readSyncStatusSnapshot, [], EMPTY_SYNC_SNAPSHOT);

  return useMemo(() => {
    const counts = queueSnapshot?.counts ?? EMPTY_SYNC_COUNTS;
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
