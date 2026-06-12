import { db } from '@/lib/db';
import {
  buildFieldCashSessionReconciliation,
  requireFieldCashView,
} from '@/services/cooperativeFieldCashService';
import type { CooperativeFieldCashSession } from '@/types';

export interface CooperativeFieldCashReportFilters {
  fromDate?: string;
  toDate?: string;
  employeeId?: string;
  status?: CooperativeFieldCashSession['status'] | 'ALL';
}

export interface CooperativeFieldCashReportRow {
  session_id: string;
  session_number: string;
  status: CooperativeFieldCashSession['status'];
  employee_id: string;
  employee_name: string;
  employee_position?: string;
  cash_account_id: string;
  cash_account_code: string;
  cash_account_name: string;
  opened_at: string;
  closed_at?: string;
  opening_cash_amount: number;
  dropping_from_finance_amount: number;
  storting_loan_payment_amount: number;
  storting_saving_deposit_amount: number;
  total_storting_amount: number;
  loan_disbursement_amount: number;
  saving_withdrawal_amount: number;
  deposit_to_finance_amount: number;
  expected_closing_cash_amount: number;
  closing_cash_amount?: number;
  closing_difference_amount?: number;
  balance_status?: CooperativeFieldCashSession['balance_status'];
}

const isInDateRange = (
  session: CooperativeFieldCashSession,
  filters: CooperativeFieldCashReportFilters,
) => {
  if (filters.fromDate && session.opened_at < filters.fromDate) return false;
  if (filters.toDate && session.opened_at > filters.toDate) return false;
  return true;
};

export const getCooperativeFieldCashSessionReport = async (
  filters: CooperativeFieldCashReportFilters = {},
): Promise<CooperativeFieldCashReportRow[]> => {
  await requireFieldCashView();

  const sessions = await db.cooperativeFieldCashSessions
    .orderBy('opened_at')
    .reverse()
    .toArray();
  const filteredSessions = sessions.filter((session) => {
    const matchesEmployee = !filters.employeeId || session.employee_id === filters.employeeId;
    const matchesStatus = !filters.status || filters.status === 'ALL' || session.status === filters.status;
    return matchesEmployee && matchesStatus && isInDateRange(session, filters);
  });

  const rows = await Promise.all(filteredSessions.map(async (session): Promise<CooperativeFieldCashReportRow> => {
    const reconciliation = await buildFieldCashSessionReconciliation(session.id);

    return {
      session_id: session.id,
      session_number: session.session_number,
      status: session.status,
      employee_id: session.employee_id,
      employee_name: session.employee_name,
      employee_position: session.employee_position,
      cash_account_id: session.cash_account_id,
      cash_account_code: session.cash_account_code,
      cash_account_name: session.cash_account_name,
      opened_at: session.opened_at,
      closed_at: session.closed_at,
      opening_cash_amount: session.opening_cash_amount,
      dropping_from_finance_amount: reconciliation.dropping_from_finance_amount,
      storting_loan_payment_amount: reconciliation.storting_loan_payment_amount,
      storting_saving_deposit_amount: reconciliation.storting_saving_deposit_amount,
      total_storting_amount: reconciliation.total_storting_amount,
      loan_disbursement_amount: reconciliation.loan_disbursement_amount,
      saving_withdrawal_amount: reconciliation.saving_withdrawal_amount,
      deposit_to_finance_amount: reconciliation.deposit_to_finance_amount,
      expected_closing_cash_amount: reconciliation.expected_closing_cash_amount,
      closing_cash_amount: session.closing_cash_amount,
      closing_difference_amount: session.closing_difference_amount,
      balance_status: session.balance_status,
    };
  }));

  return rows;
};
