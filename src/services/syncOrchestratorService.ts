import { refreshActivityLogsFromPostgres, refreshAuthUsersFromPostgres, refreshRolesFromPostgres } from '@/auth/authReadService';
import { refreshContactsFromPostgres } from '@/services/contactReadService';
import { refreshCooperativeDataFromPostgres } from '@/services/cooperativeReadService';
import { refreshCurrenciesFromPostgres, refreshCurrencyRatesFromPostgres } from '@/services/currencyReadService';
import { refreshDepartmentsFromPostgres } from '@/services/departmentReadService';
import { refreshFinanceTransactionsFromPostgres } from '@/services/financeTransactionReadService';
import { refreshJournalEntriesFromPostgres } from '@/services/journalEntryReadService';
import { postgresAdapter } from '@/services/postgresAdapter';
import { refreshProductsFromPostgres } from '@/services/productReadService';
import { refreshPurchaseDocumentsFromPostgres } from '@/services/purchaseDocumentReadService';
import { refreshProjectsFromPostgres } from '@/services/projectReadService';
import { refreshSalesDocumentsFromPostgres } from '@/services/salesDocumentReadService';
import {
  enqueuePendingAuthUsersForSync,
  enqueuePendingCooperativeDataForSync,
  enqueuePendingFinanceTransactionsForSync,
  enqueuePendingJournalEntriesForSync,
  enqueuePendingPurchaseDocumentsForSync,
  enqueuePendingRolePermissionsForSync,
  enqueuePendingRolesForSync,
  enqueuePendingSalesDocumentsForSync,
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
  await enqueuePendingCooperativeDataForSync();
  await enqueuePendingFinanceTransactionsForSync();
  await enqueuePendingJournalEntriesForSync();
  await enqueuePendingPurchaseDocumentsForSync();
  await enqueuePendingSalesDocumentsForSync();
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
    departments: await refreshDepartmentsFromPostgres(),
    projects: await refreshProjectsFromPostgres(),
    taxes: await refreshTaxesFromPostgres(),
    contacts: await refreshContactsFromPostgres(),
    warehouses: await refreshWarehousesFromPostgres(),
    currencies: await refreshCurrenciesFromPostgres(),
    currencyRates: await refreshCurrencyRatesFromPostgres(),
    products: await refreshProductsFromPostgres(),
    financeTransactions: await refreshFinanceTransactionsFromPostgres(),
    journalEntries: await refreshJournalEntriesFromPostgres(),
    cooperative: await refreshCooperativeDataFromPostgres(),
    purchaseDocuments: await refreshPurchaseDocumentsFromPostgres(),
    salesDocuments: await refreshSalesDocumentsFromPostgres(),
  };

  console.info('[PostgreSQL sync] read refresh completed', refreshResults);

  return {
    postgresHealth,
    skipped: false,
    refreshResults,
  };
};

export const runDatabaseSyncNow = async () => {
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
