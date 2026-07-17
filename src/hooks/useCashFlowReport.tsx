import { useQuery } from '@tanstack/react-query';
import {
  getCashFlowReport,
  type CashFlowReportFilters,
} from '@/services/cashFlowReportService';

export const useCashFlowReport = (filters: CashFlowReportFilters) => useQuery({
  queryKey: [
    'cashFlowReport',
    filters.startDate,
    filters.endDate,
    filters.classification,
    filters.currencyCode,
    filters.includeZeroBalance,
  ],
  queryFn: () => getCashFlowReport(filters),
});
