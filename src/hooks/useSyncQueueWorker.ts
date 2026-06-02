import { useEffect } from 'react';
import { refreshActivityLogsFromPostgres, refreshAuthUsersFromPostgres } from '@/auth/authReadService';
import { refreshContactsFromPostgres } from '@/services/contactReadService';
import { refreshDepartmentsFromPostgres } from '@/services/departmentReadService';
import { refreshProductsFromPostgres } from '@/services/productReadService';
import { refreshProjectsFromPostgres } from '@/services/projectReadService';
import { refreshSalesDocumentsFromPostgres } from '@/services/salesDocumentReadService';
import { enqueuePendingAuthUsersForSync, enqueuePendingSalesDocumentsForSync, processPendingSyncQueue } from '@/services/syncQueueService';
import { refreshTaxesFromPostgres } from '@/services/taxReadService';
import { refreshWarehousesFromPostgres } from '@/services/warehouseReadService';

export const useSyncQueueWorker = () => {
  useEffect(() => {
    const syncWhenOnline = async () => {
      try {
        await enqueuePendingAuthUsersForSync();
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
