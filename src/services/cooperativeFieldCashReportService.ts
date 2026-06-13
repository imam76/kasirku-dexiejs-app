import { FINANCE_CATEGORIES } from '@/constants/finance';
import { db } from '@/lib/db';
import {
  getFieldCashAccessScope,
  getCashAccountBalance,
} from '@/services/cooperativeFieldCashService';
import type { CooperativeFieldCashMovementKind, Employee, FinanceTransaction } from '@/types';

export interface CooperativeFieldCashReportFilters {
  fromDate?: string;
  toDate?: string;
  employeeId?: string;
}

export interface CooperativeFieldCashReportRow {
  employee_id: string;
  employee_name: string;
  employee_position?: string;
  cash_account_id: string;
  cash_account_code: string;
  cash_account_name: string;
  dropping_from_finance_amount: number;
  storting_loan_payment_amount: number;
  storting_saving_deposit_amount: number;
  total_storting_amount: number;
  loan_disbursement_amount: number;
  saving_withdrawal_amount: number;
  deposit_to_finance_amount: number;
  balance_amount: number;
  last_movement_at?: string;
}

type FieldCashEmployee = Employee & {
  field_cash_account_id: string;
};

const isInDateRange = (
  transaction: FinanceTransaction,
  filters: CooperativeFieldCashReportFilters,
) => {
  if (filters.fromDate && transaction.created_at < filters.fromDate) return false;
  if (filters.toDate && transaction.created_at > filters.toDate) return false;
  return true;
};

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const matchesMovementKind = (
  transaction: FinanceTransaction,
  kind: CooperativeFieldCashMovementKind,
) => {
  if (transaction.field_cash_movement_kind === kind) return true;

  if (kind === 'DROPPING_FROM_FINANCE') {
    return transaction.category === FINANCE_CATEGORIES.CASH_BANK_TRANSFER &&
      transaction.transfer_direction === 'IN';
  }
  if (kind === 'DEPOSIT_TO_FINANCE') {
    return transaction.category === FINANCE_CATEGORIES.CASH_BANK_TRANSFER &&
      transaction.transfer_direction === 'OUT';
  }
  if (kind === 'STORTING_LOAN_PAYMENT') {
    return transaction.category === FINANCE_CATEGORIES.KSP_LOAN_PAYMENT &&
      transaction.type === 'INCOME';
  }
  if (kind === 'STORTING_SAVING_DEPOSIT') {
    return transaction.category === FINANCE_CATEGORIES.KSP_SAVING_DEPOSIT &&
      transaction.type === 'INCOME';
  }
  if (kind === 'LOAN_DISBURSEMENT') {
    return transaction.category === FINANCE_CATEGORIES.KSP_LOAN_DISBURSEMENT &&
      transaction.type === 'EXPENSE';
  }
  if (kind === 'SAVING_WITHDRAWAL') {
    return transaction.category === FINANCE_CATEGORIES.KSP_SAVING_WITHDRAWAL &&
      transaction.type === 'EXPENSE';
  }

  return false;
};

const sumByKind = (
  transactions: FinanceTransaction[],
  kind: CooperativeFieldCashMovementKind,
) => roundCurrency(
  transactions
    .filter((transaction) => matchesMovementKind(transaction, kind))
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0),
);

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

export const getCooperativeFieldCashReport = async (
  filters: CooperativeFieldCashReportFilters = {},
): Promise<CooperativeFieldCashReportRow[]> => {
  const accessScope = await getFieldCashAccessScope();
  const scopedEmployeeId = accessScope.canViewAll ? filters.employeeId : accessScope.employeeId;

  if (!accessScope.canViewAll && (!scopedEmployeeId || filters.employeeId && filters.employeeId !== scopedEmployeeId)) {
    return [];
  }

  const fieldCashEmployees = await getFieldCashEmployees(scopedEmployeeId);
  const cashAccountIds = fieldCashEmployees.map((employee) => employee.field_cash_account_id);
  const transactions = cashAccountIds.length > 0
    ? await db.financeTransactions
        .where('cash_account_id')
        .anyOf(cashAccountIds)
        .filter((transaction) => !transaction.deleted_at && isInDateRange(transaction, filters))
        .toArray()
    : [];

  const rows = await Promise.all(fieldCashEmployees.map(async (employee): Promise<CooperativeFieldCashReportRow> => {
    const employeeTransactions = transactions.filter((transaction) => (
      transaction.cash_account_id === employee.field_cash_account_id
    ));
    const droppingFromFinance = sumByKind(employeeTransactions, 'DROPPING_FROM_FINANCE');
    const stortingLoanPayment = sumByKind(employeeTransactions, 'STORTING_LOAN_PAYMENT');
    const stortingSavingDeposit = sumByKind(employeeTransactions, 'STORTING_SAVING_DEPOSIT');
    const loanDisbursement = sumByKind(employeeTransactions, 'LOAN_DISBURSEMENT');
    const savingWithdrawal = sumByKind(employeeTransactions, 'SAVING_WITHDRAWAL');
    const depositToFinance = sumByKind(employeeTransactions, 'DEPOSIT_TO_FINANCE');
    const movementDates = employeeTransactions
      .map((transaction) => transaction.created_at)
      .sort();
    const lastMovementAt = movementDates[movementDates.length - 1];

    return {
      employee_id: employee.id,
      employee_name: employee.name,
      employee_position: employee.position,
      cash_account_id: employee.field_cash_account_id,
      cash_account_code: employee.field_cash_account_code ?? '-',
      cash_account_name: employee.field_cash_account_name ?? 'Akun Kas Petugas',
      dropping_from_finance_amount: droppingFromFinance,
      storting_loan_payment_amount: stortingLoanPayment,
      storting_saving_deposit_amount: stortingSavingDeposit,
      total_storting_amount: roundCurrency(stortingLoanPayment + stortingSavingDeposit),
      loan_disbursement_amount: loanDisbursement,
      saving_withdrawal_amount: savingWithdrawal,
      deposit_to_finance_amount: depositToFinance,
      balance_amount: await getCashAccountBalance(employee.field_cash_account_id),
      last_movement_at: lastMovementAt,
    };
  }));

  return rows.sort((left, right) => (
    Math.abs(right.balance_amount) - Math.abs(left.balance_amount) ||
    left.employee_name.localeCompare(right.employee_name)
  ));
};
