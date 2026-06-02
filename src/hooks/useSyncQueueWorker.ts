import { useEffect } from 'react';
import { refreshActivityLogsFromPostgres, refreshAuthUsersFromPostgres } from '@/auth/authReadService';
import { refreshContactsFromPostgres } from '@/services/contactReadService';
import { refreshDepartmentsFromPostgres } from '@/services/departmentReadService';
import { refreshProductsFromPostgres } from '@/services/productReadService';
import { refreshProjectsFromPostgres } from '@/services/projectReadService';
import { enqueuePendingAuthUsersForSync, processPendingSyncQueue } from '@/services/syncQueueService';
import { refreshTaxesFromPostgres } from '@/services/taxReadService';
import { refreshWarehousesFromPostgres } from '@/services/warehouseReadService';

export const useSyncQueueWorker = () => {
  useEffect(() => {
    const syncWhenOnline = async () => {
      try {
        await enqueuePendingAuthUsersForSync();
        await processPendingSyncQueue();
        await refreshAuthUsersFromPostgres();
        await refreshActivityLogsFromPostgres();
        await refreshDepartmentsFromPostgres();
        await refreshProjectsFromPostgres();
        await refreshTaxesFromPostgres();
        await refreshContactsFromPostgres();
        await refreshWarehousesFromPostgres();
        await refreshProductsFromPostgres();
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
