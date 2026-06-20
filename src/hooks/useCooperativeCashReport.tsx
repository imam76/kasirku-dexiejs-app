import { useQuery } from '@tanstack/react-query';
import {
  getCooperativeCashReport,
  type CooperativeCashReportFilters,
} from '@/services/cooperativeCashReportService';

export const useCooperativeCashReport = (
  filters: CooperativeCashReportFilters,
) => useQuery({
  queryKey: [
    'cooperativeCashReport',
    filters.date,
    filters.employeeId,
  ],
  queryFn: () => getCooperativeCashReport(filters),
});

export type { CooperativeCashReportFilters };
