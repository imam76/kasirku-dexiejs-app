import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getInventoryReport } from '@/services/inventoryReportService';

export const useInventoryReport = () => {
  const [revision, setRevision] = useState(0);
  const result = useLiveQuery(async () => {
    try {
      return { data: await getInventoryReport(), error: undefined };
    } catch (error) {
      return { data: undefined, error: error instanceof Error ? error.message : String(error) };
    }
  }, [revision]);
  return { data: result?.data, error: result?.error, isLoading: result === undefined, refresh: () => setRevision((value) => value + 1) };
};
