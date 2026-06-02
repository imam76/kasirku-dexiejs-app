import { useEffect } from 'react';
import { refreshDepartmentsFromPostgres } from '@/services/departmentReadService';
import { processPendingSyncQueue } from '@/services/syncQueueService';

export const useSyncQueueWorker = () => {
  useEffect(() => {
    const syncWhenOnline = async () => {
      try {
        await processPendingSyncQueue();
        await refreshDepartmentsFromPostgres();
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
