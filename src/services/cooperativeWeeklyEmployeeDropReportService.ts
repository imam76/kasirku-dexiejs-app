import type { Dayjs } from 'dayjs';
import dayjs from '@/lib/dayjs';
import {
  getCooperativeDailyDropReport,
  summarizeCooperativeDailyDropReportRows,
  type CooperativeDailyDropReportRow,
  type CooperativeDailyDropReportSummary,
} from '@/services/cooperativeDailyDropReportService';
import { getCurrentSessionUser, requireUserPermission } from '@/auth/authService';

export interface CooperativeWeeklyEmployeeDropReportFilters {
  monthDate?: string;
}

export interface CooperativeWeeklyEmployeeDropReportWeekRange {
  key: string;
  week_index: number;
  start_date_key: string;
  end_date_key: string;
}

export interface CooperativeWeeklyEmployeeDropReportGroup extends CooperativeWeeklyEmployeeDropReportWeekRange {
  officer_id?: string;
  officer_name?: string;
  officer_position?: string;
  rows: CooperativeDailyDropReportRow[];
  summary: CooperativeDailyDropReportSummary;
}

export interface CooperativeWeeklyEmployeeDropReportWeek extends CooperativeWeeklyEmployeeDropReportWeekRange {
  groups: CooperativeWeeklyEmployeeDropReportGroup[];
  rows: CooperativeDailyDropReportRow[];
  summary: CooperativeDailyDropReportSummary;
}

export interface CooperativeWeeklyEmployeeDropReport {
  month_key: string;
  start_date: string;
  end_date: string;
  rows: CooperativeDailyDropReportRow[];
  groups: CooperativeWeeklyEmployeeDropReportGroup[];
  weeks: CooperativeWeeklyEmployeeDropReportWeek[];
  summary: CooperativeDailyDropReportSummary;
}

const DATE_KEY_FORMAT = 'YYYY-MM-DD';

const getSelectedMonth = (monthDate?: string) => (
  monthDate ? dayjs(monthDate).tz() : dayjs().tz()
);

const getMonthRange = (monthDate?: string) => {
  const selectedMonth = getSelectedMonth(monthDate);

  return {
    monthKey: selectedMonth.format('YYYY-MM'),
    startDate: selectedMonth.startOf('month'),
    endDate: selectedMonth.endOf('month'),
  };
};

const getMondayStart = (value: Dayjs) => {
  const daysSinceMonday = (value.day() + 6) % 7;
  return value.subtract(daysSinceMonday, 'day').startOf('day');
};

const buildWeekRanges = (
  monthStart: Dayjs,
  monthEnd: Dayjs,
): CooperativeWeeklyEmployeeDropReportWeekRange[] => {
  const ranges: CooperativeWeeklyEmployeeDropReportWeekRange[] = [];
  let cursor = monthStart.startOf('day');
  let weekIndex = 1;

  while (!cursor.isAfter(monthEnd, 'day')) {
    const calendarWeekStart = getMondayStart(cursor);
    const calendarWeekEnd = calendarWeekStart.add(6, 'day').endOf('day');
    const weekStart = calendarWeekStart.isBefore(monthStart, 'day')
      ? monthStart.startOf('day')
      : calendarWeekStart;
    const weekEnd = calendarWeekEnd.isAfter(monthEnd, 'day')
      ? monthEnd.endOf('day')
      : calendarWeekEnd;
    const startDateKey = weekStart.format(DATE_KEY_FORMAT);

    ranges.push({
      key: startDateKey,
      week_index: weekIndex,
      start_date_key: startDateKey,
      end_date_key: weekEnd.format(DATE_KEY_FORMAT),
    });

    cursor = weekEnd.add(1, 'day').startOf('day');
    weekIndex += 1;
  }

  return ranges;
};

const findWeekRange = (
  dateKey: string,
  ranges: CooperativeWeeklyEmployeeDropReportWeekRange[],
) => ranges.find((range) => (
  dateKey >= range.start_date_key && dateKey <= range.end_date_key
));

export const getCooperativeWeeklyEmployeeDropReport = async (
  filters: CooperativeWeeklyEmployeeDropReportFilters = {},
): Promise<CooperativeWeeklyEmployeeDropReport> => {
  await requireUserPermission(await getCurrentSessionUser(), 'COOPERATIVE_WEEKLY_DROP_REPORT_VIEW');
  const { monthKey, startDate, endDate } = getMonthRange(filters.monthDate);
  const weekRanges = buildWeekRanges(startDate, endDate);
  const dailyReport = await getCooperativeDailyDropReport({
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });
  const rowsByGroupKey = new Map<string, CooperativeDailyDropReportRow[]>();

  dailyReport.rows.forEach((row) => {
    const weekRange = findWeekRange(row.date_key, weekRanges);
    if (!weekRange) return;

    const groupKey = `${weekRange.key}:${row.officer_id ?? 'UNASSIGNED'}`;
    const currentRows = rowsByGroupKey.get(groupKey) ?? [];
    currentRows.push(row);
    rowsByGroupKey.set(groupKey, currentRows);
  });

  const groups = Array.from(rowsByGroupKey.entries())
    .map(([key, groupRows]) => {
      const firstRow = groupRows[0];
      const weekRange = findWeekRange(firstRow.date_key, weekRanges) ?? weekRanges[0];

      return {
        ...weekRange,
        key,
        officer_id: firstRow.officer_id,
        officer_name: firstRow.officer_name,
        officer_position: firstRow.officer_position,
        rows: groupRows,
        summary: summarizeCooperativeDailyDropReportRows(groupRows),
      } satisfies CooperativeWeeklyEmployeeDropReportGroup;
    })
    .sort((left, right) => {
      const weekCompare = left.start_date_key.localeCompare(right.start_date_key);
      if (weekCompare !== 0) return weekCompare;
      return (left.officer_name ?? '').localeCompare(right.officer_name ?? '');
    });

  const groupsByWeekKey = new Map<string, CooperativeWeeklyEmployeeDropReportGroup[]>();

  groups.forEach((group) => {
    const currentGroups = groupsByWeekKey.get(group.start_date_key) ?? [];
    currentGroups.push(group);
    groupsByWeekKey.set(group.start_date_key, currentGroups);
  });

  const weeks = weekRanges
    .map((weekRange) => {
      const weekGroups = groupsByWeekKey.get(weekRange.start_date_key) ?? [];
      if (weekGroups.length === 0) return undefined;

      const weekRows = weekGroups.flatMap((group) => group.rows);

      return {
        ...weekRange,
        groups: weekGroups,
        rows: weekRows,
        summary: summarizeCooperativeDailyDropReportRows(weekRows),
      } satisfies CooperativeWeeklyEmployeeDropReportWeek;
    })
    .filter((week): week is CooperativeWeeklyEmployeeDropReportWeek => Boolean(week));

  return {
    month_key: monthKey,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    rows: dailyReport.rows,
    groups,
    weeks,
    summary: dailyReport.summary,
  };
};
