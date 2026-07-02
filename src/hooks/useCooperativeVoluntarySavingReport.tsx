import { useQuery } from '@tanstack/react-query';
import {
  getCooperativeVoluntarySavingReport,
  type CooperativeVoluntarySavingReportFilters,
} from '@/services/cooperativeVoluntarySavingReportService';

export const useCooperativeVoluntarySavingReport = (
  filters: CooperativeVoluntarySavingReportFilters,
) => (
  useQuery({
    queryKey: [
      'cooperativeVoluntarySavingReport',
      filters.asOfDate,
      filters.searchText,
    ],
    queryFn: () => getCooperativeVoluntarySavingReport(filters),
  })
);

export type { CooperativeVoluntarySavingReportFilters };
