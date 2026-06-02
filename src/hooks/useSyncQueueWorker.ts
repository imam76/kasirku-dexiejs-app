import { useEffect } from 'react';
import { refreshDepartmentsFromPostgres } from '@/services/departmentReadService';
import { refreshProjectsFromPostgres } from '@/services/projectReadService';
import { processPendingSyncQueue } from '@/services/syncQueueService';
import { refreshTaxesFromPostgres } from '@/services/taxReadService';

export const useSyncQueueWorker = () => {
  useEffect(() => {
    const syncWhenOnline = async () => {
      try {
        await processPendingSyncQueue();
        await refreshDepartmentsFromPostgres();
        await refreshProjectsFromPostgres();
        await refreshTaxesFromPostgres();
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
