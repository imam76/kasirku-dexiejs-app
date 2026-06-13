import { useQuery } from '@tanstack/react-query';
import {
  getCooperativeDailyDropReport,
  type CooperativeDailyDropReportFilters,
} from '@/services/cooperativeDailyDropReportService';

export const useCooperativeDailyDropReport = (filters: CooperativeDailyDropReportFilters) => (
  useQuery({
    queryKey: [
      'cooperativeDailyDropReport',
      filters.startDate,
      filters.endDate,
    ],
    queryFn: () => getCooperativeDailyDropReport(filters),
  })
);

export type { CooperativeDailyDropReportFilters };
