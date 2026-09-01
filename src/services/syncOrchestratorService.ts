import { refreshActivityLogsFromPostgres, refreshAuthUsersFromPostgres, refreshRolesFromPostgres } from '@/auth/authReadService';
import { refreshContactsFromPostgres } from '@/services/contactReadService';
import { refreshMembershipsFromPostgres } from '@/services/membershipReadService';
import { refreshCooperativeAreasFromPostgres } from '@/services/cooperativeAreaReadService';
import { refreshCooperativeDataFromPostgres } from '@/services/cooperativeReadService';
import { refreshWorkforceStateFromPostgres } from '@/services/workforceReadService';
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
import {
  refreshAccountingFiscalYearsFromPostgres,
  refreshFiscalYearClosingRunsFromPostgres,
} from '@/services/fiscalYearReadService';
import { refreshChartOfAccountsFromPostgres } from '@/services/chartOfAccountReadService';
import { getCompanyProfileSetting } from '@/services/companyProfileSettingService';
import { refreshCooperativeCollectionEventsFromPostgres } from '@/services/cooperativeCollectionEventService';
import { refreshCurrenciesFromPostgres, refreshCurrencyRatesFromPostgres } from '@/services/currencyReadService';
import { refreshDepartmentsFromPostgres } from '@/services/departmentReadService';
import { bindHostIdentityIfUnbound } from '@/services/hostIdentityService';
import { refreshEmployeesFromPostgres } from '@/services/employeeReadService';
import { refreshHrDataFromPostgres } from '@/services/hrReadService';
import { refreshFinanceTransactionsFromPostgres } from '@/services/financeTransactionReadService';
import { refreshJournalEntriesFromPostgres } from '@/services/journalEntryReadService';
import { refreshOpeningBalancesFromPostgres } from '@/services/openingBalanceReadService';
import { refreshPaymentMethodsFromPostgres } from '@/services/paymentMethodReadService';
import { refreshEmployeeCashAdvancesFromPostgres, refreshPayrollRunsFromPostgres } from '@/services/payrollReadService';
import { postgresAdapter } from '@/services/postgresAdapter';
import { refreshProductsFromPostgres } from '@/services/productReadService';
import { refreshProductionOrdersFromPostgres } from '@/services/productionReadService';
import { refreshPurchaseDocumentsFromPostgres } from '@/services/purchaseDocumentReadService';
import { refreshPurchaseCostReconciliationsFromPostgres } from '@/services/purchaseCostReconciliationReadService';
import { refreshProjectsFromPostgres } from '@/services/projectReadService';
import { refreshBudgetsFromPostgres } from '@/services/budgetReadService';
import { refreshFixedAssetsFromPostgres, refreshFixedAssetRunsFromPostgres } from '@/services/fixedAssetReadService';
import {
  refreshInventoryLotConsumptionsFromPostgres,
  refreshInventoryLotsFromPostgres,
} from '@/services/inventoryLotReadService';
import { refreshPromosFromPostgres } from '@/services/promoReadService';
import { refreshLotteriesFromPostgres } from '@/services/lotteryReadService';
import { refreshSalesDocumentsFromPostgres } from '@/services/salesDocumentReadService';
import { refreshStockMutationsFromPostgres } from '@/services/stockMutationReadService';
import { refreshTransactionsFromPostgres } from '@/services/transactionReadService';
import { reconcileSetupConfigWithRemote } from '@/services/setupKeyService';
import { refreshStockOpnamesFromPostgres } from '@/services/stockOpnameReadService';
import { refreshPosStockDiscrepanciesFromPostgres } from '@/services/posStockDiscrepancyReadService';
import {
  enqueuePendingAccountingSettingsForSync,
  enqueuePendingAuthUsersForSync,
  enqueuePendingCashierSessionsForSync,
  enqueuePendingCashBankReconciliationsForSync,
  enqueuePendingAccountingPeriodsForSync,
  enqueuePendingAccountingFiscalYearsForSync,
  enqueuePendingClosingRunsForSync,
  enqueuePendingFiscalYearClosingRunsForSync,
  enqueuePendingChartOfAccountsForSync,
  enqueuePendingContactsForSync,
  enqueuePendingMembershipsForSync,
  enqueuePendingCooperativeDataForSync,
  enqueuePendingEmployeesForSync,
  enqueuePendingHrDataForSync,
  enqueuePendingWorkforceForSync,
  enqueuePendingFinanceTransactionsForSync,
  enqueuePendingJournalEntriesForSync,
  enqueuePendingOpeningBalancesForSync,
  enqueuePendingPaymentMethodsForSync,
  enqueuePendingPayrollDataForSync,
  enqueuePendingProductionOrdersForSync,
  enqueuePendingPurchaseDocumentsForSync,
  enqueuePendingPurchaseCostReconciliationsForSync,
  enqueuePendingRolePermissionsForSync,
  enqueuePendingRolesForSync,
  enqueuePendingSalesDocumentsForSync,
  enqueuePendingStockOpnamesForSync,
  enqueuePendingPosStockDiscrepanciesForSync,
  enqueuePendingFixedAssetsForSync,
  enqueuePendingFixedAssetRunsForSync,
  enqueuePendingInventoryLotsForSync,
  enqueuePendingInventoryLotConsumptionsForSync,
  enqueuePendingProductsForSync,
  enqueuePendingPromosForSync,
  enqueuePendingLotteriesForSync,
  enqueuePendingTaxesForSync,
  enqueuePendingTransactionsForSync,
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
  await enqueuePendingPaymentMethodsForSync();
  await enqueuePendingContactsForSync();
  await enqueuePendingMembershipsForSync();
  await enqueuePendingProductsForSync();
  await enqueuePendingCooperativeDataForSync();
  await enqueuePendingEmployeesForSync();
  await enqueuePendingHrDataForSync();
  await enqueuePendingWorkforceForSync();
  await enqueuePendingPayrollDataForSync();
  await enqueuePendingCashierSessionsForSync();
  await enqueuePendingFinanceTransactionsForSync();
  await enqueuePendingCashBankReconciliationsForSync();
  await enqueuePendingAccountingPeriodsForSync();
  await enqueuePendingAccountingFiscalYearsForSync();
  await enqueuePendingJournalEntriesForSync();
  await enqueuePendingOpeningBalancesForSync();
  await enqueuePendingClosingRunsForSync();
  await enqueuePendingFiscalYearClosingRunsForSync();
  await enqueuePendingProductionOrdersForSync();
  await enqueuePendingPurchaseDocumentsForSync();
  await enqueuePendingPurchaseCostReconciliationsForSync();
  await enqueuePendingSalesDocumentsForSync();
  await enqueuePendingTransactionsForSync();
  await enqueuePendingPromosForSync();
  await enqueuePendingLotteriesForSync();
  await enqueuePendingStockOpnamesForSync();
  await enqueuePendingPosStockDiscrepanciesForSync();
  await enqueuePendingFixedAssetsForSync();
  await enqueuePendingFixedAssetRunsForSync();
  await enqueuePendingInventoryLotsForSync();
  await enqueuePendingInventoryLotConsumptionsForSync();
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

  await bindHostIdentityIfUnbound();

  const refreshResults = {
    roles: await refreshRolesFromPostgres(),
    authUsers: await refreshAuthUsersFromPostgres(),
    activityLogs: await refreshActivityLogsFromPostgres(),
    appSetupConfig: await reconcileSetupConfigWithRemote(),
    companyProfileSetting: await getCompanyProfileSetting(),
    departments: await refreshDepartmentsFromPostgres(),
    chartOfAccounts: await refreshChartOfAccountsFromPostgres(),
    financeAccountMappings: await refreshFinanceAccountMappingsFromPostgres(),
    accountingProfileSetting: await refreshAccountingProfileSettingFromPostgres(),
    accountingInitialSetupSetting: await refreshAccountingInitialSetupSettingFromPostgres(),
    enabledModules: await refreshEnabledModulesFromPostgres(),
    generalLedgerSetting: await refreshGeneralLedgerSettingFromPostgres(),
    projects: await refreshProjectsFromPostgres(),
    budgets: await refreshBudgetsFromPostgres(),
    fixedAssets: await refreshFixedAssetsFromPostgres(),
    fixedAssetDepreciationRuns: await refreshFixedAssetRunsFromPostgres(),
    taxes: await refreshTaxesFromPostgres(),
    paymentMethods: await refreshPaymentMethodsFromPostgres(),
    contacts: await refreshContactsFromPostgres(),
    memberships: await refreshMembershipsFromPostgres(),
    warehouses: await refreshWarehousesFromPostgres(),
    cooperativeAreas: await refreshCooperativeAreasFromPostgres(),
    employees: await refreshEmployeesFromPostgres(),
    hr: await refreshHrDataFromPostgres(),
    workforce: await refreshWorkforceStateFromPostgres(),
    currencies: await refreshCurrenciesFromPostgres(),
    currencyRates: await refreshCurrencyRatesFromPostgres(),
    products: await refreshProductsFromPostgres(),
    payrollRuns: await refreshPayrollRunsFromPostgres(),
    employeeCashAdvances: await refreshEmployeeCashAdvancesFromPostgres(),
    cashierSessions: await refreshCashierSessionsFromPostgres(),
    financeTransactions: await refreshFinanceTransactionsFromPostgres(),
    cashBankReconciliations: await refreshCashBankReconciliationsFromPostgres(),
    accountingPeriods: await refreshAccountingPeriodsFromPostgres(),
    accountingFiscalYears: await refreshAccountingFiscalYearsFromPostgres(),
    journalEntries: await refreshJournalEntriesFromPostgres(),
    openingBalances: await refreshOpeningBalancesFromPostgres(),
    closingRuns: await refreshClosingRunsFromPostgres(),
    fiscalYearClosingRuns: await refreshFiscalYearClosingRunsFromPostgres(),
    productionOrders: await refreshProductionOrdersFromPostgres(),
    cooperative: await refreshCooperativeDataFromPostgres(),
    cooperativeCollectionEvents: await refreshCooperativeCollectionEventsFromPostgres(),
    purchaseDocuments: await refreshPurchaseDocumentsFromPostgres(),
    purchaseCostReconciliations: await refreshPurchaseCostReconciliationsFromPostgres(),
    salesDocuments: await refreshSalesDocumentsFromPostgres(),
    transactions: await refreshTransactionsFromPostgres(),
    promos: await refreshPromosFromPostgres(),
    lotteries: await refreshLotteriesFromPostgres(),
    stockOpnames: await refreshStockOpnamesFromPostgres(),
    posStockDiscrepancies: await refreshPosStockDiscrepanciesFromPostgres(),
    stockMutations: await refreshStockMutationsFromPostgres(),
    inventoryLots: await refreshInventoryLotsFromPostgres(),
    inventoryLotConsumptions: await refreshInventoryLotConsumptionsFromPostgres(),
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
