import { useQuery } from '@tanstack/react-query';
import {
  getCooperativeLedgerReportData,
  type CooperativeLedgerReportFilters,
} from '@/services/cooperativeLedgerReportService';

export const useCooperativeLedgerReport = (filters: CooperativeLedgerReportFilters) => (
  useQuery({
    queryKey: [
      'cooperativeLedgerReport',
      filters.startDate,
      filters.endDate,
      filters.fromAccountId,
      filters.toAccountId,
      filters.hideZeroBalance,
    ],
    queryFn: () => getCooperativeLedgerReportData(filters),
  })
);

export type { CooperativeLedgerReportFilters };
