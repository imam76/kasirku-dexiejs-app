import { useQuery } from '@tanstack/react-query';
import {
  getCooperativeSavingMovementReport,
  type CooperativeSavingMovementReportFilters,
} from '@/services/cooperativeSavingMovementReportService';

export const useCooperativeSavingMovementReport = (
  filters: CooperativeSavingMovementReportFilters,
) => useQuery({
  queryKey: [
    'cooperativeSavingMovementReport',
    filters.direction,
    filters.monthDate,
    filters.employeeId,
    filters.savingType,
  ],
  queryFn: () => getCooperativeSavingMovementReport(filters),
});

export type { CooperativeSavingMovementReportFilters };
