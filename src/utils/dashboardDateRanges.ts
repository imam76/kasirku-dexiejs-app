import type { Dayjs } from 'dayjs';
import dayjs from '@/lib/dayjs';

export type DashboardPeriodPreset =
  | 'today'
  | 'this-week'
  | 'last-week'
  | 'this-month'
  | 'last-month'
  | 'custom';

export interface DashboardDateRange {
  startDate: string;
  endDate: string;
}

export const DASHBOARD_PERIOD_PRESETS: DashboardPeriodPreset[] = [
  'today',
  'this-week',
  'last-week',
  'this-month',
  'last-month',
  'custom',
];

const formatDateRange = (start: Dayjs, end: Dayjs): DashboardDateRange => ({
  startDate: start.format('YYYY-MM-DD'),
  endDate: end.format('YYYY-MM-DD'),
});

export const getDefaultDashboardDateRange = (
  now: Dayjs = dayjs.tz(),
): DashboardDateRange => formatDateRange(now.startOf('month'), now.endOf('day'));

export const getDashboardPeriodRange = (
  preset: DashboardPeriodPreset,
  customRange?: DashboardDateRange,
  now: Dayjs = dayjs.tz(),
): DashboardDateRange => {
  switch (preset) {
    case 'today':
      return formatDateRange(now.startOf('day'), now.endOf('day'));
    case 'this-week':
      return formatDateRange(now.startOf('week'), now.endOf('day'));
    case 'last-week': {
      const lastWeek = now.subtract(1, 'week');
      return formatDateRange(lastWeek.startOf('week'), lastWeek.endOf('week'));
    }
    case 'last-month': {
      const lastMonth = now.subtract(1, 'month');
      return formatDateRange(lastMonth.startOf('month'), lastMonth.endOf('month'));
    }
    case 'custom':
      return customRange ?? getDefaultDashboardDateRange(now);
    case 'this-month':
      return getDefaultDashboardDateRange(now);
  }
};

export const getDashboardPeriodLabelKey = (preset: DashboardPeriodPreset) => {
  switch (preset) {
    case 'today':
      return 'dashboard.period.today';
    case 'this-week':
      return 'dashboard.period.thisWeek';
    case 'last-week':
      return 'dashboard.period.lastWeek';
    case 'this-month':
      return 'dashboard.period.thisMonth';
    case 'last-month':
      return 'dashboard.period.lastMonth';
    case 'custom':
      return 'dashboard.period.custom';
  }
};

export const getDashboardRangeKey = ({ startDate, endDate }: DashboardDateRange) => (
  `${startDate}:${endDate}`
);
