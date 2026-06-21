import { FINANCE_CATEGORIES } from '@/constants/finance';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
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
  storting_loan_payment_reversal_amount: number;
  storting_saving_deposit_amount: number;
  storting_saving_deposit_reversal_amount: number;
  total_storting_amount: number;
  loan_disbursement_amount: number;
  saving_withdrawal_amount: number;
  saving_withdrawal_reversal_amount: number;
  iptw_payout_amount: number;
  iptw_payout_reversal_amount: number;
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
  const transactionDate = dayjs(transaction.created_at);
  if (filters.fromDate && transactionDate.isBefore(dayjs(filters.fromDate))) return false;
  if (filters.toDate && transactionDate.isAfter(dayjs(filters.toDate))) return false;
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
    return transaction.category === FINANCE_CATEGORIES.KSP_LOAN_PAYMENT;
  }
  if (kind === 'STORTING_SAVING_DEPOSIT') {
    return transaction.category === FINANCE_CATEGORIES.KSP_SAVING_DEPOSIT;
  }
  if (kind === 'LOAN_DISBURSEMENT') {
    return transaction.category === FINANCE_CATEGORIES.KSP_LOAN_DISBURSEMENT;
  }
  if (kind === 'SAVING_WITHDRAWAL') {
    return transaction.category === FINANCE_CATEGORIES.KSP_SAVING_WITHDRAWAL;
  }
  if (kind === 'IPTW_PAYOUT') {
    return transaction.category === FINANCE_CATEGORIES.KSP_IPTW;
  }

  return false;
};

const sumByKind = (
  transactions: FinanceTransaction[],
  kind: CooperativeFieldCashMovementKind,
  type: FinanceTransaction['type'],
) => roundCurrency(
  transactions
    .filter((transaction) => (
      matchesMovementKind(transaction, kind) &&
      transaction.type === type
    ))
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
    const droppingFromFinance = sumByKind(employeeTransactions, 'DROPPING_FROM_FINANCE', 'INCOME');
    const stortingLoanPayment = sumByKind(employeeTransactions, 'STORTING_LOAN_PAYMENT', 'INCOME');
    const stortingLoanPaymentReversal = sumByKind(employeeTransactions, 'STORTING_LOAN_PAYMENT', 'EXPENSE');
    const stortingSavingDeposit = sumByKind(employeeTransactions, 'STORTING_SAVING_DEPOSIT', 'INCOME');
    const stortingSavingDepositReversal = sumByKind(employeeTransactions, 'STORTING_SAVING_DEPOSIT', 'EXPENSE');
    const loanDisbursement = sumByKind(employeeTransactions, 'LOAN_DISBURSEMENT', 'EXPENSE');
    const savingWithdrawal = sumByKind(employeeTransactions, 'SAVING_WITHDRAWAL', 'EXPENSE');
    const savingWithdrawalReversal = sumByKind(employeeTransactions, 'SAVING_WITHDRAWAL', 'INCOME');
    const iptwPayout = sumByKind(employeeTransactions, 'IPTW_PAYOUT', 'EXPENSE');
    const iptwPayoutReversal = sumByKind(employeeTransactions, 'IPTW_PAYOUT', 'INCOME');
    const depositToFinance = sumByKind(employeeTransactions, 'DEPOSIT_TO_FINANCE', 'EXPENSE');
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
      storting_loan_payment_reversal_amount: stortingLoanPaymentReversal,
      storting_saving_deposit_amount: stortingSavingDeposit,
      storting_saving_deposit_reversal_amount: stortingSavingDepositReversal,
      total_storting_amount: roundCurrency(stortingLoanPayment + stortingSavingDeposit),
      loan_disbursement_amount: loanDisbursement,
      saving_withdrawal_amount: savingWithdrawal,
      saving_withdrawal_reversal_amount: savingWithdrawalReversal,
      iptw_payout_amount: iptwPayout,
      iptw_payout_reversal_amount: iptwPayoutReversal,
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
