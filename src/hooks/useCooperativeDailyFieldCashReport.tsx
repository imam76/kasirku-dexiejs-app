import { useQuery } from '@tanstack/react-query';
import {
  getCooperativeDailyFieldCashReport,
  type CooperativeDailyFieldCashReportFilters,
} from '@/services/cooperativeDailyFieldCashReportService';

export const useCooperativeDailyFieldCashReport = (
  filters: CooperativeDailyFieldCashReportFilters,
) => (
  useQuery({
    queryKey: [
      'cooperativeDailyFieldCashReport',
      filters.fromDate,
      filters.toDate,
      filters.employeeId,
    ],
    queryFn: () => getCooperativeDailyFieldCashReport(filters),
  })
);

export type { CooperativeDailyFieldCashReportFilters };
