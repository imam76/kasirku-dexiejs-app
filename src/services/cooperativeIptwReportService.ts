import { getCurrentSessionUser, requireUserPermission } from '@/auth/authService';
import { FINANCE_CATEGORIES } from '@/constants/finance';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import type {
  CooperativeLoanPayment,
  CooperativeMember,
  Employee,
  FinanceTransaction,
} from '@/types';
import { roundCurrency } from '@/utils/koperasi/loanSchedule';

export const COOPERATIVE_IPTW_UNASSIGNED_EMPLOYEE = '__UNASSIGNED__';

export interface CooperativeIptwReportFilters {
  monthDate?: string;
}

export interface CooperativeIptwReportEmployeeColumn {
  id: string;
  name: string;
  position?: string;
}

export interface CooperativeIptwReportRow {
  id: string;
  date_key: string;
  event_date: string;
  member_id: string;
  member_number: string;
  member_name: string;
  member_address?: string;
  employee_amounts: Record<string, number>;
  total_amount: number;
}

export interface CooperativeIptwReportData {
  month_key: string;
  start_date: string;
  end_date: string;
  rows: CooperativeIptwReportRow[];
  employee_columns: CooperativeIptwReportEmployeeColumn[];
  employee_totals: Record<string, number>;
  total_amount: number;
}

type IptwEntry = {
  transaction: FinanceTransaction;
  payment?: CooperativeLoanPayment;
  employee: CooperativeIptwReportEmployeeColumn;
  amount: number;
};

const getMonthRange = (monthDate?: string) => {
  const selectedMonth = monthDate ? dayjs(monthDate).tz() : dayjs().tz();
  const monthStart = selectedMonth.startOf('month');
  const monthEnd = selectedMonth.endOf('month');

  return {
    monthKey: monthStart.format('YYYY-MM'),
    monthStart,
    monthEnd,
  };
};

const getDateKey = (value: string) => dayjs(value).tz().format('YYYY-MM-DD');

const compareText = (left?: string, right?: string) => (
  (left ?? '').localeCompare(right ?? '', undefined, { numeric: true })
);

const isTransactionInRange = (
  transaction: FinanceTransaction,
  startDateKey: string,
  endDateKey: string,
) => {
  const transactionDateKey = getDateKey(transaction.created_at);
  return transactionDateKey >= startDateKey && transactionDateKey <= endDateKey;
};

const getPayoutTransaction = (
  transaction: FinanceTransaction,
  transactionById: Map<string, FinanceTransaction>,
) => {
  if (transaction.type === 'EXPENSE') return transaction;
  if (!transaction.reference_id) return undefined;

  return transactionById.get(transaction.reference_id);
};

const getEmployeeForEntry = (
  transaction: FinanceTransaction,
  payoutTransaction: FinanceTransaction,
  payment: CooperativeLoanPayment | undefined,
  employeeById: Map<string, Employee>,
  employeeByCashAccountId: Map<string, Employee>,
): CooperativeIptwReportEmployeeColumn => {
  const employeeId = transaction.field_employee_id
    ?? payoutTransaction.field_employee_id
    ?? employeeByCashAccountId.get(
      transaction.cash_account_id ?? payoutTransaction.cash_account_id ?? '',
    )?.id
    ?? payment?.collector_id;
  const employee = employeeId ? employeeById.get(employeeId) : undefined;

  if (!employeeId) {
    return {
      id: COOPERATIVE_IPTW_UNASSIGNED_EMPLOYEE,
      name: 'Tanpa Karyawan',
    };
  }

  return {
    id: employeeId,
    name: employee?.name
      ?? transaction.field_employee_name
      ?? payoutTransaction.field_employee_name
      ?? payment?.collector_name
      ?? employeeId,
    position: employee?.position ?? payment?.collector_position,
  };
};

export const getCooperativeIptwReport = async (
  filters: CooperativeIptwReportFilters = {},
): Promise<CooperativeIptwReportData> => {
  await requireUserPermission(
    await getCurrentSessionUser(),
    'COOPERATIVE_IPTW_REPORT_VIEW',
  );

  const { monthKey, monthStart, monthEnd } = getMonthRange(filters.monthDate);
  const startDateKey = monthStart.format('YYYY-MM-DD');
  const endDateKey = monthEnd.format('YYYY-MM-DD');
  const [allIptwTransactions, employees] = await Promise.all([
    db.financeTransactions
      .where('category')
      .equals(FINANCE_CATEGORIES.KSP_IPTW)
      .filter((transaction) => !transaction.deleted_at)
      .toArray(),
    db.employees.orderBy('name').toArray(),
  ]);
  const transactionById = new Map(
    allIptwTransactions.map((transaction) => [transaction.id, transaction]),
  );
  const periodTransactions = allIptwTransactions.filter((transaction) => (
    (transaction.type === 'EXPENSE' || transaction.type === 'INCOME')
    && isTransactionInRange(transaction, startDateKey, endDateKey)
  ));
  const payoutByTransactionId = new Map<string, FinanceTransaction>();
  const paymentIds = new Set<string>();

  periodTransactions.forEach((transaction) => {
    const payoutTransaction = getPayoutTransaction(transaction, transactionById);
    if (!payoutTransaction?.reference_id) return;

    payoutByTransactionId.set(transaction.id, payoutTransaction);
    paymentIds.add(payoutTransaction.reference_id);
  });

  const payments = await db.cooperativeLoanPayments.bulkGet(Array.from(paymentIds));
  const paymentById = new Map(
    payments
      .filter((payment): payment is CooperativeLoanPayment => Boolean(payment))
      .map((payment) => [payment.id, payment]),
  );
  const memberIds = Array.from(new Set(
    payments
      .filter((payment): payment is CooperativeLoanPayment => Boolean(payment))
      .map((payment) => payment.member_id),
  ));
  const members = await db.cooperativeMembers.bulkGet(memberIds);
  const memberById = new Map(
    members
      .filter((member): member is CooperativeMember => Boolean(member))
      .map((member) => [member.id, member]),
  );
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const employeeByCashAccountId = new Map(
    employees
      .filter((employee) => employee.field_cash_account_id)
      .map((employee) => [employee.field_cash_account_id!, employee]),
  );
  const entries: IptwEntry[] = periodTransactions.flatMap((transaction) => {
    const payoutTransaction = payoutByTransactionId.get(transaction.id);
    if (!payoutTransaction?.reference_id) return [];

    const payment = paymentById.get(payoutTransaction.reference_id);
    const employee = getEmployeeForEntry(
      transaction,
      payoutTransaction,
      payment,
      employeeById,
      employeeByCashAccountId,
    );

    return [{
      transaction,
      payment,
      employee,
      amount: roundCurrency(
        transaction.type === 'INCOME' ? -transaction.amount : transaction.amount,
      ),
    }];
  });
  const employeeColumnById = new Map<string, CooperativeIptwReportEmployeeColumn>();

  employees
    .filter((employee) => employee.field_cash_account_id)
    .forEach((employee) => {
      employeeColumnById.set(employee.id, {
        id: employee.id,
        name: employee.name,
        position: employee.position,
      });
    });
  entries.forEach((entry) => employeeColumnById.set(entry.employee.id, entry.employee));

  const rowsByKey = new Map<string, CooperativeIptwReportRow>();

  entries.forEach(({ transaction, payment, employee, amount }) => {
    const eventDate = transaction.created_at;
    const dateKey = getDateKey(eventDate);
    const memberId = payment?.member_id ?? `unknown:${transaction.id}`;
    const member = payment?.member_id ? memberById.get(payment.member_id) : undefined;
    const rowKey = `${dateKey}:${memberId}`;
    const current = rowsByKey.get(rowKey) ?? {
      id: rowKey,
      date_key: dateKey,
      event_date: eventDate,
      member_id: memberId,
      member_number: payment?.member_number ?? '-',
      member_name: payment?.member_name ?? '-',
      member_address: member?.address,
      employee_amounts: {},
      total_amount: 0,
    };

    current.employee_amounts[employee.id] = roundCurrency(
      (current.employee_amounts[employee.id] ?? 0) + amount,
    );
    current.total_amount = roundCurrency(current.total_amount + amount);
    rowsByKey.set(rowKey, current);
  });

  const rows = Array.from(rowsByKey.values())
    .filter((row) => Object.values(row.employee_amounts)
      .some((amount) => Math.abs(amount) > 0.01))
    .sort((left, right) => {
      const dateCompare = left.date_key.localeCompare(right.date_key);
      if (dateCompare !== 0) return dateCompare;
      return compareText(left.member_number, right.member_number);
    });
  const employeeColumns = Array.from(employeeColumnById.values())
    .sort((left, right) => {
      if (left.id === COOPERATIVE_IPTW_UNASSIGNED_EMPLOYEE) return 1;
      if (right.id === COOPERATIVE_IPTW_UNASSIGNED_EMPLOYEE) return -1;
      return compareText(left.name, right.name);
    });
  const employeeTotals = Object.fromEntries(
    employeeColumns.map((employee) => [
      employee.id,
      roundCurrency(rows.reduce(
        (total, row) => total + (row.employee_amounts[employee.id] ?? 0),
        0,
      )),
    ]),
  );

  return {
    month_key: monthKey,
    start_date: monthStart.toISOString(),
    end_date: monthEnd.toISOString(),
    rows,
    employee_columns: employeeColumns,
    employee_totals: employeeTotals,
    total_amount: roundCurrency(rows.reduce((total, row) => total + row.total_amount, 0)),
  };
};
