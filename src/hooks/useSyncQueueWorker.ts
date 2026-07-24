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

const SETUP_REALTIME_TABLES = new Set([
  'app_setup_config',
  'accounting_initial_setup_setting',
]);

const SETUP_QUERY_KEYS = [
  'setupConfig',
  'moduleAccess',
  'enabledModules',
  'accountingInitialSetup',
];

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
  'cooperativeFieldCashCashDetail',
  'cooperativeReports',
  'cooperativeDailyDropReport',
  'cooperativeWeeklyEmployeeDropReport',
  'cooperativeDailyStortingReport',
  'cooperativeDailyTargetReport',
  'cooperativeDailyFieldCashReport',
  'cooperativeCashReport',
  'ledgerReport',
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
  'accounting_initial_setup_setting',
  'accounting_profile_setting',
  'chart_of_accounts',
  'enabled_modules',
  'finance_account_mappings',
  'finance_transactions',
  'cash_bank_reconciliations',
  'accounting_periods',
  'accounting_fiscal_years',
  'closing_runs',
  'fiscal_year_closing_runs',
  'general_ledger_setting',
  'journal_entries',
  'journal_entry_lines',
  'opening_balance_batches',
  'opening_balance_lines',
  'fixed_assets',
  'fixed_asset_depreciation_runs',
  'fixed_asset_depreciation_run_lines',
]);

const FINANCE_QUERY_KEYS = [
  'financeBalance',
  'financeTransactions',
  'cashBankReconciliationAccounts',
  'cashBankReconciliationCandidates',
  'cashBankReconciliations',
  'accountingPeriods',
  'accountingFiscalYears',
  'closingRuns',
  'fiscalYearClosingRuns',
  'closingPreview',
  'periodClosingPreview',
  'fiscalYearClosingPreview',
  'journalEntries',
  'openingBalances',
  'trialBalance',
  'incomeStatement',
  'balanceSheet',
  'cooperativeFieldCashReport',
  'cooperativeFieldCashCashDetail',
  'cooperativeReports',
  'cooperativeDailyFieldCashReport',
  'cooperativeCashReport',
  'ledgerReport',
  'fixedAssets',
  'fixedAssetDepreciationRuns',
];

const PAYROLL_REALTIME_TABLES = new Set([
  'employee_cash_advance_repayments',
  'employee_cash_advances',
  'payroll_run_items',
  'payroll_runs',
]);

const PAYROLL_QUERY_KEYS = [
  'employeeCashAdvances',
  'financeBalance',
  'financeTransactions',
  'payrollReport',
  'payrollRuns',
  'profitBalance',
  'profitLogs',
  'journalEntries',
  'trialBalance',
  'incomeStatement',
  'balanceSheet',
];

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

  if (change.table && SETUP_REALTIME_TABLES.has(change.table)) {
    invalidateQueryKeys(SETUP_QUERY_KEYS);
  }

  if (change.table && FINANCE_REALTIME_TABLES.has(change.table)) {
    invalidateQueryKeys(FINANCE_QUERY_KEYS);
  }

  if (change.table && PAYROLL_REALTIME_TABLES.has(change.table)) {
    invalidateQueryKeys(PAYROLL_QUERY_KEYS);
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
        invalidateQueryKeys(DATABASE_SYNC_QUERY_KEYS);
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
