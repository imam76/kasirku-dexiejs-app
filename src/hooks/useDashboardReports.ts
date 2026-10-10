import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from '@/lib/dayjs';
import {
  getCashFlowReport,
  type CashFlowReportData,
  type CashFlowReportFilters,
} from '@/services/cashFlowReportService';
import {
  getDashboardOperationalMetrics,
  type DashboardOperationalMetrics,
} from '@/services/dashboardOperationalMetricsService';
import { getPosSalesReportData } from '@/services/posSalesReportService';
import type { PosSalesReportData } from '@/services/posSalesReportAggregator';

interface DashboardReportRange {
  startDate?: string;
  endDate?: string;
  enabled: boolean;
  refreshKey: number;
}

const toIsoDayRange = (startDate?: string, endDate?: string) => ({
  startDate: startDate ? dayjs.tz(startDate).startOf('day').toISOString() : undefined,
  endDate: endDate ? dayjs.tz(endDate).endOf('day').toISOString() : undefined,
});

const toCashFlowFilters = (startDate?: string, endDate?: string): CashFlowReportFilters => (
  toIsoDayRange(startDate, endDate)
);

export const useDashboardOperationalMetrics = ({
  startDate,
  endDate,
  enabled,
  refreshKey,
}: DashboardReportRange) => {
  const data = useLiveQuery(
    async (): Promise<DashboardOperationalMetrics | undefined> => {
      if (!enabled) return undefined;
      return getDashboardOperationalMetrics(startDate, endDate);
    },
    [enabled, startDate, endDate, refreshKey],
  );

  return {
    data,
    isLoading: enabled && data === undefined,
  };
};

export const useDashboardCashFlowReport = ({
  startDate,
  endDate,
  enabled,
  refreshKey,
}: DashboardReportRange) => {
  const data = useLiveQuery(
    async (): Promise<CashFlowReportData | undefined> => {
      if (!enabled) return undefined;
      return getCashFlowReport(toCashFlowFilters(startDate, endDate));
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
