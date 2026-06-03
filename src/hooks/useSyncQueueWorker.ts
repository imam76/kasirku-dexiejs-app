import { useEffect } from 'react';
import { refreshActivityLogsFromPostgres, refreshAuthUsersFromPostgres } from '@/auth/authReadService';
import { refreshContactsFromPostgres } from '@/services/contactReadService';
import { refreshDepartmentsFromPostgres } from '@/services/departmentReadService';
import { refreshFinanceTransactionsFromPostgres } from '@/services/financeTransactionReadService';
import { refreshJournalEntriesFromPostgres } from '@/services/journalEntryReadService';
import { refreshProductsFromPostgres } from '@/services/productReadService';
import { refreshPurchaseDocumentsFromPostgres } from '@/services/purchaseDocumentReadService';
import { refreshProjectsFromPostgres } from '@/services/projectReadService';
import { refreshSalesDocumentsFromPostgres } from '@/services/salesDocumentReadService';
import { enqueuePendingAuthUsersForSync, enqueuePendingFinanceTransactionsForSync, enqueuePendingJournalEntriesForSync, enqueuePendingPurchaseDocumentsForSync, enqueuePendingSalesDocumentsForSync, processPendingSyncQueue } from '@/services/syncQueueService';
import { refreshTaxesFromPostgres } from '@/services/taxReadService';
import { refreshWarehousesFromPostgres } from '@/services/warehouseReadService';

export const useSyncQueueWorker = () => {
  useEffect(() => {
    const syncWhenOnline = async () => {
      try {
        await enqueuePendingAuthUsersForSync();
        await enqueuePendingFinanceTransactionsForSync();
        await enqueuePendingJournalEntriesForSync();
        await enqueuePendingPurchaseDocumentsForSync();
        await enqueuePendingSalesDocumentsForSync();
        await processPendingSyncQueue();
        await refreshAuthUsersFromPostgres();
        await refreshActivityLogsFromPostgres();
        await refreshDepartmentsFromPostgres();
        await refreshProjectsFromPostgres();
        await refreshTaxesFromPostgres();
        await refreshContactsFromPostgres();
        await refreshWarehousesFromPostgres();
        await refreshProductsFromPostgres();
        await refreshFinanceTransactionsFromPostgres();
        await refreshJournalEntriesFromPostgres();
        await refreshPurchaseDocumentsFromPostgres();
        await refreshSalesDocumentsFromPostgres();
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
