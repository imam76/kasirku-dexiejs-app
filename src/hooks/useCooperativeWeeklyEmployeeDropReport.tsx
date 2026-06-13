import { useQuery } from '@tanstack/react-query';
import {
  getCooperativeWeeklyEmployeeDropReport,
  type CooperativeWeeklyEmployeeDropReportFilters,
} from '@/services/cooperativeWeeklyEmployeeDropReportService';

export const useCooperativeWeeklyEmployeeDropReport = (
  filters: CooperativeWeeklyEmployeeDropReportFilters,
) => (
  useQuery({
    queryKey: [
      'cooperativeWeeklyEmployeeDropReport',
      filters.monthDate,
    ],
    queryFn: () => getCooperativeWeeklyEmployeeDropReport(filters),
  })
);

export type { CooperativeWeeklyEmployeeDropReportFilters };
