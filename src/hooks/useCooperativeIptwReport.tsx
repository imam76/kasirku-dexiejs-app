import { useQuery } from '@tanstack/react-query';
import {
  getCooperativeIptwReport,
  type CooperativeIptwReportFilters,
} from '@/services/cooperativeIptwReportService';

export const useCooperativeIptwReport = (
  filters: CooperativeIptwReportFilters,
) => (
  useQuery({
    queryKey: ['cooperativeIptwReport', filters.monthDate],
    queryFn: () => getCooperativeIptwReport(filters),
  })
);

export type { CooperativeIptwReportFilters };
