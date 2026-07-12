import dayjs from '@/lib/dayjs';
import type {
  CooperativeCollectionWeekday,
  CooperativeLoanBillingFrequency,
  EmployeeCollectionSchedule,
} from '@/types';

export const COOPERATIVE_COLLECTION_WEEKDAYS: CooperativeCollectionWeekday[] = [
  1, 2, 3, 4, 5, 6, 7,
];

export const getIsoWeekday = (value: string | dayjs.Dayjs): CooperativeCollectionWeekday => {
  const day = dayjs.isDayjs(value) ? value.day() : dayjs(value).tz().day();
  return (day === 0 ? 7 : day) as CooperativeCollectionWeekday;
};

export const getCollectionWeekdayLabel = (
  weekday: CooperativeCollectionWeekday,
) => dayjs('2024-01-01').add(weekday - 1, 'day').format('dddd');

const getDateKey = (value: string | dayjs.Dayjs) => (
  dayjs.isDayjs(value) ? value : dayjs(value).tz()
).format('YYYY-MM-DD');

export const isCollectionScheduleEffectiveOn = (
  schedule: Pick<EmployeeCollectionSchedule, 'is_active' | 'effective_from' | 'effective_until'>,
  value: string | dayjs.Dayjs,
) => {
  if (!schedule.is_active) return false;
  const dateKey = getDateKey(value);
  const effectiveFrom = schedule.effective_from
    ? getDateKey(schedule.effective_from)
    : undefined;
  const effectiveUntil = schedule.effective_until
    ? getDateKey(schedule.effective_until)
    : undefined;

  return (!effectiveFrom || dateKey >= effectiveFrom) &&
    (!effectiveUntil || dateKey <= effectiveUntil);
};

export const findMatchingCollectionSchedule = (
  schedules: EmployeeCollectionSchedule[],
  value: string | dayjs.Dayjs,
) => {
  const weekday = getIsoWeekday(value);
  return schedules.find((schedule) => (
    schedule.weekday === weekday &&
    isCollectionScheduleEffectiveOn(schedule, value)
  ));
};

export const findCollectionScheduleByWeekday = (
  schedules: EmployeeCollectionSchedule[],
  value: string | dayjs.Dayjs,
) => {
  const weekday = getIsoWeekday(value);
  return schedules.find((schedule) => schedule.weekday === weekday);
};

export const resolveCollectionScheduleForDisbursement = ({
  schedules,
  value,
  allowHistoricalFallback = false,
  today = dayjs().tz(),
}: {
  schedules: EmployeeCollectionSchedule[];
  value: string | dayjs.Dayjs;
  allowHistoricalFallback?: boolean;
  today?: dayjs.Dayjs;
}) => {
  const exactSchedule = findMatchingCollectionSchedule(schedules, value);
  if (exactSchedule) {
    return {
      schedule: exactSchedule,
      weekday: exactSchedule.weekday,
      is_historical_fallback: false,
    };
  }

  const selectedDate = dayjs.isDayjs(value) ? value : dayjs(value).tz();
  if (!allowHistoricalFallback || !selectedDate.isBefore(today, 'day')) {
    return undefined;
  }

  const sameWeekdaySchedule = findCollectionScheduleByWeekday(schedules, selectedDate);
  if (!sameWeekdaySchedule) return undefined;

  return {
    schedule: sameWeekdaySchedule,
    weekday: sameWeekdaySchedule.weekday,
    is_historical_fallback: true,
  };
};

export const getNextCollectionDate = (
  schedules: EmployeeCollectionSchedule[],
  from: dayjs.Dayjs,
  includeCurrent = true,
) => {
  const start = includeCurrent ? from.startOf('day') : from.add(1, 'day').startOf('day');

  for (let offset = 0; offset <= 366; offset += 1) {
    const candidate = start.add(offset, 'day');
    if (findMatchingCollectionSchedule(schedules, candidate)) return candidate;
  }

  return undefined;
};

export const getNextDateForWeekday = (
  from: dayjs.Dayjs,
  weekday: CooperativeCollectionWeekday,
  includeCurrent = true,
) => {
  const start = includeCurrent ? from.startOf('day') : from.add(1, 'day').startOf('day');

  for (let offset = 0; offset < 7; offset += 1) {
    const candidate = start.add(offset, 'day');
    if (getIsoWeekday(candidate) === weekday) return candidate;
  }

  return start;
};

export const getNextCollectionDateForWeekday = (
  schedules: EmployeeCollectionSchedule[],
  from: dayjs.Dayjs,
  weekday: CooperativeCollectionWeekday,
  includeCurrent = true,
) => {
  const start = includeCurrent ? from.startOf('day') : from.add(1, 'day').startOf('day');
  const matchingSchedules = schedules.filter((schedule) => schedule.weekday === weekday);

  for (let offset = 0; offset <= 366; offset += 1) {
    const candidate = start.add(offset, 'day');
    if (findMatchingCollectionSchedule(matchingSchedules, candidate)) return candidate;
  }

  return undefined;
};

const addBillingInterval = (
  value: dayjs.Dayjs,
  frequency: CooperativeLoanBillingFrequency,
  amount: number,
) => {
  if (frequency === 'WEEKLY') return value.add(amount, 'week');
  if (frequency === 'BIWEEKLY') return value.add(amount * 2, 'week');
  return value.add(amount, 'month');
};

const alignDateToWeekday = (
  value: dayjs.Dayjs,
  weekday: CooperativeCollectionWeekday,
) => {
  let candidate = value.startOf('day');
  for (let offset = 0; offset < 7; offset += 1) {
    if (getIsoWeekday(candidate) === weekday) return candidate;
    candidate = candidate.add(1, 'day');
  }
  return value.startOf('day');
};

export const getFirstScheduledDueDate = ({
  disbursementDate,
  frequency,
  weekday,
}: {
  disbursementDate: dayjs.Dayjs;
  frequency: CooperativeLoanBillingFrequency;
  weekday: CooperativeCollectionWeekday;
}) => alignDateToWeekday(
  addBillingInterval(disbursementDate, frequency, 1),
  weekday,
);

export const getScheduledInstallmentDate = ({
  firstDueDate,
  frequency,
  weekday,
  installmentOffset,
}: {
  firstDueDate: dayjs.Dayjs;
  frequency: CooperativeLoanBillingFrequency;
  weekday: CooperativeCollectionWeekday;
  installmentOffset: number;
}) => {
  if (installmentOffset <= 0) return alignDateToWeekday(firstDueDate, weekday);
  return alignDateToWeekday(
    addBillingInterval(firstDueDate, frequency, installmentOffset),
    weekday,
  );
};

export const getCollectionDatesInMonth = (
  month: dayjs.Dayjs,
  weekdays: CooperativeCollectionWeekday[],
) => {
  const weekdaySet = new Set(weekdays);
  const days: number[] = [];
  let cursor = month.startOf('month');
  const end = month.endOf('month');

  while (!cursor.isAfter(end, 'day')) {
    if (weekdaySet.has(getIsoWeekday(cursor))) days.push(cursor.date());
    cursor = cursor.add(1, 'day');
  }

  return days;
};
