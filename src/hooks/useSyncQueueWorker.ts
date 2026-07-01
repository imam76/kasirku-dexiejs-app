import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { queryClient } from '@/providers/queryClient';
import { isTauriRuntime } from '@/services/postgresAdapter';
import { runDatabaseRefreshNow, runDatabaseSyncNow } from '@/services/syncOrchestratorService';

const REALTIME_SYNC_DEBOUNCE_MS = 750;

const CASHIER_QUERY_KEYS = [
  'cashierSession',
  'cashierSessions',
  'transactions-history',
  'posSalesReport',
  'transactionDetailReport',
  'depositReport',
];

const COOPERATIVE_REALTIME_TABLES = new Set([
  'cooperative_areas',
  'cooperative_loan_collection_events',
  'cooperative_loan_installments',
  'cooperative_loan_payments',
  'cooperative_loans',
  'cooperative_member_saving_balances',
  'cooperative_members',
  'cooperative_payment_approval_requests',
  'cooperative_payment_policy',
  'cooperative_posting_accounts',
  'cooperative_saving_transactions',
]);

const EMPLOYEE_REALTIME_TABLES = new Set([
  'employee_areas',
  'employee_collection_schedules',
  'employees',
]);

const COOPERATIVE_QUERY_KEYS = [
  'cooperativeAreas',
  'cooperativeMembers',
  'cooperativeSavings',
  'cooperativeLoans',
  'cooperativeLoanInstallments',
  'cooperativeLoanPayments',
  'cooperativePaymentApprovalRequests',
  'cooperativeFieldCashSessions',
  'cooperativeFieldCashReport',
  'cooperativeReports',
  'cooperativeDailyDropReport',
  'cooperativeWeeklyEmployeeDropReport',
  'cooperativeDailyStortingReport',
  'cooperativeDailyTargetReport',
  'cooperativeDailyFieldCashReport',
  'cooperativeCashReport',
  'cooperativeLedgerReport',
  'cooperativeIptwReport',
  'cooperativeInstallmentBookReport',
  'cooperativeMemberRegisterReport',
  'financeBalance',
  'financeTransactions',
  'journalEntries',
  'trialBalance',
  'incomeStatement',
  'balanceSheet',
];

const FINANCE_REALTIME_TABLES = new Set([
  'accounting_profile_setting',
  'chart_of_accounts',
  'enabled_modules',
  'finance_account_mappings',
  'finance_transactions',
  'general_ledger_setting',
  'journal_entries',
  'journal_entry_lines',
]);

const FINANCE_QUERY_KEYS = [
  'financeBalance',
  'financeTransactions',
  'journalEntries',
  'trialBalance',
  'incomeStatement',
  'balanceSheet',
  'cooperativeFieldCashReport',
  'cooperativeReports',
  'cooperativeDailyFieldCashReport',
  'cooperativeCashReport',
  'cooperativeLedgerReport',
];

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

const invalidateServerAuthoritativeQueries = (change: PostgresRealtimeChangeEvent) => {
  if (change.table === 'cashier_sessions') {
    invalidateQueryKeys(CASHIER_QUERY_KEYS);
  }

  if (change.table === 'cooperative_payment_approval_requests') {
    queryClient.invalidateQueries({ queryKey: ['cooperativePaymentApprovalRequests'] });
  }

  if (change.table && COOPERATIVE_REALTIME_TABLES.has(change.table)) {
    invalidateQueryKeys(COOPERATIVE_QUERY_KEYS);
  }

  if (change.table && EMPLOYEE_REALTIME_TABLES.has(change.table)) {
    invalidateQueryKeys(COOPERATIVE_QUERY_KEYS);
  }

  if (change.table && FINANCE_REALTIME_TABLES.has(change.table)) {
    invalidateQueryKeys(FINANCE_QUERY_KEYS);
  }
};

export const useSyncQueueWorker = () => {
  useEffect(() => {
    let isDisposed = false;
    let realtimeSyncTimeoutId: number | undefined;
    let isRealtimeSyncRunning = false;
    let pendingRealtimeSync = false;
    let pendingRealtimeChanges: PostgresRealtimeChangeEvent[] = [];
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
      const changes = pendingRealtimeChanges;
      pendingRealtimeChanges = [];

      try {
        await runDatabaseRefreshNow();
        changes.forEach(invalidateServerAuthoritativeQueries);
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

    void syncWhenOnline();

    window.addEventListener('online', syncWhenOnline);

    if (isTauriRuntime()) {
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
