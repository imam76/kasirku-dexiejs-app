import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from '@/lib/dayjs';
import { getDashboardCashOutTotal } from '@/services/cashFlowReportService';
import {
  getIncomeStatementReport,
  type IncomeStatementReport,
} from '@/services/generalLedgerService';
import { getPosSalesReportData } from '@/services/posSalesReportService';
import type { PosSalesReportData } from '@/services/posSalesReportAggregator';
import { getDashboardRangeKey, type DashboardDateRange } from '@/utils/dashboardDateRanges';

interface DashboardReportRange extends DashboardDateRange {
  enabled: boolean;
}

interface DashboardReportRequest<Id extends string> extends DashboardReportRange {
  id: Id;
}

interface DashboardReportBatchOptions<Id extends string> {
  requests: DashboardReportRequest<Id>[];
  refreshKey: number;
}

const toIsoDayRange = ({ startDate, endDate }: DashboardDateRange) => ({
  startDate: dayjs.tz(startDate).startOf('day').toISOString(),
  endDate: dayjs.tz(endDate).endOf('day').toISOString(),
});

const getRequestSignature = <Id extends string>(requests: DashboardReportRequest<Id>[]) => (
  requests
    .map(({ id, startDate, endDate, enabled }) => `${id}:${startDate}:${endDate}:${enabled ? 1 : 0}`)
    .sort()
    .join('|')
);

const groupEnabledRequestsByRange = <Id extends string>(requests: DashboardReportRequest<Id>[]) => {
  const groups = new Map<string, { range: DashboardDateRange; ids: Id[] }>();

  requests.forEach(({ id, startDate, endDate, enabled }) => {
    if (!enabled) return;
    const range = { startDate, endDate };
    const key = getDashboardRangeKey(range);
    const group = groups.get(key) ?? { range, ids: [] };
    group.ids.push(id);
    groups.set(key, group);
  });

  return [...groups.values()];
};

export const useDashboardProfitLossReports = <Id extends string>({
  requests,
  refreshKey,
}: DashboardReportBatchOptions<Id>) => {
  const requestSignature = getRequestSignature(requests);
  const activeRequestCount = requests.filter((request) => request.enabled).length;
  const data = useLiveQuery(
    async (): Promise<Partial<Record<Id, IncomeStatementReport>>> => {
      const groups = groupEnabledRequestsByRange(requests);
      const reports = await Promise.all(groups.map(({ range }) => (
        getIncomeStatementReport(toIsoDayRange(range))
      )));

      return groups.reduce<Partial<Record<Id, IncomeStatementReport>>>((result, group, index) => {
        group.ids.forEach((id) => {
          result[id] = reports[index];
        });
        return result;
      }, {});
    },
    [requestSignature, refreshKey],
  );

  return {
    data,
    isLoading: activeRequestCount > 0 && data === undefined,
  };
};

export const useDashboardCashOutTotal = ({
  startDate,
  endDate,
  enabled,
  refreshKey,
}: DashboardReportRange & { refreshKey: number }) => {
  const data = useLiveQuery(
    async (): Promise<number | undefined> => {
      if (!enabled) return undefined;
      return getDashboardCashOutTotal(toIsoDayRange({ startDate, endDate }));
    },
    [enabled, startDate, endDate, refreshKey],
  );

  return {
    data,
    isLoading: enabled && data === undefined,
  };
};

export const useDashboardPosSalesReports = <Id extends string>({
  requests,
  refreshKey,
  topProductsRequestId,
  topProductsLimit = 5,
}: DashboardReportBatchOptions<Id> & {
  topProductsRequestId: Id;
  topProductsLimit?: number;
}) => {
  const requestSignature = getRequestSignature(requests);
  const activeRequestCount = requests.filter((request) => request.enabled).length;
  const data = useLiveQuery(
    async (): Promise<Partial<Record<Id, PosSalesReportData>>> => {
      const groups = groupEnabledRequestsByRange(requests);
      const reports = await Promise.all(groups.map(({ range, ids }) => (
        getPosSalesReportData({
          ...range,
          includeLineItems: ids.includes(topProductsRequestId),
          includePaymentDetails: false,
          topProductsLimit,
        })
      )));

      return groups.reduce<Partial<Record<Id, PosSalesReportData>>>((result, group, index) => {
        group.ids.forEach((id) => {
          result[id] = reports[index];
        });
        return result;
      }, {});
    },
    [requestSignature, refreshKey, topProductsLimit, topProductsRequestId],
  );

  return {
    data,
    isLoading: activeRequestCount > 0 && data === undefined,
  };
};
