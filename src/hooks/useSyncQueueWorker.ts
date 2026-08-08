import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { queryClient } from '@/providers/queryClient';
import { isTauriRuntime } from '@/services/postgresAdapter';
import {
  CASHIER_QUERY_KEYS,
  COOPERATIVE_QUERY_KEYS,
  FINANCE_QUERY_KEYS,
  PAYROLL_QUERY_KEYS,
  resolveRealtimeRefreshPlan,
  SETUP_QUERY_KEYS,
} from '@/services/realtimeSyncTableMap';
import { runDatabaseRefreshNow, runDatabaseSyncNow } from '@/services/syncOrchestratorService';
import { checkPostgresConnection } from '@/store/postgresConnectionStore';
import { shouldRunDatabaseSyncForHealth } from '@/utils/postgresConnection';

const REALTIME_SYNC_DEBOUNCE_MS = 750;
export const POSTGRES_CONNECTION_RETRY_INTERVAL_MS = 10_000;

const DATABASE_SYNC_QUERY_KEYS = Array.from(new Set([
  ...CASHIER_QUERY_KEYS,
  ...SETUP_QUERY_KEYS,
  ...COOPERATIVE_QUERY_KEYS,
  ...FINANCE_QUERY_KEYS,
  ...PAYROLL_QUERY_KEYS,
]));

type PostgresRealtimeChangeEvent = {
  table?: string;
  operation?: string;
  id?: string;
  updated_at?: string;
  emitted_at?: string;
};

const invalidateQueryKeys = (queryKeys: string[]) => {
  queryKeys.forEach((queryKey) => {
    queryClient.invalidateQueries({ queryKey: [queryKey] });
  });
};

export const useSyncQueueWorker = () => {
  useEffect(() => {
    let isDisposed = false;
    let previousPostgresAvailability: boolean | undefined;
    let connectionCheckIntervalId: number | undefined;
    let realtimeSyncTimeoutId: number | undefined;
    let isRealtimeSyncRunning = false;
    let pendingRealtimeSync = false;
    let pendingRealtimeChanges: PostgresRealtimeChangeEvent[] = [];
    let unlistenPostgresRealtime: (() => void) | undefined;

    const syncWhenOnline = async () => {
      try {
        await runDatabaseSyncNow();
        invalidateQueryKeys(DATABASE_SYNC_QUERY_KEYS);
      } catch (error) {
        console.error('Failed to refresh PostgreSQL read data', error);
      }
    };

    const checkConnectionAndRecover = async () => {
      const health = await checkPostgresConnection();
      if (isDisposed) return;

      const shouldSync = shouldRunDatabaseSyncForHealth(
        previousPostgresAvailability,
        health.available,
      );
      previousPostgresAvailability = health.available;

      if (shouldSync) {
        await syncWhenOnline();
      }
    };

    const checkConnectionWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void checkConnectionAndRecover();
      }
    };

    const runRealtimeSync = async () => {
      if (isRealtimeSyncRunning) {
        pendingRealtimeSync = true;
        return;
      }

      isRealtimeSyncRunning = true;
      const changes = pendingRealtimeChanges;
      pendingRealtimeChanges = [];

      try {
        const changedTables = changes
          .map((change) => change.table)
          .filter((table): table is string => Boolean(table));

        const { refreshFns, queryKeys, unknownTables } = resolveRealtimeRefreshPlan(changedTables);

        if (unknownTables.length > 0) {
          console.warn(
            '[Realtime sync] Table(s) missing from REALTIME_TABLE_TO_ENTITY, falling back to full refresh for this batch:',
            unknownTables,
          );
          await runDatabaseRefreshNow();
          invalidateQueryKeys(DATABASE_SYNC_QUERY_KEYS);
        } else if (refreshFns.length > 0) {
          console.info('[Realtime sync] scoped refresh', { changedTables, refreshCount: refreshFns.length, queryKeys });
          await Promise.all(refreshFns.map((refreshFn) => refreshFn()));
          invalidateQueryKeys(queryKeys);
        }
      } catch (error) {
        pendingRealtimeChanges = [...changes, ...pendingRealtimeChanges];
        console.error('Failed to refresh PostgreSQL realtime data', error);
      } finally {
        isRealtimeSyncRunning = false;

        if (pendingRealtimeSync && !isDisposed) {
          pendingRealtimeSync = false;
          scheduleRealtimeSync();
        }
      }
    };

    const scheduleRealtimeSync = () => {
      if (realtimeSyncTimeoutId !== undefined) {
        window.clearTimeout(realtimeSyncTimeoutId);
      }

      realtimeSyncTimeoutId = window.setTimeout(() => {
        realtimeSyncTimeoutId = undefined;
        void runRealtimeSync();
      }, REALTIME_SYNC_DEBOUNCE_MS);
    };

    if (isTauriRuntime()) {
      void checkConnectionAndRecover();
      connectionCheckIntervalId = window.setInterval(() => {
        void checkConnectionAndRecover();
      }, POSTGRES_CONNECTION_RETRY_INTERVAL_MS);
      window.addEventListener('online', checkConnectionAndRecover);
      document.addEventListener('visibilitychange', checkConnectionWhenVisible);

      void listen<PostgresRealtimeChangeEvent>('postgres-data-change', (event) => {
        pendingRealtimeChanges.push(event.payload);
        scheduleRealtimeSync();
      })
        .then((unlisten) => {
          if (isDisposed) {
            unlisten();
            return;
          }

          unlistenPostgresRealtime = unlisten;
        })
        .catch((error) => {
          console.error('Failed to listen for PostgreSQL realtime changes', error);
        });
    } else {
      void syncWhenOnline();
    }

    return () => {
      isDisposed = true;
      if (connectionCheckIntervalId !== undefined) {
        window.clearInterval(connectionCheckIntervalId);
      }
      if (realtimeSyncTimeoutId !== undefined) {
        window.clearTimeout(realtimeSyncTimeoutId);
      }
      unlistenPostgresRealtime?.();
      window.removeEventListener('online', checkConnectionAndRecover);
      document.removeEventListener('visibilitychange', checkConnectionWhenVisible);
    };
  }, []);
};
