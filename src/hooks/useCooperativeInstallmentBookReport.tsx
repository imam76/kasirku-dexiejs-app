import { useQuery } from '@tanstack/react-query';
import {
  getCooperativeInstallmentBookReport,
  type CooperativeInstallmentBookReportFilters,
  type CooperativeInstallmentBookSortBy,
  type CooperativeInstallmentBookSortDirection,
} from '@/services/cooperativeInstallmentBookReportService';

export const useCooperativeInstallmentBookReport = (
  filters: CooperativeInstallmentBookReportFilters,
) => useQuery({
  queryKey: [
    'cooperativeInstallmentBookReport',
    filters.monthDate,
    filters.collectionWeekday,
    filters.employeeId,
    filters.visibleAreaIds,
    filters.sortBy,
    filters.sortDirection,
  ],
  queryFn: () => getCooperativeInstallmentBookReport(filters),
});

export type {
  CooperativeInstallmentBookReportFilters,
  CooperativeInstallmentBookSortBy,
  CooperativeInstallmentBookSortDirection,
};
