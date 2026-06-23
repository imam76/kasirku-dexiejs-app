import { FINANCE_CATEGORIES } from '@/constants/finance';
import { db } from '@/lib/db';
import { getFieldCashAccessScope } from '@/services/cooperativeFieldCashService';
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

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const sumSessionCashNet = (transactions: FinanceTransaction[]) => roundCurrency(
  transactions.reduce((sum, transaction) => {
    if (transaction.type === 'INCOME' || transaction.type === 'OPENING_BALANCE') {
      return sum + Number(transaction.amount || 0);
    }
    if (transaction.type === 'EXPENSE') {
      return sum - Number(transaction.amount || 0);
    }
    return sum;
  }, 0),
);

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
    return (
      transaction.category === FINANCE_CATEGORIES.KSP_SAVING_WITHDRAWAL ||
      transaction.category === FINANCE_CATEGORIES.KSP_SAVING_INTEREST_PAYOUT
    );
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

  // Dashboard hanya mencerminkan sesi kas yang sedang OPEN: buka sesi mulai dari nol,
  // tutup sesi mengembalikan seluruh angka ke nol. Riwayat sesi tertutup dilihat terpisah.
  const employeeIds = fieldCashEmployees.map((employee) => employee.id);
  const openSessions = employeeIds.length > 0
    ? await db.cooperativeFieldCashSessions
        .where('status')
        .equals('OPEN')
        .filter((session) => employeeIds.includes(session.employee_id))
        .toArray()
    : [];
  const sessionByEmployee = new Map(openSessions.map((session) => [session.employee_id, session]));
  const sessionIds = openSessions.map((session) => session.id);
  const transactions = sessionIds.length > 0
    ? await db.financeTransactions
        .where('field_cash_session_id')
        .anyOf(sessionIds)
        .filter((transaction) => !transaction.deleted_at)
        .toArray()
    : [];

  const rows = fieldCashEmployees.map((employee): CooperativeFieldCashReportRow => {
    const session = sessionByEmployee.get(employee.id);
    const sessionTransactions = session
      ? transactions.filter((transaction) => transaction.field_cash_session_id === session.id)
      : [];
    const droppingFromFinance = sumByKind(sessionTransactions, 'DROPPING_FROM_FINANCE', 'INCOME');
    const stortingLoanPayment = sumByKind(sessionTransactions, 'STORTING_LOAN_PAYMENT', 'INCOME');
    const stortingLoanPaymentReversal = sumByKind(sessionTransactions, 'STORTING_LOAN_PAYMENT', 'EXPENSE');
    const stortingSavingDeposit = sumByKind(sessionTransactions, 'STORTING_SAVING_DEPOSIT', 'INCOME');
    const stortingSavingDepositReversal = sumByKind(sessionTransactions, 'STORTING_SAVING_DEPOSIT', 'EXPENSE');
    const loanDisbursement = sumByKind(sessionTransactions, 'LOAN_DISBURSEMENT', 'EXPENSE');
    const savingWithdrawal = sumByKind(sessionTransactions, 'SAVING_WITHDRAWAL', 'EXPENSE');
    const savingWithdrawalReversal = sumByKind(sessionTransactions, 'SAVING_WITHDRAWAL', 'INCOME');
    const iptwPayout = sumByKind(sessionTransactions, 'IPTW_PAYOUT', 'EXPENSE');
    const iptwPayoutReversal = sumByKind(sessionTransactions, 'IPTW_PAYOUT', 'INCOME');
    const depositToFinance = sumByKind(sessionTransactions, 'DEPOSIT_TO_FINANCE', 'EXPENSE');
    const movementDates = sessionTransactions
      .map((transaction) => transaction.created_at)
      .sort();
    const lastMovementAt = session ? movementDates[movementDates.length - 1] : undefined;
    const balanceAmount = session
      ? roundCurrency(Number(session.opening_cash_amount || 0) + sumSessionCashNet(sessionTransactions))
      : 0;

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
      balance_amount: balanceAmount,
      last_movement_at: lastMovementAt,
    };
  });

  return rows.sort((left, right) => (
    Math.abs(right.balance_amount) - Math.abs(left.balance_amount) ||
    left.employee_name.localeCompare(right.employee_name)
  ));
};
