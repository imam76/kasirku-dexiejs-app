import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import {
  getFieldCashAccessScope,
  getCashAccountBalance,
} from '@/services/cooperativeFieldCashService';
import {
  sumByKind,
} from '@/services/cooperativeFieldCashReportService';
import type { Employee, EmployeeArea, FinanceTransaction, CooperativeMember } from '@/types';
import { getCurrentSessionUser, requireUserPermission } from '@/auth/authService';

export const COOPERATIVE_DAILY_FIELD_CASH_UNASSIGNED_EMPLOYEE = '__UNASSIGNED__';

export interface CooperativeDailyFieldCashReportFilters {
  fromDate?: string;
  toDate?: string;
  employeeId?: string;
}

export interface CooperativeDailyFieldCashReportRow {
  id: string;
  date_key: string;
  employee_id: string;
  employee_name: string;
  employee_position?: string;
  storting_loan_payment_amount: number;
  storting_saving_deposit_amount: number;
  loan_disbursement_amount: number;
  saving_withdrawal_amount: number;
  iptw_payout_amount: number;
  dropping_from_finance_amount: number;
  deposit_to_finance_amount: number;
  net_cash_amount: number;
}

export interface CooperativeDailyFieldCashReportSummary {
  row_count: number;
  storting_loan_payment_amount: number;
  storting_saving_deposit_amount: number;
  loan_disbursement_amount: number;
  saving_withdrawal_amount: number;
  iptw_payout_amount: number;
  dropping_from_finance_amount: number;
  deposit_to_finance_amount: number;
  net_cash_amount: number;
}

export interface CooperativeDailyFieldCashEmployeeOption {
  id: string;
  name: string;
  position?: string;
}

export interface CooperativeDailyFieldCashReportGroup {
  key: string;
  employee_id: string;
  employee_name: string;
  employee_position?: string;
  area_names: string[];
  cash_account_id: string;
  cash_account_balance: number;
  rows: CooperativeDailyFieldCashReportRow[];
  summary: CooperativeDailyFieldCashReportSummary;
}

export interface CooperativeDailyFieldCashReport {
  from_date: string;
  to_date: string;
  employee_id?: string;
  employee_name?: string;
  employee_position?: string;
  employeeOptions: CooperativeDailyFieldCashEmployeeOption[];
  groups: CooperativeDailyFieldCashReportGroup[];
  summary: CooperativeDailyFieldCashReportSummary;
}

type FieldCashEmployee = Employee & {
  field_cash_account_id: string;
};

const DATE_KEY_FORMAT = 'YYYY-MM-DD';

export const createEmptyCooperativeDailyFieldCashReportSummary = (): CooperativeDailyFieldCashReportSummary => ({
  row_count: 0,
  storting_loan_payment_amount: 0,
  storting_saving_deposit_amount: 0,
  loan_disbursement_amount: 0,
  saving_withdrawal_amount: 0,
  iptw_payout_amount: 0,
  dropping_from_finance_amount: 0,
  deposit_to_finance_amount: 0,
  net_cash_amount: 0,
});

const getDateKey = (value: string) => dayjs(value).tz().format(DATE_KEY_FORMAT);

const getMonthRange = (fromDate?: string, toDate?: string) => {
  const selectedFrom = fromDate ? dayjs(fromDate).tz() : dayjs().tz().startOf('month');
  const selectedTo = toDate ? dayjs(toDate).tz() : dayjs().tz().endOf('month');

  return {
    startDate: selectedFrom.startOf('day'),
    endDate: selectedTo.endOf('day'),
  };
};

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
  left?: Pick<CooperativeDailyFieldCashEmployeeOption, 'name' | 'position'>,
  right?: Pick<CooperativeDailyFieldCashEmployeeOption, 'name' | 'position'>,
) => {
  const leftLabel = left?.position ? `${left.name} ${left.position}` : left?.name ?? '';
  const rightLabel = right?.position ? `${right.name} ${right.position}` : right?.name ?? '';

  return leftLabel.localeCompare(rightLabel, undefined, { numeric: true });
};

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const getFieldCashEmployees = async (
  employeeId?: string,
): Promise<FieldCashEmployee[]> => {
  const employees = await db.employees.orderBy('name').toArray();

  return employees.filter((employee): employee is FieldCashEmployee => (
    employee.is_active &&
    Boolean(employee.field_cash_account_id) &&
    (!employeeId || employee.id === employeeId)
  ));
};

const summarizeRows = (
  rows: CooperativeDailyFieldCashReportRow[],
): CooperativeDailyFieldCashReportSummary => rows.reduce((summary, row) => ({
  row_count: summary.row_count + 1,
  storting_loan_payment_amount: roundCurrency(summary.storting_loan_payment_amount + row.storting_loan_payment_amount),
  storting_saving_deposit_amount: roundCurrency(summary.storting_saving_deposit_amount + row.storting_saving_deposit_amount),
  loan_disbursement_amount: roundCurrency(summary.loan_disbursement_amount + row.loan_disbursement_amount),
  saving_withdrawal_amount: roundCurrency(summary.saving_withdrawal_amount + row.saving_withdrawal_amount),
  iptw_payout_amount: roundCurrency(summary.iptw_payout_amount + row.iptw_payout_amount),
  dropping_from_finance_amount: roundCurrency(summary.dropping_from_finance_amount + row.dropping_from_finance_amount),
  deposit_to_finance_amount: roundCurrency(summary.deposit_to_finance_amount + row.deposit_to_finance_amount),
  net_cash_amount: roundCurrency(summary.net_cash_amount + row.net_cash_amount),
}), createEmptyCooperativeDailyFieldCashReportSummary());

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

export const getCooperativeDailyFieldCashReport = async (
  filters: CooperativeDailyFieldCashReportFilters = {},
): Promise<CooperativeDailyFieldCashReport> => {
  const user = await getCurrentSessionUser();
  await requireUserPermission(user, 'COOPERATIVE_CASH_REPORT_VIEW');
  const accessScope = await getFieldCashAccessScope();
  
  let scopedEmployeeId = accessScope.canViewAll ? filters.employeeId : accessScope.employeeId;
  if (!accessScope.canViewAll && (!scopedEmployeeId || (filters.employeeId && filters.employeeId !== scopedEmployeeId))) {
    scopedEmployeeId = 'UNAUTHORIZED';
  }

  const { startDate, endDate } = getMonthRange(filters.fromDate, filters.toDate);
  const startDateKey = startDate.format(DATE_KEY_FORMAT);
  const endDateKey = endDate.format(DATE_KEY_FORMAT);

  const [members, employeeAreas] = await Promise.all([
    db.cooperativeMembers.orderBy('member_number').toArray(),
    db.employeeAreas.orderBy('employee_id').toArray(),
  ]);

  const fieldCashEmployees = await getFieldCashEmployees(scopedEmployeeId === 'UNAUTHORIZED' ? undefined : scopedEmployeeId);
  if (scopedEmployeeId === 'UNAUTHORIZED') {
     fieldCashEmployees.length = 0;
  }
  
  const cashAccountIds = fieldCashEmployees.map((employee) => employee.field_cash_account_id);
  const transactions = cashAccountIds.length > 0
    ? await db.financeTransactions
        .where('cash_account_id')
        .anyOf(cashAccountIds)
        .filter((transaction) => !transaction.deleted_at && isDateKeyInRange(transaction.created_at, startDateKey, endDateKey))
        .toArray()
    : [];

  const employeeOptions: CooperativeDailyFieldCashEmployeeOption[] = fieldCashEmployees.map(e => ({
    id: e.id,
    name: e.name,
    position: e.position
  })).sort(compareEmployeeLabel);

  const selectedEmployee = filters.employeeId && filters.employeeId !== COOPERATIVE_DAILY_FIELD_CASH_UNASSIGNED_EMPLOYEE
    ? employeeOptions.find((employee) => employee.id === filters.employeeId)
    : undefined;

  const areaNamesByEmployeeId = buildAreaNamesByEmployeeId(employeeAreas, members);
  const rows: CooperativeDailyFieldCashReportRow[] = [];

  for (const employee of fieldCashEmployees) {
    const employeeTransactions = transactions.filter(t => t.cash_account_id === employee.field_cash_account_id);
    
    // Group transactions by date
    const transactionsByDate = new Map<string, FinanceTransaction[]>();
    employeeTransactions.forEach(t => {
      const dateKey = getDateKey(t.created_at);
      const current = transactionsByDate.get(dateKey) || [];
      current.push(t);
      transactionsByDate.set(dateKey, current);
    });

    const dates = Array.from(transactionsByDate.keys()).sort();

    dates.forEach(dateKey => {
      const dayTransactions = transactionsByDate.get(dateKey) || [];
      
      const droppingFromFinance = sumByKind(dayTransactions, 'DROPPING_FROM_FINANCE', 'INCOME');
      
      const stortingLoanPayment = sumByKind(dayTransactions, 'STORTING_LOAN_PAYMENT', 'INCOME');
      const stortingLoanPaymentReversal = sumByKind(dayTransactions, 'STORTING_LOAN_PAYMENT', 'EXPENSE');
      
      const stortingSavingDeposit = sumByKind(dayTransactions, 'STORTING_SAVING_DEPOSIT', 'INCOME');
      const stortingSavingDepositReversal = sumByKind(dayTransactions, 'STORTING_SAVING_DEPOSIT', 'EXPENSE');
      
      const loanDisbursement = sumByKind(dayTransactions, 'LOAN_DISBURSEMENT', 'EXPENSE');
      const loanDisbursementReversal = sumByKind(dayTransactions, 'LOAN_DISBURSEMENT', 'INCOME');
      
      const savingWithdrawal = sumByKind(dayTransactions, 'SAVING_WITHDRAWAL', 'EXPENSE');
      const savingWithdrawalReversal = sumByKind(dayTransactions, 'SAVING_WITHDRAWAL', 'INCOME');
      
      const iptwPayout = sumByKind(dayTransactions, 'IPTW_PAYOUT', 'EXPENSE');
      const iptwPayoutReversal = sumByKind(dayTransactions, 'IPTW_PAYOUT', 'INCOME');
      
      const depositToFinance = sumByKind(dayTransactions, 'DEPOSIT_TO_FINANCE', 'EXPENSE');

      const netStortingLoanPayment = roundCurrency(stortingLoanPayment - stortingLoanPaymentReversal);
      const netStortingSavingDeposit = roundCurrency(stortingSavingDeposit - stortingSavingDepositReversal);
      const netLoanDisbursement = roundCurrency(loanDisbursement - loanDisbursementReversal);
      const netSavingWithdrawal = roundCurrency(savingWithdrawal - savingWithdrawalReversal);
      const netIptwPayout = roundCurrency(iptwPayout - iptwPayoutReversal);

      const netCashAmount = roundCurrency(
        netStortingLoanPayment + 
        netStortingSavingDeposit + 
        droppingFromFinance - 
        netLoanDisbursement -
        netSavingWithdrawal - 
        netIptwPayout - 
        depositToFinance
      );

      rows.push({
        id: `${dateKey}:${employee.id}`,
        date_key: dateKey,
        employee_id: employee.id,
        employee_name: employee.name,
        employee_position: employee.position,
        storting_loan_payment_amount: netStortingLoanPayment,
        storting_saving_deposit_amount: netStortingSavingDeposit,
        loan_disbursement_amount: netLoanDisbursement,
        saving_withdrawal_amount: netSavingWithdrawal,
        iptw_payout_amount: netIptwPayout,
        dropping_from_finance_amount: droppingFromFinance,
        deposit_to_finance_amount: depositToFinance,
        net_cash_amount: netCashAmount,
      });
    });
  }

  const rowsByEmployeeId = new Map<string, CooperativeDailyFieldCashReportRow[]>();
  rows.forEach((row) => {
    const currentRows = rowsByEmployeeId.get(row.employee_id) ?? [];
    currentRows.push(row);
    rowsByEmployeeId.set(row.employee_id, currentRows);
  });

  const groups = await Promise.all(
    fieldCashEmployees
      .filter(employee => rowsByEmployeeId.has(employee.id) || filters.employeeId === employee.id || !filters.employeeId)
      .map(async (employee): Promise<CooperativeDailyFieldCashReportGroup> => {
        const groupRows = (rowsByEmployeeId.get(employee.id) || []).sort((a, b) => a.date_key.localeCompare(b.date_key));
        
        return {
          key: employee.id,
          employee_id: employee.id,
          employee_name: employee.name,
          employee_position: employee.position,
          area_names: areaNamesByEmployeeId.get(employee.id) ?? [],
          cash_account_id: employee.field_cash_account_id,
          cash_account_balance: await getCashAccountBalance(employee.field_cash_account_id),
          rows: groupRows,
          summary: summarizeRows(groupRows),
        };
      })
  );

  const sortedGroups = groups.sort((left, right) => compareEmployeeLabel(
    { name: left.employee_name, position: left.employee_position },
    { name: right.employee_name, position: right.employee_position }
  ));

  return {
    from_date: startDate.toISOString(),
    to_date: endDate.toISOString(),
    employee_id: filters.employeeId === COOPERATIVE_DAILY_FIELD_CASH_UNASSIGNED_EMPLOYEE
      ? undefined
      : selectedEmployee?.id,
    employee_name: selectedEmployee?.name,
    employee_position: selectedEmployee?.position,
    employeeOptions,
    groups: sortedGroups,
    summary: summarizeRows(rows),
  };
};
