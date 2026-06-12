import { useQuery } from '@tanstack/react-query';
import {
  getCooperativeMemberRegisterReportData,
  type CooperativeMemberRegisterReportFilters,
} from '@/services/cooperativeMemberRegisterReportService';

export const useCooperativeMemberRegisterReport = (
  filters: CooperativeMemberRegisterReportFilters,
) => (
  useQuery({
    queryKey: [
      'cooperativeMemberRegisterReport',
      filters.startDate,
      filters.endDate,
      filters.officerId,
    ],
    queryFn: () => getCooperativeMemberRegisterReportData(filters),
  })
);

export type { CooperativeMemberRegisterReportFilters };
