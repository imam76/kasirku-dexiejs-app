import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from '@/lib/dayjs';
import {
  getIncomeStatementReport,
  type GeneralLedgerReportFilters,
  type IncomeStatementReport,
} from '@/services/generalLedgerService';
import { getPosSalesReportData } from '@/services/posSalesReportService';
import type { PosSalesReportData } from '@/services/posSalesReportAggregator';

interface DashboardReportRange {
  startDate?: string;
  endDate?: string;
  enabled: boolean;
  refreshKey: number;
}

const toLedgerFilters = (startDate?: string, endDate?: string): GeneralLedgerReportFilters => ({
  startDate: startDate ? dayjs.tz(startDate).startOf('day').toISOString() : undefined,
  endDate: endDate ? dayjs.tz(endDate).endOf('day').toISOString() : undefined,
});

export const useDashboardProfitLossReport = ({
  startDate,
  endDate,
  enabled,
  refreshKey,
}: DashboardReportRange) => {
  const data = useLiveQuery(
    async (): Promise<IncomeStatementReport | undefined> => {
      if (!enabled) return undefined;
      return getIncomeStatementReport(toLedgerFilters(startDate, endDate));
    },
    [enabled, startDate, endDate, refreshKey],
  );

  return {
    data,
    isLoading: enabled && data === undefined,
  };
};

export const useDashboardPosSalesReport = ({
  startDate,
  endDate,
  enabled,
  refreshKey,
  topProductsLimit,
}: DashboardReportRange & { topProductsLimit?: number }) => {
  const data = useLiveQuery(
    async (): Promise<PosSalesReportData | undefined> => {
      if (!enabled) return undefined;
      return getPosSalesReportData({
        startDate,
        endDate,
        topProductsLimit,
      });
    },
    [enabled, startDate, endDate, refreshKey, topProductsLimit],
  );

  return {
    data,
    isLoading: enabled && data === undefined,
  };
};
