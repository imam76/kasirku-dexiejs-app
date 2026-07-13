import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import type { Dayjs } from 'dayjs';
import { FINANCE_CATEGORIES } from '@/constants/finance';
import type {
  CooperativeCollectionWeekday,
  CooperativeFieldCashMovementKind,
  CooperativeLoan,
  CooperativeLoanInstallment,
  CooperativeMember,
  CooperativeSavingTransaction,
  Employee,
  EmployeeArea,
  EmployeeCollectionSchedule,
  FinanceTransaction,
} from '@/types';
import {
  getCollectionDatesInMonth,
  getIsoWeekday,
  isCollectionScheduleEffectiveOn,
} from '@/utils/koperasi/collectionSchedule';
import {
  getCooperativeLoanContractualInstallmentAmount,
  getCooperativeLoanPaidOffDateByLoanId,
  getLatestReportableLoanPaymentDateByLoanId,
  isReportableCooperativeLoanPayment,
} from '@/utils/koperasi/loanReport';
import { roundCurrency } from '@/utils/koperasi/loanSchedule';
import { getCurrentSessionUser, requireUserPermission } from '@/auth/authService';

export const COOPERATIVE_DAILY_TARGET_UNASSIGNED_EMPLOYEE = '__UNASSIGNED__';

export interface CooperativeDailyTargetReportFilters {
  monthDate?: string;
  employeeId?: string;
}

export interface CooperativeDailyTargetReportSummary {
  row_count: number;
  old_member_count: number;
  new_member_count: number;
  exit_member_count: number;
  ending_member_count: number;
  opening_target_amount: number;
  incoming_installment_amount: number;
  outgoing_installment_amount: number;
  ending_target_amount: number;
  storting_amount: number;
  achievement_percentage: number;
  drop_margin_amount: number;
  current_drop_amount: number;
  running_drop_amount: number;
  running_storting_amount: number;
  saving_withdrawal_amount: number;
  cash_amount: number;
}

export interface CooperativeDailyTargetReportRow {
  id: string;
  date_key: string;
  collection_weekday: CooperativeCollectionWeekday;
  employee_id?: string;
  employee_name?: string;
  employee_position?: string;
  old_member_count: number;
  new_member_count: number;
  exit_member_count: number;
  ending_member_count: number;
  opening_target_amount: number;
  incoming_installment_amount: number;
  outgoing_installment_amount: number;
  ending_target_amount: number;
  storting_amount: number;
  achievement_percentage: number;
  drop_margin_amount: number;
  previous_drop_amount: number;
  current_drop_amount: number;
  running_drop_amount: number;
  running_storting_amount: number;
  saving_withdrawal_amount: number;
  cash_amount: number;
}

export interface CooperativeDailyTargetReportWeek {
  key: string;
  week_index: number;
  start_date_key: string;
  end_date_key: string;
  rows: CooperativeDailyTargetReportRow[];
  summary: CooperativeDailyTargetReportSummary;
}

export interface CooperativeDailyTargetEmployeeOption {
  id: string;
  name: string;
  position?: string;
}

export interface CooperativeDailyTargetCollectionSchedule {
  weekday: CooperativeCollectionWeekday;
  area_names: string[];
}

export interface CooperativeDailyTargetReportGroup {
  key: string;
  employee_id?: string;
  employee_name?: string;
  employee_position?: string;
  area_names: string[];
  collection_weekdays: CooperativeCollectionWeekday[];
  collection_schedules: CooperativeDailyTargetCollectionSchedule[];
  rows: CooperativeDailyTargetReportRow[];
  weeks: CooperativeDailyTargetReportWeek[];
  summary: CooperativeDailyTargetReportSummary;
}

export interface CooperativeDailyTargetReport {
  month_key: string;
  start_date: string;
  end_date: string;
  employeeOptions: CooperativeDailyTargetEmployeeOption[];
  rows: CooperativeDailyTargetReportRow[];
  groups: CooperativeDailyTargetReportGroup[];
  summary: CooperativeDailyTargetReportSummary;
}

type EmployeeSnapshot = Pick<
  CooperativeDailyTargetReportRow,
  'employee_id' | 'employee_name' | 'employee_position'
>;

type WeekRange = Pick<
  CooperativeDailyTargetReportWeek,
  'key' | 'week_index' | 'start_date_key' | 'end_date_key'
>;

type LoanContext = {
  loan: CooperativeLoan;
  member?: CooperativeMember;
  employee: EmployeeSnapshot;
  employee_key: string;
  collection_weekday: CooperativeCollectionWeekday;
  disbursed_date_key: string;
  paid_off_date_key?: string;
  contractual_installment_amount: number;
};

const DATE_KEY_FORMAT = 'YYYY-MM-DD';
const DROP_MARGIN_RATE = 0.1;

const getDateKey = (value: string) => dayjs(value).tz().format(DATE_KEY_FORMAT);

const getMonthRange = (monthDate?: string) => {
  const selectedMonth = monthDate ? dayjs(monthDate).tz() : dayjs().tz();
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

const buildWeekRanges = (monthStart: Dayjs, monthEnd: Dayjs): WeekRange[] => {
  const ranges: WeekRange[] = [];
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

const getEmployeeKey = (employeeId?: string) => (
  employeeId ?? COOPERATIVE_DAILY_TARGET_UNASSIGNED_EMPLOYEE
);

const getTrackKey = (
  employeeId: string | undefined,
  weekday: CooperativeCollectionWeekday,
) => `${getEmployeeKey(employeeId)}:${weekday}`;

const getBucketKey = (
  dateKey: string,
  employeeId: string | undefined,
  weekday: CooperativeCollectionWeekday,
) => `${dateKey}:${getEmployeeKey(employeeId)}:${weekday}`;

const FIELD_CASH_CLOSE_BOOK_KIND: CooperativeFieldCashMovementKind = 'DEPOSIT_TO_FINANCE';

const isReportableLoan = (loan: CooperativeLoan) => (
  (loan.status === 'DISBURSED' || loan.status === 'PAID_OFF') &&
  Boolean(loan.disbursed_at)
);

const isPostedSavingWithdrawal = (transaction: CooperativeSavingTransaction) => (
  transaction.status === 'POSTED' &&
  transaction.transaction_type === 'WITHDRAWAL' &&
  !transaction.reversal_of_transaction_id &&
  !transaction.reversal_transaction_id
);

const isFieldCashCloseBookTransaction = (
  transaction: FinanceTransaction,
  voidedTransferGroupIds: Set<string>,
) => (
  !transaction.deleted_at &&
  !transaction.reversal_of_transfer_group_id &&
  (!transaction.transfer_group_id || !voidedTransferGroupIds.has(transaction.transfer_group_id)) &&
  transaction.type === 'EXPENSE' &&
  (
    transaction.field_cash_movement_kind === FIELD_CASH_CLOSE_BOOK_KIND ||
    (
      transaction.category === FINANCE_CATEGORIES.CASH_BANK_TRANSFER &&
      transaction.transfer_direction === 'OUT'
    )
  )
);

const matchesEmployeeFilter = (
  employeeId: string | undefined,
  filterEmployeeId?: string,
) => {
  if (!filterEmployeeId) return true;
  if (filterEmployeeId === COOPERATIVE_DAILY_TARGET_UNASSIGNED_EMPLOYEE) return !employeeId;
  return employeeId === filterEmployeeId;
};

const compareEmployeeLabel = (
  left?: Pick<CooperativeDailyTargetEmployeeOption, 'name' | 'position'>,
  right?: Pick<CooperativeDailyTargetEmployeeOption, 'name' | 'position'>,
) => {
  const leftLabel = left?.position ? `${left.name} ${left.position}` : left?.name ?? '';
  const rightLabel = right?.position ? `${right.name} ${right.position}` : right?.name ?? '';
  return leftLabel.localeCompare(rightLabel, undefined, { numeric: true });
};

const getLoanEmployee = (
  loan: CooperativeLoan,
  member: CooperativeMember | undefined,
  employeeById: Map<string, Employee>,
): EmployeeSnapshot => {
  const employeeId = loan.officer_id ?? member?.officer_id;
  const employee = employeeId ? employeeById.get(employeeId) : undefined;

  return {
    employee_id: employeeId,
    employee_name: employee?.name ?? loan.officer_name ?? member?.officer_name,
    employee_position: employee?.position ?? loan.officer_position ?? member?.officer_position,
  };
};

const getMemberEmployee = (
  member: CooperativeMember | undefined,
  employeeById: Map<string, Employee>,
): EmployeeSnapshot => {
  const employee = member?.officer_id ? employeeById.get(member.officer_id) : undefined;
  return {
    employee_id: member?.officer_id,
    employee_name: employee?.name ?? member?.officer_name,
    employee_position: employee?.position ?? member?.officer_position,
  };
};

const findScheduleWeekday = ({
  employeeId,
  areaId,
  value,
  schedules,
}: {
  employeeId?: string;
  areaId?: string;
  value: string;
  schedules: EmployeeCollectionSchedule[];
}) => {
  if (!employeeId) return undefined;
  const matchingSchedules = schedules
    .filter((schedule) => schedule.employee_id === employeeId)
    .filter((schedule) => !areaId || schedule.area_id === areaId)
    .filter((schedule) => isCollectionScheduleEffectiveOn(schedule, value))
    .sort((left, right) => left.weekday - right.weekday);
  const exactDay = matchingSchedules.find((schedule) => schedule.weekday === getIsoWeekday(value));
  return exactDay?.weekday ?? matchingSchedules[0]?.weekday;
};

const getLoanCollectionWeekday = (
  loan: CooperativeLoan,
  member: CooperativeMember | undefined,
  employee: EmployeeSnapshot,
  schedules: EmployeeCollectionSchedule[],
) => {
  if (loan.collection_weekday) return loan.collection_weekday;
  const disbursedAt = loan.disbursed_at as string;
  return findScheduleWeekday({
    employeeId: employee.employee_id,
    areaId: loan.area_id ?? member?.area_id,
    value: disbursedAt,
    schedules,
  }) ?? getIsoWeekday(disbursedAt);
};

const getSavingCollectionWeekday = (
  transaction: CooperativeSavingTransaction,
  member: CooperativeMember | undefined,
  employee: EmployeeSnapshot,
  schedules: EmployeeCollectionSchedule[],
) => findScheduleWeekday({
  employeeId: employee.employee_id,
  areaId: member?.area_id,
  value: transaction.transaction_date,
  schedules,
}) ?? getIsoWeekday(transaction.transaction_date);

const createEmptySummary = (): CooperativeDailyTargetReportSummary => ({
  row_count: 0,
  old_member_count: 0,
  new_member_count: 0,
  exit_member_count: 0,
  ending_member_count: 0,
  opening_target_amount: 0,
  incoming_installment_amount: 0,
  outgoing_installment_amount: 0,
  ending_target_amount: 0,
  storting_amount: 0,
  achievement_percentage: 0,
  drop_margin_amount: 0,
  current_drop_amount: 0,
  running_drop_amount: 0,
  running_storting_amount: 0,
  saving_withdrawal_amount: 0,
  cash_amount: 0,
});

export const summarizeCooperativeDailyTargetRows = (
  rows: CooperativeDailyTargetReportRow[],
): CooperativeDailyTargetReportSummary => {
  const summary = rows.reduce((current, row) => ({
    ...current,
    row_count: current.row_count + 1,
    old_member_count: current.old_member_count + row.old_member_count,
    new_member_count: current.new_member_count + row.new_member_count,
    exit_member_count: current.exit_member_count + row.exit_member_count,
    ending_member_count: current.ending_member_count + row.ending_member_count,
    opening_target_amount: roundCurrency(current.opening_target_amount + row.opening_target_amount),
    incoming_installment_amount: roundCurrency(
      current.incoming_installment_amount + row.incoming_installment_amount,
    ),
    outgoing_installment_amount: roundCurrency(
      current.outgoing_installment_amount + row.outgoing_installment_amount,
    ),
    ending_target_amount: roundCurrency(current.ending_target_amount + row.ending_target_amount),
    storting_amount: roundCurrency(current.storting_amount + row.storting_amount),
    drop_margin_amount: roundCurrency(current.drop_margin_amount + row.drop_margin_amount),
    current_drop_amount: roundCurrency(current.current_drop_amount + row.current_drop_amount),
    saving_withdrawal_amount: roundCurrency(
      current.saving_withdrawal_amount + row.saving_withdrawal_amount,
    ),
    cash_amount: roundCurrency(current.cash_amount + row.cash_amount),
  }), createEmptySummary());
  const lastRow = rows[rows.length - 1];

  summary.achievement_percentage = summary.opening_target_amount > 0
    ? (summary.storting_amount / summary.opening_target_amount) * 100
    : 0;
  summary.running_drop_amount = lastRow?.running_drop_amount ?? 0;
  summary.running_storting_amount = lastRow?.running_storting_amount ?? 0;

  return summary;
};

const summarizeGroups = (
  groups: CooperativeDailyTargetReportGroup[],
): CooperativeDailyTargetReportSummary => {
  const summary = groups.reduce((current, group) => ({
    ...current,
    row_count: current.row_count + group.summary.row_count,
    old_member_count: current.old_member_count + group.summary.old_member_count,
    new_member_count: current.new_member_count + group.summary.new_member_count,
    exit_member_count: current.exit_member_count + group.summary.exit_member_count,
    ending_member_count: current.ending_member_count + group.summary.ending_member_count,
    opening_target_amount: roundCurrency(
      current.opening_target_amount + group.summary.opening_target_amount,
    ),
    incoming_installment_amount: roundCurrency(
      current.incoming_installment_amount + group.summary.incoming_installment_amount,
    ),
    outgoing_installment_amount: roundCurrency(
      current.outgoing_installment_amount + group.summary.outgoing_installment_amount,
    ),
    ending_target_amount: roundCurrency(
      current.ending_target_amount + group.summary.ending_target_amount,
    ),
    storting_amount: roundCurrency(current.storting_amount + group.summary.storting_amount),
    drop_margin_amount: roundCurrency(
      current.drop_margin_amount + group.summary.drop_margin_amount,
    ),
    current_drop_amount: roundCurrency(
      current.current_drop_amount + group.summary.current_drop_amount,
    ),
    running_drop_amount: roundCurrency(
      current.running_drop_amount + group.summary.running_drop_amount,
    ),
    running_storting_amount: roundCurrency(
      current.running_storting_amount + group.summary.running_storting_amount,
    ),
    saving_withdrawal_amount: roundCurrency(
      current.saving_withdrawal_amount + group.summary.saving_withdrawal_amount,
    ),
    cash_amount: roundCurrency(current.cash_amount + group.summary.cash_amount),
  }), createEmptySummary());

  summary.achievement_percentage = summary.opening_target_amount > 0
    ? (summary.storting_amount / summary.opening_target_amount) * 100
    : 0;

  return summary;
};

const buildWeeks = (
  rows: CooperativeDailyTargetReportRow[],
  weekRanges: WeekRange[],
) => weekRanges
  .map((weekRange) => {
    const weekRows = rows.filter((row) => (
      row.date_key >= weekRange.start_date_key &&
      row.date_key <= weekRange.end_date_key
    ));
    if (weekRows.length === 0) return undefined;

    return {
      ...weekRange,
      rows: weekRows,
      summary: summarizeCooperativeDailyTargetRows(weekRows),
    } satisfies CooperativeDailyTargetReportWeek;
  })
  .filter((week): week is CooperativeDailyTargetReportWeek => Boolean(week));

const buildEmployeeOptions = (
  employees: Employee[],
  members: CooperativeMember[],
  loans: CooperativeLoan[],
) => {
  const optionById = new Map<string, CooperativeDailyTargetEmployeeOption>();

  employees.forEach((employee) => {
    if (!employee.is_active) return;
    optionById.set(employee.id, {
      id: employee.id,
      name: employee.name,
      position: employee.position,
    });
  });

  members.forEach((member) => {
    if (!member.officer_id || optionById.has(member.officer_id) || !member.officer_name) return;
    optionById.set(member.officer_id, {
      id: member.officer_id,
      name: member.officer_name,
      position: member.officer_position,
    });
  });

  loans.forEach((loan) => {
    if (!loan.officer_id || optionById.has(loan.officer_id) || !loan.officer_name) return;
    optionById.set(loan.officer_id, {
      id: loan.officer_id,
      name: loan.officer_name,
      position: loan.officer_position,
    });
  });

  return Array.from(optionById.values()).sort(compareEmployeeLabel);
};

const addAmount = (amountByKey: Map<string, number>, key: string, amount: number) => {
  amountByKey.set(key, roundCurrency((amountByKey.get(key) ?? 0) + Number(amount || 0)));
};

const isLoanActiveBeforeDate = (loan: LoanContext, dateKey: string) => (
  loan.disbursed_date_key < dateKey &&
  (!loan.paid_off_date_key || loan.paid_off_date_key >= dateKey)
);

const isLoanActiveAfterDate = (loan: LoanContext, dateKey: string) => (
  loan.disbursed_date_key <= dateKey &&
  (!loan.paid_off_date_key || loan.paid_off_date_key > dateKey)
);

const isLoanActiveInMonth = (
  loan: LoanContext,
  startDateKey: string,
  endDateKey: string,
) => (
  loan.disbursed_date_key <= endDateKey &&
  (!loan.paid_off_date_key || loan.paid_off_date_key >= startDateKey)
);

const buildAreaNamesByEmployeeId = (
  employeeAreas: EmployeeArea[],
  members: CooperativeMember[],
  loans: CooperativeLoan[],
) => {
  const areaNamesByEmployeeId = new Map<string, Set<string>>();
  const addArea = (employeeId?: string, areaCode?: string, areaName?: string) => {
    if (!employeeId || !areaName) return;
    const names = areaNamesByEmployeeId.get(employeeId) ?? new Set<string>();
    names.add(areaCode ? `${areaCode} - ${areaName}` : areaName);
    areaNamesByEmployeeId.set(employeeId, names);
  };

  employeeAreas.forEach((item) => addArea(item.employee_id, item.area_code, item.area_name));
  members.forEach((member) => addArea(member.officer_id, member.area_code, member.area_name));
  loans.forEach((loan) => addArea(loan.officer_id, loan.area_code, loan.area_name));

  return new Map(Array.from(areaNamesByEmployeeId.entries()).map(([employeeId, names]) => [
    employeeId,
    Array.from(names).sort((left, right) => left.localeCompare(right, undefined, { numeric: true })),
  ]));
};

const buildCollectionSchedulesByEmployeeId = (
  schedules: EmployeeCollectionSchedule[],
  rows: CooperativeDailyTargetReportRow[],
) => {
  const weekdaysByEmployeeKey = new Map<string, Set<CooperativeCollectionWeekday>>();
  rows.forEach((row) => {
    const employeeKey = getEmployeeKey(row.employee_id);
    const weekdays = weekdaysByEmployeeKey.get(employeeKey) ?? new Set<CooperativeCollectionWeekday>();
    weekdays.add(row.collection_weekday);
    weekdaysByEmployeeKey.set(employeeKey, weekdays);
  });

  const result = new Map<string, CooperativeDailyTargetCollectionSchedule[]>();
  weekdaysByEmployeeKey.forEach((weekdays, employeeKey) => {
    const employeeId = employeeKey === COOPERATIVE_DAILY_TARGET_UNASSIGNED_EMPLOYEE
      ? undefined
      : employeeKey;
    const employeeSchedules = employeeId
      ? schedules.filter((schedule) => schedule.employee_id === employeeId && schedule.is_active)
      : [];
    const scheduleRows = Array.from(weekdays)
      .sort((left, right) => left - right)
      .map((weekday) => {
        const areaNames = Array.from(new Set(
          employeeSchedules
            .filter((schedule) => schedule.weekday === weekday)
            .map((schedule) => (
              schedule.area_code
                ? `${schedule.area_code} - ${schedule.area_name}`
                : schedule.area_name
            )),
        )).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

        return { weekday, area_names: areaNames };
      });
    result.set(employeeKey, scheduleRows);
  });

  return result;
};

const buildCloseBookDateKeysByEmployeeKey = (
  transactions: FinanceTransaction[],
  employeeByFieldCashAccountId: Map<string, Employee>,
  filters: CooperativeDailyTargetReportFilters,
  startDateKey: string,
  endDateKey: string,
) => {
  const voidedTransferGroupIds = new Set(
    transactions
      .map((transaction) => transaction.reversal_of_transfer_group_id)
      .filter((groupId): groupId is string => Boolean(groupId)),
  );
  const closeDateKeysByEmployeeKey = new Map<string, Set<string>>();

  transactions
    .filter((transaction) => isFieldCashCloseBookTransaction(transaction, voidedTransferGroupIds))
    .forEach((transaction) => {
      const dateKey = getDateKey(transaction.created_at);
      if (dateKey < startDateKey || dateKey > endDateKey) return;

      const employeeId = transaction.field_employee_id
        ?? employeeByFieldCashAccountId.get(transaction.cash_account_id ?? '')?.id;
      if (!matchesEmployeeFilter(employeeId, filters.employeeId)) return;

      const employeeKey = getEmployeeKey(employeeId);
      const dateKeys = closeDateKeysByEmployeeKey.get(employeeKey) ?? new Set<string>();
      dateKeys.add(dateKey);
      closeDateKeysByEmployeeKey.set(employeeKey, dateKeys);
    });

  return new Map(
    Array.from(closeDateKeysByEmployeeKey.entries()).map(([employeeKey, dateKeys]) => [
      employeeKey,
      Array.from(dateKeys).sort(),
    ]),
  );
};

export const getCooperativeDailyTargetReport = async (
  filters: CooperativeDailyTargetReportFilters = {},
): Promise<CooperativeDailyTargetReport> => {
  await requireUserPermission(await getCurrentSessionUser(), 'COOPERATIVE_DAILY_TARGET_REPORT_VIEW');
  const { monthKey, startDate, endDate } = getMonthRange(filters.monthDate);
  const startDateKey = startDate.format(DATE_KEY_FORMAT);
  const endDateKey = endDate.format(DATE_KEY_FORMAT);
  const weekRanges = buildWeekRanges(startDate, endDate);
  const [
    loans,
    installments,
    payments,
    savingTransactions,
    members,
    employees,
    employeeAreas,
    collectionSchedules,
    financeTransactions,
  ] = await Promise.all([
    db.cooperativeLoans.orderBy('loan_number').toArray(),
    db.cooperativeLoanInstallments.orderBy('loan_id').toArray(),
    db.cooperativeLoanPayments.orderBy('payment_date').toArray(),
    db.cooperativeSavingTransactions.orderBy('transaction_date').toArray(),
    db.cooperativeMembers.orderBy('member_number').toArray(),
    db.employees.orderBy('name').toArray(),
    db.employeeAreas.orderBy('employee_id').toArray(),
    db.employeeCollectionSchedules.orderBy('employee_id').toArray(),
    db.financeTransactions
      .where('category')
      .equals(FINANCE_CATEGORIES.CASH_BANK_TRANSFER)
      .filter((transaction) => !transaction.deleted_at)
      .toArray(),
  ]);
  const memberById = new Map(members.map((member) => [member.id, member]));
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const installmentsByLoanId = new Map<string, CooperativeLoanInstallment[]>();
  installments.forEach((installment) => {
    const current = installmentsByLoanId.get(installment.loan_id) ?? [];
    current.push(installment);
    installmentsByLoanId.set(installment.loan_id, current);
  });
  const employeeByFieldCashAccountId = new Map(
    employees
      .filter((employee) => employee.field_cash_account_id)
      .map((employee) => [employee.field_cash_account_id as string, employee]),
  );
  const closeBookDateKeysByEmployeeKey = buildCloseBookDateKeysByEmployeeKey(
    financeTransactions,
    employeeByFieldCashAccountId,
    filters,
    startDateKey,
    endDateKey,
  );
  const paidOffDateByLoanId = getCooperativeLoanPaidOffDateByLoanId(
    loans,
    payments,
    installments,
  );
  const latestPaymentDateByLoanId = getLatestReportableLoanPaymentDateByLoanId(payments);
  const reportableLoans = loans.filter(isReportableLoan);
  const loanContexts = reportableLoans.map((loan): LoanContext => {
    const member = memberById.get(loan.member_id);
    const employee = getLoanEmployee(loan, member, employeeById);
    return {
      loan,
      member,
      employee,
      employee_key: getEmployeeKey(employee.employee_id),
      collection_weekday: getLoanCollectionWeekday(
        loan,
        member,
        employee,
        collectionSchedules,
      ),
      disbursed_date_key: getDateKey(loan.disbursed_at as string),
      paid_off_date_key: loan.is_migration
        ? latestPaymentDateByLoanId.get(loan.id)
        : paidOffDateByLoanId.get(loan.id),
      contractual_installment_amount: getCooperativeLoanContractualInstallmentAmount(
        loan,
        installmentsByLoanId.get(loan.id) ?? [],
      ),
    };
  });
  const loanContextById = new Map(loanContexts.map((context) => [context.loan.id, context]));
  const allLoanContextsByMemberId = new Map<string, LoanContext[]>();
  loanContexts.forEach((context) => {
    const current = allLoanContextsByMemberId.get(context.loan.member_id) ?? [];
    current.push(context);
    allLoanContextsByMemberId.set(context.loan.member_id, current);
  });
  allLoanContextsByMemberId.forEach((contexts) => contexts.sort((left, right) => (
    left.disbursed_date_key.localeCompare(right.disbursed_date_key) ||
    left.loan.loan_number.localeCompare(right.loan.loan_number)
  )));

  const employeeByKey = new Map<string, EmployeeSnapshot>();
  loanContexts.forEach((context) => employeeByKey.set(context.employee_key, context.employee));

  const rowDatesByTrackKey = new Map<string, Set<string>>();
  const loansByTrackKey = new Map<string, LoanContext[]>();
  const registerTrackDate = (
    employee: EmployeeSnapshot,
    weekday: CooperativeCollectionWeekday,
    dateKey: string,
  ) => {
    if (dateKey < startDateKey || dateKey > endDateKey) return;
    if (!matchesEmployeeFilter(employee.employee_id, filters.employeeId)) return;
    const trackKey = getTrackKey(employee.employee_id, weekday);
    const dates = rowDatesByTrackKey.get(trackKey) ?? new Set<string>();
    dates.add(dateKey);
    rowDatesByTrackKey.set(trackKey, dates);
    employeeByKey.set(getEmployeeKey(employee.employee_id), employee);
  };

  loanContexts
    .filter((context) => matchesEmployeeFilter(context.employee.employee_id, filters.employeeId))
    .forEach((context) => {
      const trackKey = getTrackKey(context.employee.employee_id, context.collection_weekday);
      const trackLoans = loansByTrackKey.get(trackKey) ?? [];
      trackLoans.push(context);
      loansByTrackKey.set(trackKey, trackLoans);

      if (isLoanActiveInMonth(context, startDateKey, endDateKey)) {
        getCollectionDatesInMonth(startDate, [context.collection_weekday])
          .forEach((dayOfMonth) => registerTrackDate(
            context.employee,
            context.collection_weekday,
            startDate.date(dayOfMonth).format(DATE_KEY_FORMAT),
          ));
      }
      if (!context.loan.is_migration) {
        registerTrackDate(
          context.employee,
          context.collection_weekday,
          context.disbursed_date_key,
        );
      }
      if (context.paid_off_date_key) {
        registerTrackDate(
          context.employee,
          context.collection_weekday,
          context.paid_off_date_key,
        );
      }
    });

  const stortingByBucketKey = new Map<string, number>();
  const dropByBucketKey = new Map<string, number>();
  const savingWithdrawalByBucketKey = new Map<string, number>();

  payments
    .filter(isReportableCooperativeLoanPayment)
    .forEach((payment) => {
      const dateKey = getDateKey(payment.payment_date);
      if (dateKey < startDateKey || dateKey > endDateKey) return;
      const context = loanContextById.get(payment.loan_id);
      const member = memberById.get(payment.member_id);
      const fallbackEmployee = getMemberEmployee(member, employeeById);
      const collector = payment.collector_id ? employeeById.get(payment.collector_id) : undefined;
      const portfolioEmployee = context?.employee ?? fallbackEmployee;
      const employee = portfolioEmployee.employee_id || portfolioEmployee.employee_name
        ? portfolioEmployee
        : {
            employee_id: payment.collector_id,
            employee_name: collector?.name ?? payment.collector_name,
            employee_position: collector?.position ?? payment.collector_position,
          };
      const weekday = context?.collection_weekday ?? getIsoWeekday(payment.payment_date);
      if (!matchesEmployeeFilter(employee.employee_id, filters.employeeId)) return;
      registerTrackDate(employee, weekday, dateKey);
      addAmount(
        stortingByBucketKey,
        getBucketKey(dateKey, employee.employee_id, weekday),
        payment.amount,
      );
    });

  loanContexts.forEach((context) => {
    if (!matchesEmployeeFilter(context.employee.employee_id, filters.employeeId)) return;
    if (context.loan.is_migration) return;
    if (context.disbursed_date_key >= startDateKey && context.disbursed_date_key <= endDateKey) {
      addAmount(
        dropByBucketKey,
        getBucketKey(
          context.disbursed_date_key,
          context.employee.employee_id,
          context.collection_weekday,
        ),
        context.loan.principal_amount,
      );
    }
  });

  savingTransactions
    .filter(isPostedSavingWithdrawal)
    .forEach((transaction) => {
      const dateKey = getDateKey(transaction.transaction_date);
      if (dateKey < startDateKey || dateKey > endDateKey) return;
      const member = memberById.get(transaction.member_id);
      let employee = getMemberEmployee(member, employeeById);
      if (!employee.employee_id && transaction.cash_account_id) {
        const cashEmployee = employeeByFieldCashAccountId.get(transaction.cash_account_id);
        employee = {
          employee_id: cashEmployee?.id,
          employee_name: cashEmployee?.name,
          employee_position: cashEmployee?.position,
        };
      }
      if (!matchesEmployeeFilter(employee.employee_id, filters.employeeId)) return;
      const weekday = getSavingCollectionWeekday(
        transaction,
        member,
        employee,
        collectionSchedules,
      );
      registerTrackDate(employee, weekday, dateKey);
      addAmount(
        savingWithdrawalByBucketKey,
        getBucketKey(dateKey, employee.employee_id, weekday),
        transaction.amount,
      );
    });

  const rows: CooperativeDailyTargetReportRow[] = [];
  rowDatesByTrackKey.forEach((dateKeys, trackKey) => {
    const [employeeKey, weekdayText] = trackKey.split(':');
    const weekday = Number(weekdayText) as CooperativeCollectionWeekday;
    const employee = employeeByKey.get(employeeKey) ?? {};
    const trackLoans = loansByTrackKey.get(trackKey) ?? [];
    let previousEndingTarget: number | undefined;

    Array.from(dateKeys).sort().forEach((dateKey) => {
      const activeBefore = trackLoans.filter((context) => isLoanActiveBeforeDate(context, dateKey));
      const activeAfter = trackLoans.filter((context) => isLoanActiveAfterDate(context, dateKey));
      const activeBeforeMemberIds = new Set(activeBefore.map((context) => context.loan.member_id));
      const activeAfterMemberIds = new Set(activeAfter.map((context) => context.loan.member_id));
      const incomingLoans = trackLoans.filter((context) => (
        context.disbursed_date_key === dateKey &&
        !context.loan.is_migration
      ));
      const outgoingLoans = trackLoans.filter((context) => context.paid_off_date_key === dateKey);
      const incomingMemberIds = new Set(incomingLoans.map((context) => context.loan.member_id));
      const newMemberIds = new Set<string>();
      const returningOldMemberIds = new Set<string>();

      incomingMemberIds.forEach((memberId) => {
        const memberLoans = allLoanContextsByMemberId.get(memberId) ?? [];
        const hasEarlierLoan = memberLoans.some((context) => context.disbursed_date_key < dateKey);
        if (!hasEarlierLoan) {
          newMemberIds.add(memberId);
        } else if (!activeBeforeMemberIds.has(memberId)) {
          returningOldMemberIds.add(memberId);
        }
      });

      const exitMemberIds = new Set(
        outgoingLoans
          .map((context) => context.loan.member_id)
          .filter((memberId) => !activeAfterMemberIds.has(memberId)),
      );
      const oldMemberCount = activeBeforeMemberIds.size + returningOldMemberIds.size;
      const newMemberCount = newMemberIds.size;
      const exitMemberCount = exitMemberIds.size;
      const openingTargetAmount = previousEndingTarget ?? roundCurrency(
        activeBefore.reduce(
          (sum, context) => sum + context.contractual_installment_amount,
          0,
        ),
      );
      const incomingInstallmentAmount = roundCurrency(
        incomingLoans.reduce(
          (sum, context) => sum + context.contractual_installment_amount,
          0,
        ),
      );
      const outgoingInstallmentAmount = roundCurrency(
        outgoingLoans.reduce(
          (sum, context) => sum + context.contractual_installment_amount,
          0,
        ),
      );
      const endingTargetAmount = roundCurrency(Math.max(
        0,
        openingTargetAmount + incomingInstallmentAmount - outgoingInstallmentAmount,
      ));
      const bucketKey = getBucketKey(dateKey, employee.employee_id, weekday);
      const stortingAmount = roundCurrency(stortingByBucketKey.get(bucketKey) ?? 0);
      const currentDropAmount = roundCurrency(dropByBucketKey.get(bucketKey) ?? 0);
      const dropMarginAmount = roundCurrency(currentDropAmount * DROP_MARGIN_RATE);
      const savingWithdrawalAmount = roundCurrency(
        savingWithdrawalByBucketKey.get(bucketKey) ?? 0,
      );

      const row: CooperativeDailyTargetReportRow = {
        id: bucketKey,
        date_key: dateKey,
        collection_weekday: weekday,
        ...employee,
        old_member_count: oldMemberCount,
        new_member_count: newMemberCount,
        exit_member_count: exitMemberCount,
        ending_member_count: Math.max(0, oldMemberCount + newMemberCount - exitMemberCount),
        opening_target_amount: openingTargetAmount,
        incoming_installment_amount: incomingInstallmentAmount,
        outgoing_installment_amount: outgoingInstallmentAmount,
        ending_target_amount: endingTargetAmount,
        storting_amount: stortingAmount,
        achievement_percentage: openingTargetAmount > 0
          ? (stortingAmount / openingTargetAmount) * 100
          : 0,
        drop_margin_amount: dropMarginAmount,
        previous_drop_amount: 0,
        current_drop_amount: currentDropAmount,
        running_drop_amount: 0,
        running_storting_amount: 0,
        saving_withdrawal_amount: savingWithdrawalAmount,
        cash_amount: roundCurrency(
          stortingAmount + dropMarginAmount - currentDropAmount - savingWithdrawalAmount,
        ),
      };
      const hasTargetOrActivity = (
        row.opening_target_amount !== 0 ||
        row.ending_target_amount !== 0 ||
        row.incoming_installment_amount !== 0 ||
        row.outgoing_installment_amount !== 0 ||
        row.storting_amount !== 0 ||
        row.current_drop_amount !== 0 ||
        row.saving_withdrawal_amount !== 0 ||
        row.old_member_count !== 0 ||
        row.new_member_count !== 0 ||
        row.exit_member_count !== 0
      );
      if (hasTargetOrActivity) rows.push(row);
      previousEndingTarget = endingTargetAmount;
    });
  });

  rows.sort((left, right) => (
    getEmployeeKey(left.employee_id).localeCompare(getEmployeeKey(right.employee_id)) ||
    left.date_key.localeCompare(right.date_key) ||
    left.collection_weekday - right.collection_weekday
  ));

  const rowsByEmployeeKey = new Map<string, CooperativeDailyTargetReportRow[]>();
  rows.forEach((row) => {
    const employeeKey = getEmployeeKey(row.employee_id);
    const employeeRows = rowsByEmployeeKey.get(employeeKey) ?? [];
    employeeRows.push(row);
    rowsByEmployeeKey.set(employeeKey, employeeRows);
  });

  rowsByEmployeeKey.forEach((employeeRows) => {
    const employeeKey = getEmployeeKey(employeeRows[0]?.employee_id);
    const closeBookDateKeys = closeBookDateKeysByEmployeeKey.get(employeeKey) ?? [];
    let closeBookDateIndex = 0;
    let runningDrop = 0;
    let runningStorting = 0;

    employeeRows.forEach((row) => {
      while (
        closeBookDateIndex < closeBookDateKeys.length &&
        closeBookDateKeys[closeBookDateIndex] < row.date_key
      ) {
        runningDrop = 0;
        runningStorting = 0;
        closeBookDateIndex += 1;
      }

      row.previous_drop_amount = runningDrop;
      runningDrop = roundCurrency(runningDrop + row.current_drop_amount);
      runningStorting = roundCurrency(runningStorting + row.storting_amount);
      row.running_drop_amount = runningDrop;
      row.running_storting_amount = runningStorting;
    });
  });

  const areaNamesByEmployeeId = buildAreaNamesByEmployeeId(employeeAreas, members, loans);
  const schedulesByEmployeeKey = buildCollectionSchedulesByEmployeeId(collectionSchedules, rows);
  const groups = Array.from(rowsByEmployeeKey.entries())
    .map(([key, groupRows]) => {
      const firstRow = groupRows[0];
      const collectionSchedulesForGroup = schedulesByEmployeeKey.get(key) ?? [];
      return {
        key,
        employee_id: firstRow.employee_id,
        employee_name: firstRow.employee_name,
        employee_position: firstRow.employee_position,
        area_names: firstRow.employee_id
          ? areaNamesByEmployeeId.get(firstRow.employee_id) ?? []
          : [],
        collection_weekdays: collectionSchedulesForGroup.map((schedule) => schedule.weekday),
        collection_schedules: collectionSchedulesForGroup,
        rows: groupRows,
        weeks: buildWeeks(groupRows, weekRanges),
        summary: summarizeCooperativeDailyTargetRows(groupRows),
      } satisfies CooperativeDailyTargetReportGroup;
    })
    .sort((left, right) => {
      if (!left.employee_id && right.employee_id) return 1;
      if (left.employee_id && !right.employee_id) return -1;
      return compareEmployeeLabel(
        left.employee_name
          ? { name: left.employee_name, position: left.employee_position }
          : undefined,
        right.employee_name
          ? { name: right.employee_name, position: right.employee_position }
          : undefined,
      );
    });
  const orderedRows = groups.flatMap((group) => group.rows);

  return {
    month_key: monthKey,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    employeeOptions: buildEmployeeOptions(employees, members, loans),
    rows: orderedRows,
    groups,
    summary: summarizeGroups(groups),
  };
};
