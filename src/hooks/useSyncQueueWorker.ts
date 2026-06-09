import { useEffect } from 'react';
import { refreshActivityLogsFromPostgres, refreshAuthUsersFromPostgres } from '@/auth/authReadService';
import { refreshContactsFromPostgres } from '@/services/contactReadService';
import { refreshCooperativeDataFromPostgres } from '@/services/cooperativeReadService';
import { refreshCurrenciesFromPostgres, refreshCurrencyRatesFromPostgres } from '@/services/currencyReadService';
import { refreshDepartmentsFromPostgres } from '@/services/departmentReadService';
import { refreshFinanceTransactionsFromPostgres } from '@/services/financeTransactionReadService';
import { refreshJournalEntriesFromPostgres } from '@/services/journalEntryReadService';
import { refreshProductsFromPostgres } from '@/services/productReadService';
import { refreshPurchaseDocumentsFromPostgres } from '@/services/purchaseDocumentReadService';
import { refreshProjectsFromPostgres } from '@/services/projectReadService';
import { refreshSalesDocumentsFromPostgres } from '@/services/salesDocumentReadService';
import { postgresAdapter } from '@/services/postgresAdapter';
import { enqueuePendingAuthUsersForSync, enqueuePendingCooperativeDataForSync, enqueuePendingFinanceTransactionsForSync, enqueuePendingJournalEntriesForSync, enqueuePendingPurchaseDocumentsForSync, enqueuePendingSalesDocumentsForSync, processPendingSyncQueue, recoverStaleProcessingSyncQueueItems } from '@/services/syncQueueService';
import { refreshTaxesFromPostgres } from '@/services/taxReadService';
import { refreshWarehousesFromPostgres } from '@/services/warehouseReadService';
import { useSyncActivityStore } from '@/store/syncActivityStore';

export const useSyncQueueWorker = () => {
  useEffect(() => {
    const syncWhenOnline = async () => {
      const setSyncPhase = useSyncActivityStore.getState().setPhase;

      try {
        setSyncPhase('uploading');
        await recoverStaleProcessingSyncQueueItems();
        await enqueuePendingAuthUsersForSync();
        await enqueuePendingCooperativeDataForSync();
        await enqueuePendingFinanceTransactionsForSync();
        await enqueuePendingJournalEntriesForSync();
        await enqueuePendingPurchaseDocumentsForSync();
        await enqueuePendingSalesDocumentsForSync();
        await processPendingSyncQueue();

        setSyncPhase('refreshing');
        const postgresHealth = await postgresAdapter.healthCheck();
        console.info('[PostgreSQL sync] health check', postgresHealth);
        if (!postgresHealth.available) {
          setSyncPhase('idle');
          return;
        }

        const refreshResults = {
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
        setSyncPhase('idle');
      } catch (error) {
        console.error('Failed to refresh PostgreSQL read data', error);
        setSyncPhase('error', error instanceof Error ? error.message : String(error));
      }
    };

    void syncWhenOnline();

    window.addEventListener('online', syncWhenOnline);

    return () => {
      window.removeEventListener('online', syncWhenOnline);
    };
  }, []);
};
