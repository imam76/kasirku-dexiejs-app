import { useQuery } from '@tanstack/react-query';
import {
  getLedgerReportData,
  type LedgerReportFilters,
} from '@/services/ledgerReportService';

export const useLedgerReport = (filters: LedgerReportFilters) => (
  useQuery({
    queryKey: [
      'ledgerReport',
      filters.startDate,
      filters.endDate,
      filters.fromAccountId,
      filters.toAccountId,
      filters.hideZeroBalance,
    ],
    queryFn: () => getLedgerReportData(filters),
  })
);

export type { LedgerReportFilters };
