import { useEffect } from 'react';
import { refreshActivityLogsFromPostgres, refreshAuthUsersFromPostgres } from '@/auth/authReadService';
import { refreshContactsFromPostgres } from '@/services/contactReadService';
import { refreshCurrenciesFromPostgres, refreshCurrencyRatesFromPostgres } from '@/services/currencyReadService';
import { refreshDepartmentsFromPostgres } from '@/services/departmentReadService';
import { refreshFinanceTransactionsFromPostgres } from '@/services/financeTransactionReadService';
import { refreshJournalEntriesFromPostgres } from '@/services/journalEntryReadService';
import { refreshProductsFromPostgres } from '@/services/productReadService';
import { refreshPurchaseDocumentsFromPostgres } from '@/services/purchaseDocumentReadService';
import { refreshProjectsFromPostgres } from '@/services/projectReadService';
import { refreshSalesDocumentsFromPostgres } from '@/services/salesDocumentReadService';
import { postgresAdapter } from '@/services/postgresAdapter';
import { enqueuePendingAuthUsersForSync, enqueuePendingFinanceTransactionsForSync, enqueuePendingJournalEntriesForSync, enqueuePendingPurchaseDocumentsForSync, enqueuePendingSalesDocumentsForSync, processPendingSyncQueue, recoverStaleProcessingSyncQueueItems } from '@/services/syncQueueService';
import { refreshTaxesFromPostgres } from '@/services/taxReadService';
import { refreshWarehousesFromPostgres } from '@/services/warehouseReadService';

export const useSyncQueueWorker = () => {
  useEffect(() => {
    const syncWhenOnline = async () => {
      try {
        await recoverStaleProcessingSyncQueueItems();
        await enqueuePendingAuthUsersForSync();
        await enqueuePendingFinanceTransactionsForSync();
        await enqueuePendingJournalEntriesForSync();
        await enqueuePendingPurchaseDocumentsForSync();
        await enqueuePendingSalesDocumentsForSync();
        await processPendingSyncQueue();

        const postgresHealth = await postgresAdapter.healthCheck();
        console.info('[PostgreSQL sync] health check', postgresHealth);
        if (!postgresHealth.available) return;

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
          purchaseDocuments: await refreshPurchaseDocumentsFromPostgres(),
          salesDocuments: await refreshSalesDocumentsFromPostgres(),
        };
        console.info('[PostgreSQL sync] read refresh completed', refreshResults);
      } catch (error) {
        console.error('Failed to refresh PostgreSQL read data', error);
      }
    };

    void syncWhenOnline();

    window.addEventListener('online', syncWhenOnline);

    return () => {
      window.removeEventListener('online', syncWhenOnline);
    };
  }, []);
};
