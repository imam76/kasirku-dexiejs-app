import { refreshActivityLogsFromPostgres, refreshAuthUsersFromPostgres, refreshRolesFromPostgres } from '@/auth/authReadService';
import { refreshContactsFromPostgres } from '@/services/contactReadService';
import { refreshCooperativeAreasFromPostgres } from '@/services/cooperativeAreaReadService';
import { refreshCooperativeDataFromPostgres } from '@/services/cooperativeReadService';
import {
  refreshAccountingInitialSetupSettingFromPostgres,
  refreshAccountingProfileSettingFromPostgres,
  refreshEnabledModulesFromPostgres,
  refreshFinanceAccountMappingsFromPostgres,
  refreshGeneralLedgerSettingFromPostgres,
} from '@/services/accountingSettingReadService';
import { refreshCashierSessionsFromPostgres } from '@/services/cashierSessionReadService';
import { refreshCashBankReconciliationsFromPostgres } from '@/services/cashBankReconciliationReadService';
import { refreshAccountingPeriodsFromPostgres } from '@/services/accountingPeriodReadService';
import { refreshClosingRunsFromPostgres } from '@/services/closingRunReadService';
import { refreshChartOfAccountsFromPostgres } from '@/services/chartOfAccountReadService';
import { refreshCooperativeCollectionEventsFromPostgres } from '@/services/cooperativeCollectionEventService';
import { refreshCurrenciesFromPostgres, refreshCurrencyRatesFromPostgres } from '@/services/currencyReadService';
import { refreshDepartmentsFromPostgres } from '@/services/departmentReadService';
import { refreshEmployeesFromPostgres } from '@/services/employeeReadService';
import { refreshFinanceTransactionsFromPostgres } from '@/services/financeTransactionReadService';
import { refreshJournalEntriesFromPostgres } from '@/services/journalEntryReadService';
import { refreshOpeningBalancesFromPostgres } from '@/services/openingBalanceReadService';
import { refreshEmployeeCashAdvancesFromPostgres, refreshPayrollRunsFromPostgres } from '@/services/payrollReadService';
import { postgresAdapter } from '@/services/postgresAdapter';
import { refreshProductsFromPostgres } from '@/services/productReadService';
import { refreshProductionOrdersFromPostgres } from '@/services/productionReadService';
import { refreshPurchaseDocumentsFromPostgres } from '@/services/purchaseDocumentReadService';
import { refreshProjectsFromPostgres } from '@/services/projectReadService';
import { refreshSalesDocumentsFromPostgres } from '@/services/salesDocumentReadService';
import { syncSetupConfigFromRemote } from '@/services/setupKeyService';
import { refreshStockOpnamesFromPostgres } from '@/services/stockOpnameReadService';
import {
  enqueuePendingAccountingSettingsForSync,
  enqueuePendingAuthUsersForSync,
  enqueuePendingCashierSessionsForSync,
  enqueuePendingCashBankReconciliationsForSync,
  enqueuePendingAccountingPeriodsForSync,
  enqueuePendingClosingRunsForSync,
  enqueuePendingChartOfAccountsForSync,
  enqueuePendingContactsForSync,
  enqueuePendingCooperativeDataForSync,
  enqueuePendingEmployeesForSync,
  enqueuePendingFinanceTransactionsForSync,
  enqueuePendingJournalEntriesForSync,
  enqueuePendingOpeningBalancesForSync,
  enqueuePendingPayrollDataForSync,
  enqueuePendingProductionOrdersForSync,
  enqueuePendingPurchaseDocumentsForSync,
  enqueuePendingRolePermissionsForSync,
  enqueuePendingRolesForSync,
  enqueuePendingSalesDocumentsForSync,
  enqueuePendingStockOpnamesForSync,
  enqueuePendingTaxesForSync,
  processPendingSyncQueue,
  recoverStaleProcessingSyncQueueItems,
  retryFailedSyncQueueItems,
} from '@/services/syncQueueService';
import { refreshTaxesFromPostgres } from '@/services/taxReadService';
import { refreshWarehousesFromPostgres } from '@/services/warehouseReadService';
import { useSyncActivityStore } from '@/store/syncActivityStore';

const getErrorMessage = (error: unknown) => (
  error instanceof Error ? error.message : String(error)
);

export const enqueueAllPendingLocalChangesForSync = async () => {
  await recoverStaleProcessingSyncQueueItems();
  await enqueuePendingRolesForSync();
  await enqueuePendingRolePermissionsForSync();
  await enqueuePendingAuthUsersForSync();
  await enqueuePendingChartOfAccountsForSync();
  await enqueuePendingAccountingSettingsForSync();
  await enqueuePendingTaxesForSync();
  await enqueuePendingContactsForSync();
  await enqueuePendingCooperativeDataForSync();
  await enqueuePendingEmployeesForSync();
  await enqueuePendingPayrollDataForSync();
  await enqueuePendingCashierSessionsForSync();
  await enqueuePendingFinanceTransactionsForSync();
  await enqueuePendingCashBankReconciliationsForSync();
  await enqueuePendingAccountingPeriodsForSync();
  await enqueuePendingJournalEntriesForSync();
  await enqueuePendingOpeningBalancesForSync();
  await enqueuePendingClosingRunsForSync();
  await enqueuePendingProductionOrdersForSync();
  await enqueuePendingPurchaseDocumentsForSync();
  await enqueuePendingSalesDocumentsForSync();
  await enqueuePendingStockOpnamesForSync();
};

export const refreshAllDataFromPostgres = async () => {
  const postgresHealth = await postgresAdapter.healthCheck();
  console.info('[PostgreSQL sync] health check', postgresHealth);

  if (!postgresHealth.available) {
    return {
      postgresHealth,
      skipped: true,
      refreshResults: undefined,
    };
  }

  const refreshResults = {
    roles: await refreshRolesFromPostgres(),
    authUsers: await refreshAuthUsersFromPostgres(),
    activityLogs: await refreshActivityLogsFromPostgres(),
    appSetupConfig: await syncSetupConfigFromRemote(),
    departments: await refreshDepartmentsFromPostgres(),
    chartOfAccounts: await refreshChartOfAccountsFromPostgres(),
    financeAccountMappings: await refreshFinanceAccountMappingsFromPostgres(),
    accountingProfileSetting: await refreshAccountingProfileSettingFromPostgres(),
    accountingInitialSetupSetting: await refreshAccountingInitialSetupSettingFromPostgres(),
    enabledModules: await refreshEnabledModulesFromPostgres(),
    generalLedgerSetting: await refreshGeneralLedgerSettingFromPostgres(),
    projects: await refreshProjectsFromPostgres(),
    taxes: await refreshTaxesFromPostgres(),
    contacts: await refreshContactsFromPostgres(),
    warehouses: await refreshWarehousesFromPostgres(),
    cooperativeAreas: await refreshCooperativeAreasFromPostgres(),
    employees: await refreshEmployeesFromPostgres(),
    currencies: await refreshCurrenciesFromPostgres(),
    currencyRates: await refreshCurrencyRatesFromPostgres(),
    products: await refreshProductsFromPostgres(),
    payrollRuns: await refreshPayrollRunsFromPostgres(),
    employeeCashAdvances: await refreshEmployeeCashAdvancesFromPostgres(),
    cashierSessions: await refreshCashierSessionsFromPostgres(),
    financeTransactions: await refreshFinanceTransactionsFromPostgres(),
    cashBankReconciliations: await refreshCashBankReconciliationsFromPostgres(),
    accountingPeriods: await refreshAccountingPeriodsFromPostgres(),
    journalEntries: await refreshJournalEntriesFromPostgres(),
    openingBalances: await refreshOpeningBalancesFromPostgres(),
    closingRuns: await refreshClosingRunsFromPostgres(),
    productionOrders: await refreshProductionOrdersFromPostgres(),
    cooperative: await refreshCooperativeDataFromPostgres(),
    cooperativeCollectionEvents: await refreshCooperativeCollectionEventsFromPostgres(),
    purchaseDocuments: await refreshPurchaseDocumentsFromPostgres(),
    salesDocuments: await refreshSalesDocumentsFromPostgres(),
    stockOpnames: await refreshStockOpnamesFromPostgres(),
  };

  console.info('[PostgreSQL sync] read refresh completed', refreshResults);

  return {
    postgresHealth,
    skipped: false,
    refreshResults,
  };
};

type DatabaseSyncResult = Awaited<ReturnType<typeof refreshAllDataFromPostgres>>;

let activeDatabaseSync: Promise<DatabaseSyncResult> | null = null;
let activeDatabaseRefresh: Promise<DatabaseSyncResult> | null = null;

const runDatabaseSyncNowInternal = async () => {
  const setSyncPhase = useSyncActivityStore.getState().setPhase;

  try {
    setSyncPhase('uploading');
    await enqueueAllPendingLocalChangesForSync();
    await processPendingSyncQueue();

    setSyncPhase('refreshing');
    const result = await refreshAllDataFromPostgres();

    setSyncPhase('idle');
    return result;
  } catch (error) {
    setSyncPhase('error', getErrorMessage(error));
    throw error;
  }
};

const runDatabaseRefreshNowInternal = async () => {
  const setSyncPhase = useSyncActivityStore.getState().setPhase;

  try {
    setSyncPhase('refreshing');
    const result = await refreshAllDataFromPostgres();

    setSyncPhase('idle');
    return result;
  } catch (error) {
    setSyncPhase('error', getErrorMessage(error));
    throw error;
  }
};

export const runDatabaseSyncNow = async () => {
  if (activeDatabaseSync) {
    return activeDatabaseSync;
  }

  activeDatabaseSync = (async () => {
    if (activeDatabaseRefresh) {
      await activeDatabaseRefresh;
    }

    return runDatabaseSyncNowInternal();
  })().finally(() => {
    activeDatabaseSync = null;
  });

  return activeDatabaseSync;
};

export const runDatabaseRefreshNow = async () => {
  if (activeDatabaseSync) {
    return activeDatabaseSync;
  }

  if (activeDatabaseRefresh) {
    return activeDatabaseRefresh;
  }

  activeDatabaseRefresh = runDatabaseRefreshNowInternal().finally(() => {
    activeDatabaseRefresh = null;
  });

  return activeDatabaseRefresh;
};

export const retryFailedDatabaseSyncItems = async () => {
  const setSyncPhase = useSyncActivityStore.getState().setPhase;

  try {
    setSyncPhase('uploading');
    await retryFailedSyncQueueItems();
    await processPendingSyncQueue();
    setSyncPhase('idle');
  } catch (error) {
    setSyncPhase('error', getErrorMessage(error));
    throw error;
  }
};
