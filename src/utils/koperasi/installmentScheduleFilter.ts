import dayjs from '@/lib/dayjs';
import type { CooperativeLoanInstallment } from '@/types';
import { getInstallmentRemainingAmounts } from './loanPaymentAllocation';

export type CooperativeInstallmentScheduleFilter = 'TODAY' | 'THIS_WEEK' | 'ALL_UNPAID';

const isUnpaidInstallment = (installment: CooperativeLoanInstallment) => (
  getInstallmentRemainingAmounts(installment).total_amount > 0.01
);

const getCalendarWeekRange = (referenceDate: dayjs.Dayjs) => {
  const today = referenceDate.tz().startOf('day');
  const daysSinceMonday = (today.day() + 6) % 7;
  const start = today.subtract(daysSinceMonday, 'day');

  return {
    start,
    end: start.add(6, 'day'),
  };
};

export const hasUnpaidInstallmentForSchedule = (
  installments: CooperativeLoanInstallment[],
  scheduleFilter: CooperativeInstallmentScheduleFilter,
  referenceDate = dayjs().tz(),
) => {
  const unpaidInstallments = installments.filter(isUnpaidInstallment);
  if (scheduleFilter === 'ALL_UNPAID') return unpaidInstallments.length > 0;

  const today = referenceDate.tz().startOf('day');
  if (scheduleFilter === 'TODAY') {
    return unpaidInstallments.some((installment) => (
      dayjs(installment.due_date).tz().isSame(today, 'day')
    ));
  }

  const week = getCalendarWeekRange(today);

  return unpaidInstallments.some((installment) => {
    const dueDate = dayjs(installment.due_date).tz().startOf('day');
    return !dueDate.isBefore(week.start, 'day') && !dueDate.isAfter(week.end, 'day');
  });
};
