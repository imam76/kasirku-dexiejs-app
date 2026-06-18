import { useQuery } from '@tanstack/react-query';
import {
  getCooperativeInstallmentBookReport,
  type CooperativeInstallmentBookReportFilters,
} from '@/services/cooperativeInstallmentBookReportService';

export const useCooperativeInstallmentBookReport = (
  filters: CooperativeInstallmentBookReportFilters,
) => useQuery({
  queryKey: [
    'cooperativeInstallmentBookReport',
    filters.monthDate,
    filters.employeeId,
    filters.visibleAreaIds,
  ],
  queryFn: () => getCooperativeInstallmentBookReport(filters),
});

export type { CooperativeInstallmentBookReportFilters };
