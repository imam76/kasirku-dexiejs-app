import { db } from '@/lib/db';
import { FINANCE_CATEGORIES } from '@/constants/finance';
import dayjs from '@/lib/dayjs';
import type { Dayjs } from 'dayjs';
import type {
  CooperativeLoan,
  CooperativeLoanPayment,
  CooperativeMember,
  CooperativeSavingTransaction,
  Employee,
  EmployeeArea,
} from '@/types';
import { roundCurrency } from '@/utils/koperasi/loanSchedule';
import { getCurrentSessionUser, requireUserPermission } from '@/auth/authService';

export const COOPERATIVE_DAILY_STORTING_UNASSIGNED_EMPLOYEE = '__UNASSIGNED__';

export interface CooperativeDailyStortingReportFilters {
  monthDate?: string;
  employeeId?: string;
}

export interface CooperativeDailyStortingReportSummary {
  row_count: number;
  storting_amount: number;
  drop_margin_amount: number;
  drop_amount: number;
  saving_withdrawal_amount: number;
  iptw_amount: number;
  cash_amount: number;
}

export interface CooperativeDailyStortingReportRow {
  id: string;
  date_key: string;
  employee_id?: string;
  employee_name?: string;
  employee_position?: string;
  storting_amount: number;
  drop_margin_amount: number;
  drop_amount: number;
  saving_withdrawal_amount: number;
  iptw_amount: number;
  cash_amount: number;
}

export interface CooperativeDailyStortingReportWeek {
  key: string;
  week_index: number;
  start_date_key: string;
  end_date_key: string;
  rows: CooperativeDailyStortingReportRow[];
  summary: CooperativeDailyStortingReportSummary;
}

export interface CooperativeDailyStortingEmployeeOption {
  id: string;
  name: string;
  position?: string;
}

export interface CooperativeDailyStortingReportGroup {
  key: string;
  employee_id?: string;
  employee_name?: string;
  employee_position?: string;
  area_names: string[];
  rows: CooperativeDailyStortingReportRow[];
  weeks: CooperativeDailyStortingReportWeek[];
  summary: CooperativeDailyStortingReportSummary;
}

export interface CooperativeDailyStortingReport {
  month_key: string;
  start_date: string;
  end_date: string;
  employee_id?: string;
  employee_name?: string;
  employee_position?: string;
  employeeOptions: CooperativeDailyStortingEmployeeOption[];
  rows: CooperativeDailyStortingReportRow[];
  groups: CooperativeDailyStortingReportGroup[];
  summary: CooperativeDailyStortingReportSummary;
}

const DATE_KEY_FORMAT = 'YYYY-MM-DD';
const DROP_MARGIN_RATE = 0.1;

const getAutoMandatorySavingReturnPaymentId = (
  transaction: Pick<CooperativeSavingTransaction, 'notes'>,
) => {
  const match = transaction.notes?.match(/\[AUTO_MANDATORY_SAVING_RETURN_PAYMENT:([^\]]+)\]/);
  return match?.[1];
};

export const createEmptyCooperativeDailyStortingReportSummary = (): CooperativeDailyStortingReportSummary => ({
  row_count: 0,
  storting_amount: 0,
  drop_margin_amount: 0,
  drop_amount: 0,
  saving_withdrawal_amount: 0,
  iptw_amount: 0,
  cash_amount: 0,
});

const getDateKey = (value: string) => dayjs(value).tz().format(DATE_KEY_FORMAT);

const getMonthRange = (monthDate?: string) => {
  const selectedMonth = monthDate ? dayjs(monthDate).tz() : dayjs().tz();
  const startDate = selectedMonth.startOf('month');
  const endDate = selectedMonth.endOf('month');

  return {
    monthKey: selectedMonth.format('YYYY-MM'),
    startDate,
    endDate,
  };
};

const getMondayStart = (value: Dayjs) => {
  const daysSinceMonday = (value.day() + 6) % 7;
  return value.subtract(daysSinceMonday, 'day').startOf('day');
};

const buildWeekRanges = (
  monthStart: Dayjs,
  monthEnd: Dayjs,
) => {
  const ranges: Array<Pick<CooperativeDailyStortingReportWeek, 'key' | 'week_index' | 'start_date_key' | 'end_date_key'>> = [];
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
  ranges: Array<Pick<CooperativeDailyStortingReportWeek, 'key' | 'week_index' | 'start_date_key' | 'end_date_key'>>,
) => ranges.find((range) => dateKey >= range.start_date_key && dateKey <= range.end_date_key);

const isDateKeyInRange = (
  value: string | undefined,
  startDateKey: string,
  endDateKey: string,
) => {
  if (!value) return false;
  const dateKey = getDateKey(value);

  return dateKey >= startDateKey && dateKey <= endDateKey;
};

const compareEmployeeLabel = (
  left?: Pick<CooperativeDailyStortingEmployeeOption, 'name' | 'position'>,
  right?: Pick<CooperativeDailyStortingEmployeeOption, 'name' | 'position'>,
) => {
  const leftLabel = left?.position ? `${left.name} ${left.position}` : left?.name ?? '';
  const rightLabel = right?.position ? `${right.name} ${right.position}` : right?.name ?? '';

  return leftLabel.localeCompare(rightLabel, undefined, { numeric: true });
};

const getMemberOfficer = (
  member: CooperativeMember | undefined,
  employeeById: Map<string, Employee>,
) => {
  const employee = member?.officer_id ? employeeById.get(member.officer_id) : undefined;

  return {
    employee_id: member?.officer_id,
    employee_name: employee?.name ?? member?.officer_name,
    employee_position: employee?.position ?? member?.officer_position,
  };
};

const getPaymentCollector = (
  payment: CooperativeLoanPayment,
  member: CooperativeMember | undefined,
  employeeById: Map<string, Employee>,
) => {
  if (payment.collector_id || payment.collector_name) {
    const employee = payment.collector_id ? employeeById.get(payment.collector_id) : undefined;

    return {
      employee_id: payment.collector_id,
      employee_name: employee?.name ?? payment.collector_name,
      employee_position: employee?.position ?? payment.collector_position,
    };
  }

  return getMemberOfficer(member, employeeById);
};

const getEmployeeSnapshot = (employee?: Employee) => ({
  employee_id: employee?.id,
  employee_name: employee?.name,
  employee_position: employee?.position,
});

const matchesEmployeeFilter = (
  employeeId: string | undefined,
  filterEmployeeId?: string,
) => {
  if (!filterEmployeeId) return true;
  if (filterEmployeeId === COOPERATIVE_DAILY_STORTING_UNASSIGNED_EMPLOYEE) return !employeeId;

  return employeeId === filterEmployeeId;
};

const isPostedLoanPayment = (payment: CooperativeLoanPayment) => (
  payment.status === 'POSTED' &&
  payment.payment_type !== 'REVERSAL' &&
  !payment.reversal_of_payment_id
);

const isDroppedLoan = (loan: CooperativeLoan) => (
  (loan.status === 'DISBURSED' || loan.status === 'PAID_OFF') &&
  Boolean(loan.disbursed_at)
);

const isPostedSavingWithdrawal = (transaction: CooperativeSavingTransaction) => (
  transaction.status === 'POSTED' &&
  transaction.transaction_type === 'WITHDRAWAL'
);

const getGroupKey = (employeeId?: string) => employeeId ?? COOPERATIVE_DAILY_STORTING_UNASSIGNED_EMPLOYEE;

const getAmountBucketKey = (date: string, employeeId?: string) => `${getDateKey(date)}:${getGroupKey(employeeId)}`;

const addAmountByDateAndEmployee = (
  amountByKey: Map<string, number>,
  date: string,
  employee: Pick<CooperativeDailyStortingReportRow, 'employee_id'>,
  amount: number,
) => {
  const key = getAmountBucketKey(date, employee.employee_id);
  amountByKey.set(key, roundCurrency((amountByKey.get(key) ?? 0) + Number(amount || 0)));
};

const summarizeRows = (
  rows: CooperativeDailyStortingReportRow[],
): CooperativeDailyStortingReportSummary => rows.reduce((summary, row) => ({
  row_count: summary.row_count + 1,
  storting_amount: roundCurrency(summary.storting_amount + row.storting_amount),
  drop_margin_amount: roundCurrency(summary.drop_margin_amount + row.drop_margin_amount),
  drop_amount: roundCurrency(summary.drop_amount + row.drop_amount),
  saving_withdrawal_amount: roundCurrency(summary.saving_withdrawal_amount + row.saving_withdrawal_amount),
  iptw_amount: roundCurrency(summary.iptw_amount + row.iptw_amount),
  cash_amount: roundCurrency(summary.cash_amount + row.cash_amount),
}), createEmptyCooperativeDailyStortingReportSummary());

const buildWeeks = (
  rows: CooperativeDailyStortingReportRow[],
  weekRanges: Array<Pick<CooperativeDailyStortingReportWeek, 'key' | 'week_index' | 'start_date_key' | 'end_date_key'>>,
) => {
  const rowsByWeekKey = new Map<string, CooperativeDailyStortingReportRow[]>();

  rows.forEach((row) => {
    const weekRange = findWeekRange(row.date_key, weekRanges);
    if (!weekRange) return;

    const currentRows = rowsByWeekKey.get(weekRange.key) ?? [];
    currentRows.push(row);
    rowsByWeekKey.set(weekRange.key, currentRows);
  });

  return weekRanges
    .map((weekRange) => {
      const weekRows = rowsByWeekKey.get(weekRange.key) ?? [];
      if (weekRows.length === 0) return undefined;

      return {
        ...weekRange,
        rows: weekRows,
        summary: summarizeRows(weekRows),
      } satisfies CooperativeDailyStortingReportWeek;
    })
    .filter((week): week is CooperativeDailyStortingReportWeek => Boolean(week));
};

const buildEmployeeOptions = (
  employees: Employee[],
  members: CooperativeMember[],
  payments: CooperativeLoanPayment[],
): CooperativeDailyStortingEmployeeOption[] => {
  const optionById = new Map<string, CooperativeDailyStortingEmployeeOption>();

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

  payments.forEach((payment) => {
    if (!payment.collector_id || optionById.has(payment.collector_id) || !payment.collector_name) return;
    optionById.set(payment.collector_id, {
      id: payment.collector_id,
      name: payment.collector_name,
      position: payment.collector_position,
    });
  });

  return Array.from(optionById.values())
    .sort(compareEmployeeLabel);
};

const buildAreaNamesByEmployeeId = (
  employeeAreas: EmployeeArea[],
  members: CooperativeMember[],
) => {
  const areaNamesByEmployeeId = new Map<string, Set<string>>();

  const addAreaName = (employeeId: string | undefined, areaCode?: string, areaName?: string) => {
    if (!employeeId || !areaName) return;
    const currentNames = areaNamesByEmployeeId.get(employeeId) ?? new Set<string>();
    currentNames.add(areaCode ? `${areaCode} - ${areaName}` : areaName);
    areaNamesByEmployeeId.set(employeeId, currentNames);
  };

  employeeAreas.forEach((assignment) => {
    addAreaName(assignment.employee_id, assignment.area_code, assignment.area_name);
  });

  members.forEach((member) => {
    addAreaName(member.officer_id, member.area_code, member.area_name);
  });

  return new Map(
    Array.from(areaNamesByEmployeeId.entries()).map(([employeeId, areaNames]) => [
      employeeId,
      Array.from(areaNames).sort((left, right) => left.localeCompare(right, undefined, { numeric: true })),
    ]),
  );
};

export const getCooperativeDailyStortingReport = async (
  filters: CooperativeDailyStortingReportFilters = {},
): Promise<CooperativeDailyStortingReport> => {
  await requireUserPermission(await getCurrentSessionUser(), 'COOPERATIVE_DAILY_STORTING_REPORT_VIEW');
  const { monthKey, startDate, endDate } = getMonthRange(filters.monthDate);
  const startDateKey = startDate.format(DATE_KEY_FORMAT);
  const endDateKey = endDate.format(DATE_KEY_FORMAT);
  const weekRanges = buildWeekRanges(startDate, endDate);
  const [payments, loans, savingTransactions, financeTransactions, members, employees, employeeAreas] = await Promise.all([
    db.cooperativeLoanPayments.orderBy('payment_date').toArray(),
    db.cooperativeLoans.orderBy('loan_number').toArray(),
    db.cooperativeSavingTransactions.orderBy('transaction_date').toArray(),
    db.financeTransactions
      .where('category')
      .equals(FINANCE_CATEGORIES.KSP_IPTW)
      .filter((transaction) => !transaction.deleted_at)
      .toArray(),
    db.cooperativeMembers.orderBy('member_number').toArray(),
    db.employees.orderBy('name').toArray(),
    db.employeeAreas.orderBy('employee_id').toArray(),
  ]);
  const memberById = new Map(members.map((member) => [member.id, member]));
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const employeeByFieldCashAccountId = new Map(
    employees
      .filter((employee) => employee.is_active && employee.field_cash_account_id)
      .map((employee) => [employee.field_cash_account_id as string, employee]),
  );
  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
  const financeTransactionById = new Map(financeTransactions.map((transaction) => [transaction.id, transaction]));
  const employeeOptions = buildEmployeeOptions(employees, members, payments);
  const selectedEmployee = filters.employeeId && filters.employeeId !== COOPERATIVE_DAILY_STORTING_UNASSIGNED_EMPLOYEE
    ? employeeOptions.find((employee) => employee.id === filters.employeeId)
    : undefined;
  const areaNamesByEmployeeId = buildAreaNamesByEmployeeId(employeeAreas, members);
  const employeeByGroupKey = new Map<string, Pick<
    CooperativeDailyStortingReportRow,
    'employee_id' | 'employee_name' | 'employee_position'
  >>();
  const stortingByKey = new Map<string, number>();
  const dropByKey = new Map<string, number>();
  const tabKeluarByKey = new Map<string, number>();
  const iptwByKey = new Map<string, number>();

  const registerEmployee = (
    date: string,
    employee: Pick<CooperativeDailyStortingReportRow, 'employee_id' | 'employee_name' | 'employee_position'>,
  ) => {
    if (!matchesEmployeeFilter(employee.employee_id, filters.employeeId)) return false;
    const key = getAmountBucketKey(date, employee.employee_id);
    employeeByGroupKey.set(getGroupKey(employee.employee_id), employee);
    return key;
  };

  payments
    .filter(isPostedLoanPayment)
    .filter((payment) => isDateKeyInRange(payment.payment_date, startDateKey, endDateKey))
    .forEach((payment) => {
      const member = memberById.get(payment.member_id);
      const employee = getPaymentCollector(payment, member, employeeById);
      const key = registerEmployee(payment.payment_date, employee);
      if (!key) return;
      addAmountByDateAndEmployee(stortingByKey, payment.payment_date, employee, payment.amount);
    });

  loans
    .filter(isDroppedLoan)
    .filter((loan) => isDateKeyInRange(loan.disbursed_at, startDateKey, endDateKey))
    .forEach((loan) => {
      const member = memberById.get(loan.member_id);
      const employee = getMemberOfficer(member, employeeById);
      const key = registerEmployee(loan.disbursed_at as string, employee);
      if (!key) return;
      addAmountByDateAndEmployee(dropByKey, loan.disbursed_at as string, employee, loan.principal_amount);
    });

  savingTransactions
    .filter(isPostedSavingWithdrawal)
    .filter((transaction) => isDateKeyInRange(transaction.transaction_date, startDateKey, endDateKey))
    .forEach((transaction) => {
      const member = memberById.get(transaction.member_id);
      const autoReturnPaymentId = getAutoMandatorySavingReturnPaymentId(transaction);
      const autoReturnPayment = autoReturnPaymentId ? paymentById.get(autoReturnPaymentId) : undefined;
      const transactionCashEmployee = employeeByFieldCashAccountId.get(transaction.cash_account_id ?? '');
      const autoReturnPaymentCashEmployee = employeeByFieldCashAccountId.get(autoReturnPayment?.cash_account_id ?? '');
      const employee = transactionCashEmployee || autoReturnPaymentCashEmployee
        ? getEmployeeSnapshot(transactionCashEmployee ?? autoReturnPaymentCashEmployee)
        : getMemberOfficer(member, employeeById);
      const key = registerEmployee(transaction.transaction_date, employee);
      if (!key) return;
      addAmountByDateAndEmployee(tabKeluarByKey, transaction.transaction_date, employee, transaction.amount);
    });

  financeTransactions
    .filter((transaction) => isDateKeyInRange(transaction.created_at, startDateKey, endDateKey))
    .forEach((transaction) => {
      const originalPayout = transaction.type === 'INCOME' && transaction.reference_id
        ? financeTransactionById.get(transaction.reference_id)
        : undefined;
      const payment = paymentById.get(
        transaction.type === 'EXPENSE'
          ? transaction.reference_id ?? ''
          : originalPayout?.reference_id ?? '',
      );
      const member = payment ? memberById.get(payment.member_id) : undefined;
      const fieldEmployee = transaction.field_employee_id
        ? employeeById.get(transaction.field_employee_id)
        : undefined;
      const cashEmployee = employeeByFieldCashAccountId.get(transaction.cash_account_id ?? '');
      const employee = fieldEmployee || cashEmployee
        ? getEmployeeSnapshot(fieldEmployee ?? cashEmployee)
        : payment
          ? getPaymentCollector(payment, member, employeeById)
          : getMemberOfficer(member, employeeById);
      const key = registerEmployee(transaction.created_at, employee);
      if (!key) return;
      addAmountByDateAndEmployee(
        iptwByKey,
        transaction.created_at,
        employee,
        transaction.type === 'INCOME' ? -transaction.amount : transaction.amount,
      );
    });

  const bucketKeys = Array.from(new Set([
    ...stortingByKey.keys(),
    ...dropByKey.keys(),
    ...tabKeluarByKey.keys(),
    ...iptwByKey.keys(),
  ])).sort();

  const rows = bucketKeys.map((bucketKey): CooperativeDailyStortingReportRow => {
    const [dateKey, employeeKey] = bucketKey.split(':');
    const employee = employeeByGroupKey.get(employeeKey) ?? {};
    const stortingAmount = roundCurrency(stortingByKey.get(bucketKey) ?? 0);
    const dropAmount = roundCurrency(dropByKey.get(bucketKey) ?? 0);
    const dropMarginAmount = roundCurrency(dropAmount * DROP_MARGIN_RATE);
    const savingWithdrawalAmount = roundCurrency(tabKeluarByKey.get(bucketKey) ?? 0);
    const iptwAmount = roundCurrency(iptwByKey.get(bucketKey) ?? 0);
    const cashAmount = roundCurrency(
      stortingAmount + dropMarginAmount - dropAmount - savingWithdrawalAmount - iptwAmount,
    );

    return {
      id: bucketKey,
      date_key: dateKey,
      employee_id: employee.employee_id,
      employee_name: employee.employee_name,
      employee_position: employee.employee_position,
      storting_amount: stortingAmount,
      drop_margin_amount: dropMarginAmount,
      drop_amount: dropAmount,
      saving_withdrawal_amount: savingWithdrawalAmount,
      iptw_amount: iptwAmount,
      cash_amount: cashAmount,
    };
  });
  const rowsByEmployeeKey = new Map<string, CooperativeDailyStortingReportRow[]>();

  rows.forEach((row) => {
    const employeeKey = getGroupKey(row.employee_id);
    const currentRows = rowsByEmployeeKey.get(employeeKey) ?? [];
    currentRows.push(row);
    rowsByEmployeeKey.set(employeeKey, currentRows);
  });

  const groups = Array.from(rowsByEmployeeKey.entries())
    .map(([key, groupRows]) => {
      const firstRow = groupRows[0];

      return {
        key,
        employee_id: firstRow.employee_id,
        employee_name: firstRow.employee_name,
        employee_position: firstRow.employee_position,
        area_names: firstRow.employee_id ? areaNamesByEmployeeId.get(firstRow.employee_id) ?? [] : [],
        rows: groupRows,
        weeks: buildWeeks(groupRows, weekRanges),
        summary: summarizeRows(groupRows),
      } satisfies CooperativeDailyStortingReportGroup;
    })
    .sort((left, right) => {
      if (!left.employee_id && right.employee_id) return 1;
      if (left.employee_id && !right.employee_id) return -1;
      return compareEmployeeLabel(
        left.employee_name ? { name: left.employee_name, position: left.employee_position } : undefined,
        right.employee_name ? { name: right.employee_name, position: right.employee_position } : undefined,
      );
    });

  return {
    month_key: monthKey,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    employee_id: filters.employeeId === COOPERATIVE_DAILY_STORTING_UNASSIGNED_EMPLOYEE
      ? undefined
      : selectedEmployee?.id,
    employee_name: selectedEmployee?.name,
    employee_position: selectedEmployee?.position,
    employeeOptions,
    rows,
    groups,
    summary: summarizeRows(rows),
  };
};
