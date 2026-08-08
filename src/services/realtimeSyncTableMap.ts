import {
  refreshActivityLogsFromPostgres,
  refreshAuthUsersFromPostgres,
  refreshRolesFromPostgres,
} from '@/auth/authReadService';
import {
  refreshAccountingInitialSetupSettingFromPostgres,
  refreshAccountingProfileSettingFromPostgres,
  refreshEnabledModulesFromPostgres,
  refreshFinanceAccountMappingsFromPostgres,
  refreshGeneralLedgerSettingFromPostgres,
} from '@/services/accountingSettingReadService';
import { refreshAccountingPeriodsFromPostgres } from '@/services/accountingPeriodReadService';
import { refreshCashBankReconciliationsFromPostgres } from '@/services/cashBankReconciliationReadService';
import { refreshCashierSessionsFromPostgres } from '@/services/cashierSessionReadService';
import { refreshChartOfAccountsFromPostgres } from '@/services/chartOfAccountReadService';
import { refreshClosingRunsFromPostgres } from '@/services/closingRunReadService';
import { getCompanyProfileSetting } from '@/services/companyProfileSettingService';
import { refreshContactsFromPostgres } from '@/services/contactReadService';
import { refreshCooperativeAreasFromPostgres } from '@/services/cooperativeAreaReadService';
import { refreshCooperativeCollectionEventsFromPostgres } from '@/services/cooperativeCollectionEventService';
import {
  refreshCooperativeLoanInstallmentsFromPostgres,
  refreshCooperativeLoanPaymentsFromPostgres,
  refreshCooperativeLoansFromPostgres,
  refreshCooperativeMemberSavingBalancesFromPostgres,
  refreshCooperativeMembersFromPostgres,
  refreshCooperativeSavingTransactionsFromPostgres,
} from '@/services/cooperativeReadService';
import { refreshCurrenciesFromPostgres, refreshCurrencyRatesFromPostgres } from '@/services/currencyReadService';
import { refreshDepartmentsFromPostgres } from '@/services/departmentReadService';
import { refreshEmployeesFromPostgres } from '@/services/employeeReadService';
import { refreshFinanceTransactionsFromPostgres } from '@/services/financeTransactionReadService';
import { refreshFixedAssetRunsFromPostgres, refreshFixedAssetsFromPostgres } from '@/services/fixedAssetReadService';
import {
  refreshAccountingFiscalYearsFromPostgres,
  refreshFiscalYearClosingRunsFromPostgres,
} from '@/services/fiscalYearReadService';
import { refreshJournalEntriesFromPostgres } from '@/services/journalEntryReadService';
import { refreshOpeningBalancesFromPostgres } from '@/services/openingBalanceReadService';
import { refreshPaymentMethodsFromPostgres } from '@/services/paymentMethodReadService';
import { refreshEmployeeCashAdvancesFromPostgres, refreshPayrollRunsFromPostgres } from '@/services/payrollReadService';
import { refreshProductsFromPostgres } from '@/services/productReadService';
import { refreshProductionOrdersFromPostgres } from '@/services/productionReadService';
import { refreshProjectsFromPostgres } from '@/services/projectReadService';
import { refreshPurchaseDocumentsFromPostgres } from '@/services/purchaseDocumentReadService';
import { refreshSalesDocumentsFromPostgres } from '@/services/salesDocumentReadService';
import { reconcileSetupConfigWithRemote } from '@/services/setupKeyService';
import { refreshStockOpnamesFromPostgres } from '@/services/stockOpnameReadService';
import { refreshTaxesFromPostgres } from '@/services/taxReadService';
import { refreshWarehousesFromPostgres } from '@/services/warehouseReadService';

export type RealtimeRefreshFn = () => Promise<unknown>;

export interface RealtimeEntityMapping {
  /** refreshXFromPostgres()-style functions to call when this table changes. Empty when no pull path exists yet. */
  refreshFns: RealtimeRefreshFn[];
  /** React Query keys to invalidate when this table changes. */
  queryKeys: string[];
}

export const CASHIER_QUERY_KEYS = [
  'cashierSession',
  'cashierSessions',
  'transactions-history',
  'posSalesReport',
  'transactionDetailReport',
  'depositReport',
];

export const COOPERATIVE_QUERY_KEYS = [
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

export const SETUP_QUERY_KEYS = [
  'setupConfig',
  'moduleAccess',
  'enabledModules',
  'accountingInitialSetup',
];

export const FINANCE_QUERY_KEYS = [
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

export const PAYROLL_QUERY_KEYS = [
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

const SALES_DOCUMENT_QUERY_KEYS = [
  'salesDocuments',
  'accountsReceivable',
  'posSalesReport',
  'transactionDetailReport',
];

const PURCHASE_DOCUMENT_QUERY_KEYS = [
  'purchaseDocuments',
  'purchaseReport',
  'pendingPurchaseCosts',
];

const STOCK_OPNAME_QUERY_KEYS = ['stockOpnames', 'stockOpname', 'stockOpnameCandidates'];
const PRODUCTION_ORDER_QUERY_KEYS = ['productionOrders', 'productionOrder'];

const noRefresh: RealtimeRefreshFn[] = [];
const noQueryKeys: string[] = [];

/**
 * Maps every Postgres table wired to the `kasirku_notify_data_change` trigger
 * (see src-tauri/migrations/0034_realtime_notifications.sql and follow-up
 * migrations 0037-0067) to the refreshXFromPostgres() functions and React
 * Query keys that must run/invalidate when that table changes.
 *
 * Child tables (`*_items`, `*_lines`, etc.) map to their parent bundle's
 * refresh function, not a separate one, matching how read services already
 * merge them together.
 *
 * Tables with an empty `refreshFns` array have no pull-side sync today (only
 * push/local writes, or the entity is fetched on demand) - this is a
 * pre-existing gap tracked in docs/ISSUE-REALTIME-SYNC-FULL-REFRESH-PERFORMANCE.md,
 * not something this mapping can fix. Falling back to a full refresh would not
 * help those tables either (nothing pulls them today, scoped or not), so they
 * are intentionally mapped to a no-op rather than left out of this object
 * (leaving them out would incorrectly trigger the "unmapped table" fallback).
 */
export const REALTIME_TABLE_TO_ENTITY: Record<string, RealtimeEntityMapping> = {
  // Auth / system (no React Query usage - Dexie liveQuery only)
  activity_logs: { refreshFns: [refreshActivityLogsFromPostgres], queryKeys: noQueryKeys },
  auth_users: { refreshFns: [refreshAuthUsersFromPostgres], queryKeys: noQueryKeys },
  roles: { refreshFns: [refreshRolesFromPostgres], queryKeys: noQueryKeys },
  role_permissions: { refreshFns: [refreshRolesFromPostgres], queryKeys: noQueryKeys },
  server_auth_sessions: { refreshFns: noRefresh, queryKeys: noQueryKeys },

  // Setup
  app_setup_config: { refreshFns: [reconcileSetupConfigWithRemote], queryKeys: SETUP_QUERY_KEYS },
  accounting_initial_setup_setting: {
    refreshFns: [refreshAccountingInitialSetupSettingFromPostgres],
    queryKeys: [...SETUP_QUERY_KEYS, ...FINANCE_QUERY_KEYS],
  },
  company_profile_setting: { refreshFns: [getCompanyProfileSetting], queryKeys: ['companyProfileSetting'] },

  // Cashier
  cashier_sessions: { refreshFns: [refreshCashierSessionsFromPostgres], queryKeys: CASHIER_QUERY_KEYS },

  // Cooperative
  cooperative_areas: { refreshFns: [refreshCooperativeAreasFromPostgres], queryKeys: COOPERATIVE_QUERY_KEYS },
  cooperative_loan_collection_events: {
    refreshFns: [refreshCooperativeCollectionEventsFromPostgres],
    queryKeys: COOPERATIVE_QUERY_KEYS,
  },
  cooperative_loans: { refreshFns: [refreshCooperativeLoansFromPostgres], queryKeys: COOPERATIVE_QUERY_KEYS },
  cooperative_loan_installments: {
    refreshFns: [refreshCooperativeLoanInstallmentsFromPostgres],
    queryKeys: COOPERATIVE_QUERY_KEYS,
  },
  cooperative_loan_payments: {
    refreshFns: [refreshCooperativeLoanPaymentsFromPostgres],
    queryKeys: COOPERATIVE_QUERY_KEYS,
  },
  cooperative_members: { refreshFns: [refreshCooperativeMembersFromPostgres], queryKeys: COOPERATIVE_QUERY_KEYS },
  cooperative_member_saving_balances: {
    refreshFns: [refreshCooperativeMemberSavingBalancesFromPostgres],
    queryKeys: COOPERATIVE_QUERY_KEYS,
  },
  cooperative_saving_transactions: {
    refreshFns: [refreshCooperativeSavingTransactionsFromPostgres],
    queryKeys: COOPERATIVE_QUERY_KEYS,
  },
  // No pull-side sync yet (fetched on demand / push-only) - see module doc comment above.
  cooperative_payment_approval_requests: { refreshFns: noRefresh, queryKeys: COOPERATIVE_QUERY_KEYS },
  cooperative_payment_policy: { refreshFns: noRefresh, queryKeys: noQueryKeys },
  cooperative_posting_accounts: { refreshFns: noRefresh, queryKeys: noQueryKeys },

  // Employee (existing grouping invalidates cooperative query keys, preserved as-is)
  employees: { refreshFns: [refreshEmployeesFromPostgres], queryKeys: COOPERATIVE_QUERY_KEYS },
  employee_areas: { refreshFns: [refreshEmployeesFromPostgres], queryKeys: COOPERATIVE_QUERY_KEYS },
  employee_collection_schedules: { refreshFns: [refreshEmployeesFromPostgres], queryKeys: COOPERATIVE_QUERY_KEYS },

  // Finance / accounting
  accounting_profile_setting: {
    refreshFns: [refreshAccountingProfileSettingFromPostgres],
    queryKeys: FINANCE_QUERY_KEYS,
  },
  chart_of_accounts: {
    refreshFns: [refreshChartOfAccountsFromPostgres],
    queryKeys: [...FINANCE_QUERY_KEYS, 'accountingDefaults'],
  },
  enabled_modules: {
    refreshFns: [refreshEnabledModulesFromPostgres],
    queryKeys: [...FINANCE_QUERY_KEYS, 'enabledModules'],
  },
  finance_account_mappings: {
    refreshFns: [refreshFinanceAccountMappingsFromPostgres],
    queryKeys: FINANCE_QUERY_KEYS,
  },
  finance_transactions: { refreshFns: [refreshFinanceTransactionsFromPostgres], queryKeys: FINANCE_QUERY_KEYS },
  cash_bank_reconciliations: {
    refreshFns: [refreshCashBankReconciliationsFromPostgres],
    queryKeys: FINANCE_QUERY_KEYS,
  },
  accounting_periods: { refreshFns: [refreshAccountingPeriodsFromPostgres], queryKeys: FINANCE_QUERY_KEYS },
  accounting_fiscal_years: {
    refreshFns: [refreshAccountingFiscalYearsFromPostgres],
    queryKeys: FINANCE_QUERY_KEYS,
  },
  closing_runs: { refreshFns: [refreshClosingRunsFromPostgres], queryKeys: FINANCE_QUERY_KEYS },
  fiscal_year_closing_runs: {
    refreshFns: [refreshFiscalYearClosingRunsFromPostgres],
    queryKeys: FINANCE_QUERY_KEYS,
  },
  general_ledger_setting: { refreshFns: [refreshGeneralLedgerSettingFromPostgres], queryKeys: FINANCE_QUERY_KEYS },
  journal_entries: { refreshFns: [refreshJournalEntriesFromPostgres], queryKeys: FINANCE_QUERY_KEYS },
  journal_entry_lines: { refreshFns: [refreshJournalEntriesFromPostgres], queryKeys: FINANCE_QUERY_KEYS },
  opening_balance_batches: { refreshFns: [refreshOpeningBalancesFromPostgres], queryKeys: FINANCE_QUERY_KEYS },
  opening_balance_lines: { refreshFns: [refreshOpeningBalancesFromPostgres], queryKeys: FINANCE_QUERY_KEYS },
  fixed_assets: { refreshFns: [refreshFixedAssetsFromPostgres], queryKeys: FINANCE_QUERY_KEYS },
  fixed_asset_depreciation_runs: { refreshFns: [refreshFixedAssetRunsFromPostgres], queryKeys: FINANCE_QUERY_KEYS },
  fixed_asset_depreciation_run_lines: {
    refreshFns: [refreshFixedAssetRunsFromPostgres],
    queryKeys: FINANCE_QUERY_KEYS,
  },

  // Payroll
  employee_cash_advances: {
    refreshFns: [refreshEmployeeCashAdvancesFromPostgres],
    queryKeys: PAYROLL_QUERY_KEYS,
  },
  employee_cash_advance_repayments: {
    refreshFns: [refreshEmployeeCashAdvancesFromPostgres],
    queryKeys: PAYROLL_QUERY_KEYS,
  },
  payroll_runs: { refreshFns: [refreshPayrollRunsFromPostgres], queryKeys: PAYROLL_QUERY_KEYS },
  payroll_run_items: { refreshFns: [refreshPayrollRunsFromPostgres], queryKeys: PAYROLL_QUERY_KEYS },

  // Master data
  contacts: { refreshFns: [refreshContactsFromPostgres], queryKeys: ['contacts'] },
  currencies: { refreshFns: [refreshCurrenciesFromPostgres], queryKeys: ['currencies'] },
  currency_rates: { refreshFns: [refreshCurrencyRatesFromPostgres], queryKeys: ['currencyRates'] },
  departments: { refreshFns: [refreshDepartmentsFromPostgres], queryKeys: ['departments'] },
  projects: { refreshFns: [refreshProjectsFromPostgres], queryKeys: ['projects'] },
  taxes: { refreshFns: [refreshTaxesFromPostgres], queryKeys: ['taxes'] },
  warehouses: { refreshFns: [refreshWarehousesFromPostgres], queryKeys: ['warehouses'] },
  payment_methods: { refreshFns: [refreshPaymentMethodsFromPostgres], queryKeys: noQueryKeys },
  products: { refreshFns: [refreshProductsFromPostgres], queryKeys: ['products'] },
  // No pull-side sync yet - see module doc comment above.
  product_recipes: { refreshFns: noRefresh, queryKeys: noQueryKeys },
  product_recipe_items: { refreshFns: noRefresh, queryKeys: noQueryKeys },

  // Sales / purchase / stock documents
  sales_documents: { refreshFns: [refreshSalesDocumentsFromPostgres], queryKeys: SALES_DOCUMENT_QUERY_KEYS },
  sales_document_items: { refreshFns: [refreshSalesDocumentsFromPostgres], queryKeys: SALES_DOCUMENT_QUERY_KEYS },
  purchase_documents: {
    refreshFns: [refreshPurchaseDocumentsFromPostgres],
    queryKeys: PURCHASE_DOCUMENT_QUERY_KEYS,
  },
  purchase_document_items: {
    refreshFns: [refreshPurchaseDocumentsFromPostgres],
    queryKeys: PURCHASE_DOCUMENT_QUERY_KEYS,
  },
  // No pull-side sync yet - see module doc comment above.
  purchase_cost_reconciliations: { refreshFns: noRefresh, queryKeys: ['pendingPurchaseCosts'] },
  purchase_cost_reconciliation_items: { refreshFns: noRefresh, queryKeys: ['pendingPurchaseCosts'] },
  stock_opnames: { refreshFns: [refreshStockOpnamesFromPostgres], queryKeys: STOCK_OPNAME_QUERY_KEYS },
  stock_opname_items: { refreshFns: [refreshStockOpnamesFromPostgres], queryKeys: STOCK_OPNAME_QUERY_KEYS },
  // No pull-side sync yet - see module doc comment above.
  stock_mutations: { refreshFns: noRefresh, queryKeys: noQueryKeys },
  inventory_lots: { refreshFns: noRefresh, queryKeys: noQueryKeys },
  inventory_lot_consumptions: { refreshFns: noRefresh, queryKeys: noQueryKeys },

  // Production
  production_orders: { refreshFns: [refreshProductionOrdersFromPostgres], queryKeys: PRODUCTION_ORDER_QUERY_KEYS },
  production_order_items: {
    refreshFns: [refreshProductionOrdersFromPostgres],
    queryKeys: PRODUCTION_ORDER_QUERY_KEYS,
  },
  production_order_costs: {
    refreshFns: [refreshProductionOrdersFromPostgres],
    queryKeys: PRODUCTION_ORDER_QUERY_KEYS,
  },

  // Restaurant POS - local/Dexie-only today, no Postgres pull path for any of these.
  restaurant_sessions: { refreshFns: noRefresh, queryKeys: ['restaurantSession'] },
  restaurant_tables: { refreshFns: noRefresh, queryKeys: noQueryKeys },
  restaurant_orders: { refreshFns: noRefresh, queryKeys: noQueryKeys },
  restaurant_kitchen_tickets: { refreshFns: noRefresh, queryKeys: noQueryKeys },
};

export interface RealtimeRefreshPlan {
  refreshFns: RealtimeRefreshFn[];
  queryKeys: string[];
  unknownTables: string[];
}

/**
 * Resolves a batch of changed table names into the deduplicated set of
 * refresh functions to run and React Query keys to invalidate. Tables not
 * present in REALTIME_TABLE_TO_ENTITY (e.g. a new migration forgot to
 * register here) are reported via `unknownTables` so the caller can fail
 * safe (fall back to a full refresh) instead of silently skipping them.
 */
export const resolveRealtimeRefreshPlan = (tableNames: Iterable<string>): RealtimeRefreshPlan => {
  const refreshFns = new Set<RealtimeRefreshFn>();
  const queryKeys = new Set<string>();
  const unknownTables: string[] = [];

  for (const tableName of new Set(tableNames)) {
    const mapping = REALTIME_TABLE_TO_ENTITY[tableName];
    if (!mapping) {
      unknownTables.push(tableName);
      continue;
    }

    mapping.refreshFns.forEach((refreshFn) => refreshFns.add(refreshFn));
    mapping.queryKeys.forEach((queryKey) => queryKeys.add(queryKey));
  }

  return {
    refreshFns: Array.from(refreshFns),
    queryKeys: Array.from(queryKeys),
    unknownTables,
  };
};
