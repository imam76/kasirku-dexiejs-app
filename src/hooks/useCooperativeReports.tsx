import { useQuery } from '@tanstack/react-query';
import {
  getCooperativeReportData,
  type CooperativeReportFilters,
} from '@/services/cooperativeReportService';

export const useCooperativeReports = (filters: CooperativeReportFilters) => (
  useQuery({
    queryKey: [
      'cooperativeReports',
      filters.startDate,
      filters.endDate,
      filters.asOfDate,
      filters.accountId,
    ],
    queryFn: () => getCooperativeReportData(filters),
  })
);

export type { CooperativeReportFilters };
