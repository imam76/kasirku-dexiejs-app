import { useQuery } from '@tanstack/react-query';
import {
  getCooperativeDailyTargetReport,
  type CooperativeDailyTargetReportFilters,
} from '@/services/cooperativeDailyTargetReportService';

export const useCooperativeDailyTargetReport = (
  filters: CooperativeDailyTargetReportFilters,
) => useQuery({
  queryKey: [
    'cooperativeDailyTargetReport',
    'byEmployeeV1',
    filters.monthDate,
    filters.employeeId,
  ],
  queryFn: () => getCooperativeDailyTargetReport(filters),
});

export type { CooperativeDailyTargetReportFilters };
