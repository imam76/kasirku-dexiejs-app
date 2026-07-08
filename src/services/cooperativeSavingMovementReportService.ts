import { getCurrentSessionUser, requireUserPermission } from '@/auth/authService';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import type {
  CooperativeMember,
  CooperativeSavingTransaction,
  CooperativeSavingType,
  Employee,
} from '@/types';
import { roundCurrency } from '@/utils/koperasi/loanSchedule';

export const COOPERATIVE_SAVING_MOVEMENT_UNASSIGNED_EMPLOYEE = '__UNASSIGNED__';

export type CooperativeSavingMovementDirection = 'IN' | 'OUT';

export interface CooperativeSavingMovementReportFilters {
  monthDate?: string;
  employeeId?: string;
  savingType?: CooperativeSavingType;
  direction: CooperativeSavingMovementDirection;
}

export interface CooperativeSavingMovementEmployeeOption {
  id: string;
  name: string;
  position?: string;
}

export interface CooperativeSavingMovementReportRow {
  id: string;
  transaction_id: string;
  date_key: string;
  transaction_date: string;
  member_id: string;
  member_number: string;
  member_name: string;
  saving_type: CooperativeSavingType;
  withdrawal_source?: CooperativeSavingTransaction['withdrawal_source'];
  employee_id?: string;
  employee_name?: string;
  employee_position?: string;
  cash_account_code?: string;
  cash_account_name?: string;
  payment_channel?: string;
  notes?: string;
  amount: number;
}

export interface CooperativeSavingMovementReportSummary {
  row_count: number;
  total_amount: number;
}

export interface CooperativeSavingMovementReportGroup {
  key: string;
  date_key: string;
  rows: CooperativeSavingMovementReportRow[];
  summary: CooperativeSavingMovementReportSummary;
}

export interface CooperativeSavingMovementReport {
  month_key: string;
  start_date: string;
  end_date: string;
  direction: CooperativeSavingMovementDirection;
  saving_type?: CooperativeSavingType;
  employee_id?: string;
  employeeOptions: CooperativeSavingMovementEmployeeOption[];
  rows: CooperativeSavingMovementReportRow[];
  groups: CooperativeSavingMovementReportGroup[];
  summary: CooperativeSavingMovementReportSummary;
}

const DATE_KEY_FORMAT = 'YYYY-MM-DD';

export const createEmptyCooperativeSavingMovementReportSummary = (): CooperativeSavingMovementReportSummary => ({
  row_count: 0,
  total_amount: 0,
});

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

const getDateKey = (value: string) => dayjs(value).tz().format(DATE_KEY_FORMAT);

const isDateInRange = (value: string, startDateKey: string, endDateKey: string) => {
  const dateKey = getDateKey(value);
  return dateKey >= startDateKey && dateKey <= endDateKey;
};

const compareEmployeeLabel = (
  left?: Pick<CooperativeSavingMovementEmployeeOption, 'name' | 'position'>,
  right?: Pick<CooperativeSavingMovementEmployeeOption, 'name' | 'position'>,
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

const getEmployeeSnapshot = (employee?: Employee) => ({
  employee_id: employee?.id,
  employee_name: employee?.name,
  employee_position: employee?.position,
});

const getTransactionEmployee = (
  transaction: CooperativeSavingTransaction,
  member: CooperativeMember | undefined,
  employeeById: Map<string, Employee>,
  employeeByFieldCashAccountId: Map<string, Employee>,
) => {
  const cashEmployee = employeeByFieldCashAccountId.get(transaction.cash_account_id ?? '');
  if (cashEmployee) return getEmployeeSnapshot(cashEmployee);

  return getMemberOfficer(member, employeeById);
};

const matchesEmployeeFilter = (employeeId: string | undefined, filterEmployeeId?: string) => {
  if (!filterEmployeeId) return true;
  if (filterEmployeeId === COOPERATIVE_SAVING_MOVEMENT_UNASSIGNED_EMPLOYEE) return !employeeId;

  return employeeId === filterEmployeeId;
};

const buildEmployeeOptions = (
  employees: Employee[],
  members: CooperativeMember[],
): CooperativeSavingMovementEmployeeOption[] => {
  const optionById = new Map<string, CooperativeSavingMovementEmployeeOption>();

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

  return Array.from(optionById.values()).sort(compareEmployeeLabel);
};

const summarizeRows = (
  rows: CooperativeSavingMovementReportRow[],
): CooperativeSavingMovementReportSummary => rows.reduce((summary, row) => ({
  row_count: summary.row_count + 1,
  total_amount: roundCurrency(summary.total_amount + row.amount),
}), createEmptyCooperativeSavingMovementReportSummary());

const isValidSavingMovementTransaction = (
  transaction: CooperativeSavingTransaction,
  direction: CooperativeSavingMovementDirection,
) => (
  transaction.status === 'POSTED' &&
  transaction.transaction_type === (direction === 'IN' ? 'DEPOSIT' : 'WITHDRAWAL') &&
  !transaction.reversal_of_transaction_id
);

export const getCooperativeSavingMovementReport = async (
  filters: CooperativeSavingMovementReportFilters,
): Promise<CooperativeSavingMovementReport> => {
  await requireUserPermission(await getCurrentSessionUser(), 'COOPERATIVE_SAVING_VIEW');

  const { monthKey, startDate, endDate } = getMonthRange(filters.monthDate);
  const startDateKey = startDate.format(DATE_KEY_FORMAT);
  const endDateKey = endDate.format(DATE_KEY_FORMAT);
  const [transactions, members, employees] = await Promise.all([
    db.cooperativeSavingTransactions.orderBy('transaction_date').toArray(),
    db.cooperativeMembers.orderBy('member_number').toArray(),
    db.employees.orderBy('name').toArray(),
  ]);
  const memberById = new Map(members.map((member) => [member.id, member]));
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const employeeByFieldCashAccountId = new Map(
    employees
      .filter((employee) => employee.is_active && employee.field_cash_account_id)
      .map((employee) => [employee.field_cash_account_id as string, employee]),
  );
  const employeeOptions = buildEmployeeOptions(employees, members);

  const rows = transactions
    .filter((transaction) => isValidSavingMovementTransaction(transaction, filters.direction))
    .filter((transaction) => !filters.savingType || transaction.saving_type === filters.savingType)
    .filter((transaction) => isDateInRange(transaction.transaction_date, startDateKey, endDateKey))
    .map((transaction): CooperativeSavingMovementReportRow | undefined => {
      const member = memberById.get(transaction.member_id);
      const employee = getTransactionEmployee(
        transaction,
        member,
        employeeById,
        employeeByFieldCashAccountId,
      );

      if (!matchesEmployeeFilter(employee.employee_id, filters.employeeId)) return undefined;

      return {
        id: transaction.id,
        transaction_id: transaction.id,
        date_key: getDateKey(transaction.transaction_date),
        transaction_date: transaction.transaction_date,
        member_id: transaction.member_id,
        member_number: transaction.member_number,
        member_name: transaction.member_name,
        saving_type: transaction.saving_type,
        withdrawal_source: transaction.withdrawal_source,
        employee_id: employee.employee_id,
        employee_name: employee.employee_name,
        employee_position: employee.employee_position,
        cash_account_code: transaction.cash_account_code,
        cash_account_name: transaction.cash_account_name,
        payment_channel: transaction.payment_channel,
        notes: transaction.notes,
        amount: roundCurrency(Number(transaction.amount || 0)),
      };
    })
    .filter((row): row is CooperativeSavingMovementReportRow => Boolean(row))
    .sort((left, right) => {
      const dateCompare = left.transaction_date.localeCompare(right.transaction_date);
      if (dateCompare !== 0) return dateCompare;
      const employeeCompare = (left.employee_name ?? '').localeCompare(right.employee_name ?? '');
      if (employeeCompare !== 0) return employeeCompare;
      const memberCompare = left.member_number.localeCompare(right.member_number, undefined, { numeric: true });
      if (memberCompare !== 0) return memberCompare;
      return left.transaction_id.localeCompare(right.transaction_id);
    });
  const rowsByDateKey = new Map<string, CooperativeSavingMovementReportRow[]>();

  rows.forEach((row) => {
    const currentRows = rowsByDateKey.get(row.date_key) ?? [];
    currentRows.push(row);
    rowsByDateKey.set(row.date_key, currentRows);
  });

  const groups = Array.from(rowsByDateKey.entries()).map(([dateKey, groupRows]) => ({
    key: dateKey,
    date_key: dateKey,
    rows: groupRows,
    summary: summarizeRows(groupRows),
  }));

  return {
    month_key: monthKey,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    direction: filters.direction,
    saving_type: filters.savingType,
    employee_id: filters.employeeId === COOPERATIVE_SAVING_MOVEMENT_UNASSIGNED_EMPLOYEE
      ? undefined
      : filters.employeeId,
    employeeOptions,
    rows,
    groups,
    summary: summarizeRows(rows),
  };
};
