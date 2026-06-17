import { useQuery } from '@tanstack/react-query';
import {
  getCooperativeDailyStortingReport,
  type CooperativeDailyStortingReportFilters,
} from '@/services/cooperativeDailyStortingReportService';

export const useCooperativeDailyStortingReport = (
  filters: CooperativeDailyStortingReportFilters,
) => (
  useQuery({
    queryKey: [
      'cooperativeDailyStortingReport',
      'byEmployeeV2',
      filters.monthDate,
      filters.employeeId,
    ],
    queryFn: () => getCooperativeDailyStortingReport(filters),
  })
);

export type { CooperativeDailyStortingReportFilters };
