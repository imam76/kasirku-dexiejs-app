import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getSlowMovingReport } from '@/services/slowMovingReportService';
import type { DashboardDateRange } from '@/utils/dashboardDateRanges';

export const useSlowMovingReport = ({ startDate, endDate }: DashboardDateRange) => {
  const [revision, setRevision] = useState(0);
  const key = `${startDate}:${endDate}:${revision}`;
  const result = useLiveQuery(async () => {
    try {
      return { key, data: await getSlowMovingReport({ startDate, endDate }), error: undefined };
    } catch (error) {
      return { key, data: undefined, error: error instanceof Error ? error.message : String(error) };
    }
  }, [startDate, endDate, revision]);
  const current = result?.key === key ? result : undefined;
  return { data: current?.data, error: current?.error, isLoading: !current, refresh: () => setRevision((value) => value + 1) };
};
