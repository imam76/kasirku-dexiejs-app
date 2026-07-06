import { getCurrentSessionUser, requireUserPermission } from '@/auth/authService';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import type { Dayjs } from 'dayjs';
import type {
  CooperativeLoan,
  CooperativeLoanInstallment,
  CooperativeLoanPayment,
  CooperativeMember,
  Employee,
  EmployeeArea,
} from '@/types';
import { isReportableCooperativeLoanPayment } from '@/utils/koperasi/loanReport';
import { roundCurrency } from '@/utils/koperasi/loanSchedule';

export const COOPERATIVE_RESORT_DEVELOPMENT_UNASSIGNED_EMPLOYEE = '__UNASSIGNED__';

export interface CooperativeResortDevelopmentReportFilters {
  monthDate?: string;
  employeeId?: string;
}

export interface CooperativeResortDevelopmentEmployeeOption {
  id: string;
  name: string;
  position?: string;
}

export interface CooperativeResortDevelopmentReportRow {
  id: string;
  date_key: string;
  employee_id?: string;
  employee_name?: string;
  employee_position?: string;
  opening_balance_amount: number;
  drop_amount: number;
  service_amount: number;
  new_loan_amount: number;
  total_loan_amount: number;
  installment_amount: number;
  ending_balance_amount: number;
}

export interface CooperativeResortDevelopmentReportSummary {
  row_count: number;
  active_member_count: number;
  opening_balance_amount: number;
  drop_amount: number;
  service_amount: number;
  new_loan_amount: number;
  total_loan_amount: number;
  installment_amount: number;
  ending_balance_amount: number;
  collection_ratio: number;
  monthly_installment_target_amount: number;
  target_difference_amount: number;
  overdue_installment_count: number;
}

export interface CooperativeResortDevelopmentReportGroup {
  key: string;
  employee_id?: string;
  employee_name?: string;
  employee_position?: string;
  area_names: string[];
  rows: CooperativeResortDevelopmentReportRow[];
  summary: CooperativeResortDevelopmentReportSummary;
}

export interface CooperativeResortDevelopmentAmountComparison {
  current_amount: number;
  previous_amount: number;
  difference_amount: number;
}

export interface CooperativeResortDevelopmentRatioComparison {
  current_percentage: number;
  previous_percentage: number;
  difference_percentage: number;
}

export interface CooperativeResortDevelopmentPreviousMonthComparison {
  month_key: string;
  drop_amount: CooperativeResortDevelopmentAmountComparison;
  installment_amount: CooperativeResortDevelopmentAmountComparison;
  collection_ratio: CooperativeResortDevelopmentRatioComparison;
}

export interface CooperativeResortDevelopmentReport {
  month_key: string;
  start_date: string;
  end_date: string;
  employeeOptions: CooperativeResortDevelopmentEmployeeOption[];
  rows: CooperativeResortDevelopmentReportRow[];
  groups: CooperativeResortDevelopmentReportGroup[];
  summary: CooperativeResortDevelopmentReportSummary;
  previous_month_comparison: CooperativeResortDevelopmentPreviousMonthComparison;
}

type EmployeeSnapshot = Pick<
  CooperativeResortDevelopmentReportRow,
  'employee_id' | 'employee_name' | 'employee_position'
>;

type LoanContext = {
  loan: CooperativeLoan;
  member?: CooperativeMember;
  employee: EmployeeSnapshot;
  group_key: string;
  disbursed_date_key: string;
  reportable_amount: number;
  drop_amount: number;
};

type AmountEvent = {
  date_key: string;
  group_key: string;
  amount: number;
};

type PeriodSummary = Pick<
  CooperativeResortDevelopmentReportSummary,
  | 'opening_balance_amount'
  | 'drop_amount'
  | 'service_amount'
  | 'new_loan_amount'
  | 'total_loan_amount'
  | 'installment_amount'
  | 'ending_balance_amount'
  | 'collection_ratio'
>;

const DATE_KEY_FORMAT = 'YYYY-MM-DD';
const LOAN_SERVICE_RATE = 0.2;

const getDateKey = (value: string) => dayjs(value).tz().format(DATE_KEY_FORMAT);

const getMonthRange = (monthDate?: string) => {
  const selectedMonth = monthDate ? dayjs(monthDate).tz() : dayjs().tz();

  return {
    monthKey: selectedMonth.format('YYYY-MM'),
    startDate: selectedMonth.startOf('month'),
    endDate: selectedMonth.endOf('month'),
  };
};

const getWorkdayDateKeys = (startDate: Dayjs, endDate: Dayjs) => {
  const dateKeys: string[] = [];
  let cursor = startDate.startOf('day');

  while (!cursor.isAfter(endDate, 'day')) {
    const dayOfWeek = cursor.day();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      dateKeys.push(cursor.format(DATE_KEY_FORMAT));
    }
    cursor = cursor.add(1, 'day');
  }

  return dateKeys;
};

const getGroupKey = (employeeId?: string) => (
  employeeId ?? COOPERATIVE_RESORT_DEVELOPMENT_UNASSIGNED_EMPLOYEE
);

const getAmountBucketKey = (dateKey: string, groupKey: string) => `${dateKey}:${groupKey}`;

const isReportableLoan = (loan: CooperativeLoan) => (
  (loan.status === 'DISBURSED' || loan.status === 'PAID_OFF') &&
  Boolean(loan.disbursed_at)
);

const getLoanServiceAmount = (principalAmount: number) => roundCurrency(
  Number(principalAmount || 0) * LOAN_SERVICE_RATE,
);

const getLoanReportableAmount = (principalAmount: number) => roundCurrency(
  Number(principalAmount || 0) + getLoanServiceAmount(principalAmount),
);

const getLoanOutstandingAmount = (loan: CooperativeLoan) => roundCurrency(
  Number(loan.outstanding_principal_amount || 0) +
  Number(loan.outstanding_interest_amount || 0) +
  Number(loan.outstanding_penalty_amount || 0),
);

const getLoanPaymentAmount = (payment: CooperativeLoanPayment) => roundCurrency(
  Number(payment.amount || 0),
);

const getLoanReportableOpeningAmount = (
  loan: CooperativeLoan,
  reportablePaymentAmount: number,
) => {
  if (loan.is_migration) {
    return roundCurrency(getLoanOutstandingAmount(loan) + reportablePaymentAmount);
  }

  return getLoanReportableAmount(loan.principal_amount);
};

const compareEmployeeLabel = (
  left?: Pick<CooperativeResortDevelopmentEmployeeOption, 'name' | 'position'>,
  right?: Pick<CooperativeResortDevelopmentEmployeeOption, 'name' | 'position'>,
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

const getPaymentEmployee = (
  payment: CooperativeLoanPayment,
  context: LoanContext | undefined,
  member: CooperativeMember | undefined,
  employeeById: Map<string, Employee>,
): EmployeeSnapshot => {
  if (context?.employee.employee_id || context?.employee.employee_name) {
    return context.employee;
  }

  const memberEmployee = getMemberEmployee(member, employeeById);
  if (memberEmployee.employee_id || memberEmployee.employee_name) {
    return memberEmployee;
  }

  const collector = payment.collector_id ? employeeById.get(payment.collector_id) : undefined;
  return {
    employee_id: payment.collector_id,
    employee_name: collector?.name ?? payment.collector_name,
    employee_position: collector?.position ?? payment.collector_position,
  };
};

const matchesEmployeeFilter = (
  employeeId: string | undefined,
  filterEmployeeId?: string,
) => {
  if (!filterEmployeeId) return true;
  if (filterEmployeeId === COOPERATIVE_RESORT_DEVELOPMENT_UNASSIGNED_EMPLOYEE) return !employeeId;

  return employeeId === filterEmployeeId;
};

const addAmount = (amountByKey: Map<string, number>, key: string, amount: number) => {
  amountByKey.set(key, roundCurrency((amountByKey.get(key) ?? 0) + Number(amount || 0)));
};

const addAmountEvent = (
  events: AmountEvent[],
  amountByBucketKey: Map<string, number>,
  dateKey: string,
  groupKey: string,
  amount: number,
) => {
  const roundedAmount = roundCurrency(Number(amount || 0));
  events.push({ date_key: dateKey, group_key: groupKey, amount: roundedAmount });
  addAmount(amountByBucketKey, getAmountBucketKey(dateKey, groupKey), roundedAmount);
};

const createEmptySummary = (): CooperativeResortDevelopmentReportSummary => ({
  row_count: 0,
  active_member_count: 0,
  opening_balance_amount: 0,
  drop_amount: 0,
  service_amount: 0,
  new_loan_amount: 0,
  total_loan_amount: 0,
  installment_amount: 0,
  ending_balance_amount: 0,
  collection_ratio: 0,
  monthly_installment_target_amount: 0,
  target_difference_amount: 0,
  overdue_installment_count: 0,
});

const finalizeSummary = (
  summary: CooperativeResortDevelopmentReportSummary,
): CooperativeResortDevelopmentReportSummary => {
  const totalLoanAmount = roundCurrency(summary.opening_balance_amount + summary.new_loan_amount);
  const endingBalanceAmount = roundCurrency(totalLoanAmount - summary.installment_amount);

  return {
    ...summary,
    total_loan_amount: totalLoanAmount,
    ending_balance_amount: endingBalanceAmount,
    collection_ratio: totalLoanAmount > 0
      ? (summary.installment_amount / totalLoanAmount) * 100
      : 0,
    target_difference_amount: roundCurrency(
      summary.installment_amount - summary.monthly_installment_target_amount,
    ),
  };
};

const summarizeRows = (
  rows: CooperativeResortDevelopmentReportRow[],
  extras: Pick<
    CooperativeResortDevelopmentReportSummary,
    'active_member_count' | 'monthly_installment_target_amount' | 'overdue_installment_count'
  >,
): CooperativeResortDevelopmentReportSummary => {
  const firstRow = rows[0];
  const lastRow = rows[rows.length - 1];
  const summary = rows.reduce((current, row) => ({
    ...current,
    row_count: current.row_count + 1,
    drop_amount: roundCurrency(current.drop_amount + row.drop_amount),
    service_amount: roundCurrency(current.service_amount + row.service_amount),
    new_loan_amount: roundCurrency(current.new_loan_amount + row.new_loan_amount),
    installment_amount: roundCurrency(current.installment_amount + row.installment_amount),
  }), {
    ...createEmptySummary(),
    ...extras,
    opening_balance_amount: firstRow?.opening_balance_amount ?? 0,
    ending_balance_amount: lastRow?.ending_balance_amount ?? 0,
  });

  return finalizeSummary(summary);
};

const summarizeGroups = (
  groups: CooperativeResortDevelopmentReportGroup[],
): CooperativeResortDevelopmentReportSummary => {
  const summary = groups.reduce((current, group) => ({
    ...current,
    row_count: current.row_count + group.summary.row_count,
    active_member_count: current.active_member_count + group.summary.active_member_count,
    opening_balance_amount: roundCurrency(
      current.opening_balance_amount + group.summary.opening_balance_amount,
    ),
    drop_amount: roundCurrency(current.drop_amount + group.summary.drop_amount),
    service_amount: roundCurrency(current.service_amount + group.summary.service_amount),
    new_loan_amount: roundCurrency(current.new_loan_amount + group.summary.new_loan_amount),
    installment_amount: roundCurrency(current.installment_amount + group.summary.installment_amount),
    monthly_installment_target_amount: roundCurrency(
      current.monthly_installment_target_amount + group.summary.monthly_installment_target_amount,
    ),
    overdue_installment_count: current.overdue_installment_count + group.summary.overdue_installment_count,
  }), createEmptySummary());

  return finalizeSummary(summary);
};

const getOpeningBalanceForGroup = (
  groupKey: string,
  startDateKey: string,
  endDateKey: string,
  loanContexts: LoanContext[],
  paymentEvents: AmountEvent[],
) => {
  const previousLoanAmount = loanContexts
    .filter((context) => context.group_key === groupKey)
    .filter((context) => (
      context.loan.is_migration
        ? context.disbursed_date_key <= endDateKey
        : context.disbursed_date_key < startDateKey
    ))
    .reduce((sum, context) => sum + context.reportable_amount, 0);
  const previousPaymentAmount = paymentEvents
    .filter((event) => event.group_key === groupKey && event.date_key < startDateKey)
    .reduce((sum, event) => sum + event.amount, 0);

  return roundCurrency(previousLoanAmount - previousPaymentAmount);
};

const getPeriodSummary = ({
  startDate,
  endDate,
  groupKeys,
  loanContexts,
  paymentEvents,
}: {
  startDate: Dayjs;
  endDate: Dayjs;
  groupKeys: Set<string>;
  loanContexts: LoanContext[];
  paymentEvents: AmountEvent[];
}): PeriodSummary => {
  const startDateKey = startDate.format(DATE_KEY_FORMAT);
  const workdayDateKeys = new Set(getWorkdayDateKeys(startDate, endDate));
  const openingBalanceAmount = roundCurrency(
    Array.from(groupKeys).reduce((sum, groupKey) => (
      sum + getOpeningBalanceForGroup(
        groupKey,
        startDateKey,
        endDate.format(DATE_KEY_FORMAT),
        loanContexts,
        paymentEvents,
      )
    ), 0),
  );
  const dropAmount = roundCurrency(
    loanContexts
      .filter((context) => groupKeys.has(context.group_key))
      .filter((context) => workdayDateKeys.has(context.disbursed_date_key))
      .reduce((sum, context) => sum + context.drop_amount, 0),
  );
  const serviceAmount = roundCurrency(dropAmount * LOAN_SERVICE_RATE);
  const newLoanAmount = roundCurrency(dropAmount + serviceAmount);
  const installmentAmount = roundCurrency(
    paymentEvents
      .filter((event) => groupKeys.has(event.group_key))
      .filter((event) => workdayDateKeys.has(event.date_key))
      .reduce((sum, event) => sum + event.amount, 0),
  );
  const totalLoanAmount = roundCurrency(openingBalanceAmount + newLoanAmount);
  const endingBalanceAmount = roundCurrency(totalLoanAmount - installmentAmount);

  return {
    opening_balance_amount: openingBalanceAmount,
    drop_amount: dropAmount,
    service_amount: serviceAmount,
    new_loan_amount: newLoanAmount,
    total_loan_amount: totalLoanAmount,
    installment_amount: installmentAmount,
    ending_balance_amount: endingBalanceAmount,
    collection_ratio: totalLoanAmount > 0 ? (installmentAmount / totalLoanAmount) * 100 : 0,
  };
};

const getInstallmentDueAmount = (installment: CooperativeLoanInstallment) => roundCurrency(
  Number(installment.principal_amount || 0) +
  Number(installment.interest_amount || 0) +
  Number(installment.penalty_amount || 0),
);

const getInstallmentPaidAmount = (installment: CooperativeLoanInstallment) => roundCurrency(
  Number(installment.paid_principal_amount || 0) +
  Number(installment.paid_interest_amount || 0) +
  Number(installment.paid_penalty_amount || 0),
);

const buildEmployeeOptions = (
  employees: Employee[],
  members: CooperativeMember[],
  loans: CooperativeLoan[],
) => {
  const optionById = new Map<string, CooperativeResortDevelopmentEmployeeOption>();

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

const makeAmountComparison = (
  currentAmount: number,
  previousAmount: number,
): CooperativeResortDevelopmentAmountComparison => ({
  current_amount: roundCurrency(currentAmount),
  previous_amount: roundCurrency(previousAmount),
  difference_amount: roundCurrency(currentAmount - previousAmount),
});

export const getCooperativeResortDevelopmentReport = async (
  filters: CooperativeResortDevelopmentReportFilters = {},
): Promise<CooperativeResortDevelopmentReport> => {
  await requireUserPermission(await getCurrentSessionUser(), 'COOPERATIVE_RESORT_DEVELOPMENT_REPORT_VIEW');

  const { monthKey, startDate, endDate } = getMonthRange(filters.monthDate);
  const previousMonth = startDate.subtract(1, 'month');
  const previousMonthRange = getMonthRange(previousMonth.toISOString());
  const startDateKey = startDate.format(DATE_KEY_FORMAT);
  const endDateKey = endDate.format(DATE_KEY_FORMAT);
  const workdayDateKeys = getWorkdayDateKeys(startDate, endDate);
  const workdayDateKeySet = new Set(workdayDateKeys);
  const [
    loans,
    payments,
    installments,
    members,
    employees,
    employeeAreas,
  ] = await Promise.all([
    db.cooperativeLoans.orderBy('loan_number').toArray(),
    db.cooperativeLoanPayments.orderBy('payment_date').toArray(),
    db.cooperativeLoanInstallments.orderBy('due_date').toArray(),
    db.cooperativeMembers.orderBy('member_number').toArray(),
    db.employees.orderBy('name').toArray(),
    db.employeeAreas.orderBy('employee_id').toArray(),
  ]);
  const memberById = new Map(members.map((member) => [member.id, member]));
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const reportablePaymentAmountByLoanId = new Map<string, number>();
  payments
    .filter(isReportableCooperativeLoanPayment)
    .forEach((payment) => {
      addAmount(
        reportablePaymentAmountByLoanId,
        payment.loan_id,
        getLoanPaymentAmount(payment),
      );
    });
  const employeeByKey = new Map<string, EmployeeSnapshot>();
  const addEmployeeSnapshot = (employee: EmployeeSnapshot) => {
    employeeByKey.set(getGroupKey(employee.employee_id), employee);
  };

  employees.forEach((employee) => addEmployeeSnapshot({
    employee_id: employee.id,
    employee_name: employee.name,
    employee_position: employee.position,
  }));

  const loanContexts = loans
    .filter(isReportableLoan)
    .map((loan): LoanContext => {
      const member = memberById.get(loan.member_id);
      const employee = getLoanEmployee(loan, member, employeeById);
      const context = {
        loan,
        member,
        employee,
        group_key: getGroupKey(employee.employee_id),
        disbursed_date_key: getDateKey(loan.disbursed_at as string),
        reportable_amount: getLoanReportableOpeningAmount(
          loan,
          reportablePaymentAmountByLoanId.get(loan.id) ?? 0,
        ),
        drop_amount: loan.is_migration ? 0 : Number(loan.principal_amount || 0),
      };
      addEmployeeSnapshot(employee);
      return context;
    })
    .filter((context) => matchesEmployeeFilter(context.employee.employee_id, filters.employeeId));
  const loanContextById = new Map(loanContexts.map((context) => [context.loan.id, context]));
  const groupKeys = new Set<string>();
  const activeMemberIdsByGroupKey = new Map<string, Set<string>>();
  const targetAmountByGroupKey = new Map<string, number>();
  const overdueCountByGroupKey = new Map<string, number>();
  const dropByBucketKey = new Map<string, number>();
  const paymentByBucketKey = new Map<string, number>();
  const paymentEvents: AmountEvent[] = [];
  const addGroupKey = (groupKey: string) => groupKeys.add(groupKey);

  members
    .filter((member) => member.status === 'ACTIVE')
    .forEach((member) => {
      const employee = getMemberEmployee(member, employeeById);
      if (!matchesEmployeeFilter(employee.employee_id, filters.employeeId)) return;
      const groupKey = getGroupKey(employee.employee_id);
      const activeMemberIds = activeMemberIdsByGroupKey.get(groupKey) ?? new Set<string>();
      activeMemberIds.add(member.id);
      activeMemberIdsByGroupKey.set(groupKey, activeMemberIds);
      addEmployeeSnapshot(employee);
      addGroupKey(groupKey);
    });

  loanContexts.forEach((context) => {
    addGroupKey(context.group_key);
    if (context.loan.is_migration) return;
    addAmountEvent(
      [],
      dropByBucketKey,
      context.disbursed_date_key,
      context.group_key,
      context.loan.principal_amount,
    );
  });

  payments
    .filter(isReportableCooperativeLoanPayment)
    .forEach((payment) => {
      const member = memberById.get(payment.member_id);
      const context = loanContextById.get(payment.loan_id);
      const employee = getPaymentEmployee(payment, context, member, employeeById);
      if (!matchesEmployeeFilter(employee.employee_id, filters.employeeId)) return;
      const groupKey = getGroupKey(employee.employee_id);
      addEmployeeSnapshot(employee);
      addGroupKey(groupKey);
      addAmountEvent(
        paymentEvents,
        paymentByBucketKey,
        getDateKey(payment.payment_date),
        groupKey,
        payment.amount,
      );
    });

  installments.forEach((installment) => {
    const context = loanContextById.get(installment.loan_id);
    const member = memberById.get(installment.member_id);
    const employee = context?.employee ?? getMemberEmployee(member, employeeById);
    if (!matchesEmployeeFilter(employee.employee_id, filters.employeeId)) return;
    const groupKey = getGroupKey(employee.employee_id);
    const dueDateKey = getDateKey(installment.due_date);
    const dueAmount = getInstallmentDueAmount(installment);
    const paidAmount = getInstallmentPaidAmount(installment);

    addEmployeeSnapshot(employee);
    addGroupKey(groupKey);

    if (dueDateKey >= startDateKey && dueDateKey <= endDateKey) {
      addAmount(targetAmountByGroupKey, groupKey, dueAmount);
    }

    if (dueDateKey <= endDateKey && roundCurrency(dueAmount - paidAmount) > 0) {
      overdueCountByGroupKey.set(groupKey, (overdueCountByGroupKey.get(groupKey) ?? 0) + 1);
    }
  });

  const areaNamesByEmployeeId = buildAreaNamesByEmployeeId(employeeAreas, members, loans);
  const groups = Array.from(groupKeys)
    .map((groupKey): CooperativeResortDevelopmentReportGroup => {
      const employee = employeeByKey.get(groupKey) ?? {};
      const activeMemberIds = activeMemberIdsByGroupKey.get(groupKey) ?? new Set<string>();
      const openingBalance = getOpeningBalanceForGroup(
        groupKey,
        startDateKey,
        endDateKey,
        loanContexts,
        paymentEvents,
      );
      let runningBalance = openingBalance;
      const rows = workdayDateKeys.map((dateKey): CooperativeResortDevelopmentReportRow => {
        const dropAmount = workdayDateKeySet.has(dateKey)
          ? roundCurrency(dropByBucketKey.get(getAmountBucketKey(dateKey, groupKey)) ?? 0)
          : 0;
        const serviceAmount = getLoanServiceAmount(dropAmount);
        const newLoanAmount = roundCurrency(dropAmount + serviceAmount);
        const totalLoanAmount = roundCurrency(runningBalance + newLoanAmount);
        const installmentAmount = roundCurrency(
          paymentByBucketKey.get(getAmountBucketKey(dateKey, groupKey)) ?? 0,
        );
        const endingBalanceAmount = roundCurrency(totalLoanAmount - installmentAmount);
        const row: CooperativeResortDevelopmentReportRow = {
          id: `${groupKey}:${dateKey}`,
          date_key: dateKey,
          ...employee,
          opening_balance_amount: runningBalance,
          drop_amount: dropAmount,
          service_amount: serviceAmount,
          new_loan_amount: newLoanAmount,
          total_loan_amount: totalLoanAmount,
          installment_amount: installmentAmount,
          ending_balance_amount: endingBalanceAmount,
        };

        runningBalance = endingBalanceAmount;
        return row;
      });
      const summary = summarizeRows(rows, {
        active_member_count: activeMemberIds.size,
        monthly_installment_target_amount: roundCurrency(targetAmountByGroupKey.get(groupKey) ?? 0),
        overdue_installment_count: overdueCountByGroupKey.get(groupKey) ?? 0,
      });

      return {
        key: groupKey,
        ...employee,
        area_names: employee.employee_id
          ? areaNamesByEmployeeId.get(employee.employee_id) ?? []
          : [],
        rows,
        summary,
      };
    })
    .filter((group) => (
      group.summary.active_member_count > 0 ||
      Math.abs(group.summary.opening_balance_amount) > 0.01 ||
      Math.abs(group.summary.drop_amount) > 0.01 ||
      Math.abs(group.summary.installment_amount) > 0.01 ||
      Math.abs(group.summary.monthly_installment_target_amount) > 0.01 ||
      group.summary.overdue_installment_count > 0
    ))
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

  const allRelevantGroupKeys = new Set([
    ...groupKeys,
    ...groups.map((group) => group.key),
  ]);
  const summary = summarizeGroups(groups);
  const previousSummary = getPeriodSummary({
    startDate: previousMonthRange.startDate,
    endDate: previousMonthRange.endDate,
    groupKeys: allRelevantGroupKeys,
    loanContexts,
    paymentEvents,
  });

  return {
    month_key: monthKey,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    employeeOptions: buildEmployeeOptions(employees, members, loans),
    rows: groups.flatMap((group) => group.rows),
    groups,
    summary,
    previous_month_comparison: {
      month_key: previousMonthRange.monthKey,
      drop_amount: makeAmountComparison(summary.drop_amount, previousSummary.drop_amount),
      installment_amount: makeAmountComparison(
        summary.installment_amount,
        previousSummary.installment_amount,
      ),
      collection_ratio: {
        current_percentage: summary.collection_ratio,
        previous_percentage: previousSummary.collection_ratio,
        difference_percentage: summary.collection_ratio - previousSummary.collection_ratio,
      },
    },
  };
};
