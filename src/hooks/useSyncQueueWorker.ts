import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { queryClient } from '@/providers/queryClient';
import { isTauriRuntime } from '@/services/postgresAdapter';
import { runDatabaseRefreshNow, runDatabaseSyncNow } from '@/services/syncOrchestratorService';

const REALTIME_SYNC_DEBOUNCE_MS = 750;

type PostgresRealtimeChangeEvent = {
  table?: string;
  operation?: string;
  id?: string;
  updated_at?: string;
  emitted_at?: string;
};

const invalidateServerAuthoritativeQueries = (change: PostgresRealtimeChangeEvent) => {
  if (change.table === 'cashier_sessions') {
    queryClient.invalidateQueries({ queryKey: ['cashierSession'] });
    queryClient.invalidateQueries({ queryKey: ['cashierSessions'] });
    queryClient.invalidateQueries({ queryKey: ['transactions-history'] });
    queryClient.invalidateQueries({ queryKey: ['posSalesReport'] });
    queryClient.invalidateQueries({ queryKey: ['transactionDetailReport'] });
    queryClient.invalidateQueries({ queryKey: ['depositReport'] });
  }

  if (change.table === 'cooperative_payment_approval_requests') {
    queryClient.invalidateQueries({ queryKey: ['cooperativePaymentApprovalRequests'] });
  }
};

export const useSyncQueueWorker = () => {
  useEffect(() => {
    let isDisposed = false;
    let realtimeSyncTimeoutId: number | undefined;
    let isRealtimeSyncRunning = false;
    let pendingRealtimeSync = false;
    let unlistenPostgresRealtime: (() => void) | undefined;

    const syncWhenOnline = async () => {
      try {
        await runDatabaseSyncNow();
      } catch (error) {
        console.error('Failed to refresh PostgreSQL read data', error);
      }
    };

    const runRealtimeSync = async () => {
      if (isRealtimeSyncRunning) {
        pendingRealtimeSync = true;
        return;
      }

      isRealtimeSyncRunning = true;
      try {
        await runDatabaseRefreshNow();
      } catch (error) {
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

    void syncWhenOnline();

    window.addEventListener('online', syncWhenOnline);

    if (isTauriRuntime()) {
      void listen<PostgresRealtimeChangeEvent>('postgres-data-change', (event) => {
        invalidateServerAuthoritativeQueries(event.payload);
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
    }

    return () => {
      isDisposed = true;
      if (realtimeSyncTimeoutId !== undefined) {
        window.clearTimeout(realtimeSyncTimeoutId);
      }
      unlistenPostgresRealtime?.();
      window.removeEventListener('online', syncWhenOnline);
    };
  }, []);
};
