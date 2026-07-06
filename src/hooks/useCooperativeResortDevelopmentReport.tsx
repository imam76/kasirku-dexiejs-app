import { useQuery } from '@tanstack/react-query';
import {
  getCooperativeResortDevelopmentReport,
  type CooperativeResortDevelopmentReportFilters,
} from '@/services/cooperativeResortDevelopmentReportService';

export const useCooperativeResortDevelopmentReport = (
  filters: CooperativeResortDevelopmentReportFilters,
) => useQuery({
  queryKey: [
    'cooperativeResortDevelopmentReport',
    filters.monthDate,
    filters.employeeId,
  ],
  queryFn: () => getCooperativeResortDevelopmentReport(filters),
});

export type { CooperativeResortDevelopmentReportFilters };
