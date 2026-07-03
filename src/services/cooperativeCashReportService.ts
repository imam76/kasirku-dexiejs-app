import dayjs from '@/lib/dayjs';
import {
  getCooperativeFieldCashReport,
  type CooperativeFieldCashReportRow,
} from '@/services/cooperativeFieldCashReportService';
import { roundCurrency } from '@/utils/koperasi/loanSchedule';
import { getCurrentSessionUser, requireUserPermission } from '@/auth/authService';

export type CooperativeCashReportRowKey = 'STORTING' | 'DROP' | 'TABUNGAN' | 'IPTW';

export interface CooperativeCashReportFilters {
  date?: string;
  employeeId?: string;
}

export interface CooperativeCashReportEmployeeOption {
  id: string;
  name: string;
  code: string;
  position?: string;
}

export interface CooperativeCashReportRow {
  key: CooperativeCashReportRowKey;
  incoming_amount: number;
  outgoing_amount: number;
}

export interface CooperativeCashReportEmployee {
  employee_id: string;
  employee_name: string;
  employee_code: string;
  employee_position?: string;
  rows: CooperativeCashReportRow[];
  total_incoming_amount: number;
  total_outgoing_amount: number;
  total_balance_amount: number;
}

export interface CooperativeCashReportSummary {
  total_incoming_amount: number;
  total_outgoing_amount: number;
  total_balance_amount: number;
}

export interface CooperativeCashReport {
  date_key: string;
  employee_id?: string;
  employeeOptions: CooperativeCashReportEmployeeOption[];
  employees: CooperativeCashReportEmployee[];
  summary: CooperativeCashReportSummary;
}

export const createCooperativeCashReportEmployee = (
  source: CooperativeFieldCashReportRow,
): CooperativeCashReportEmployee => {
  const rows: CooperativeCashReportRow[] = [
    {
      key: 'STORTING',
      incoming_amount: source.storting_loan_payment_amount,
      outgoing_amount: source.storting_loan_payment_reversal_amount,
    },
    {
      key: 'DROP',
      incoming_amount: source.dropping_from_finance_amount,
      outgoing_amount: roundCurrency(
        source.deposit_to_finance_amount +
        source.loan_disbursement_amount,
      ),
    },
    {
      key: 'TABUNGAN',
      incoming_amount: roundCurrency(
        source.storting_saving_deposit_amount +
        source.saving_withdrawal_reversal_amount,
      ),
      outgoing_amount: roundCurrency(
        source.saving_withdrawal_amount +
        source.storting_saving_deposit_reversal_amount,
      ),
    },
    {
      key: 'IPTW',
      incoming_amount: source.iptw_payout_reversal_amount,
      outgoing_amount: source.iptw_payout_amount,
    },
  ];
  const totalIncoming = roundCurrency(
    rows.reduce((sum, row) => sum + Number(row.incoming_amount || 0), 0),
  );
  const totalOutgoing = roundCurrency(
    rows.reduce((sum, row) => sum + Number(row.outgoing_amount || 0), 0),
  );

  return {
    employee_id: source.employee_id,
    employee_name: source.employee_name,
    employee_code: source.cash_account_code,
    employee_position: source.employee_position,
    rows,
    total_incoming_amount: totalIncoming,
    total_outgoing_amount: totalOutgoing,
    total_balance_amount: roundCurrency(totalIncoming - totalOutgoing),
  };
};

export const getCooperativeCashReport = async (
  filters: CooperativeCashReportFilters = {},
): Promise<CooperativeCashReport> => {
  await requireUserPermission(await getCurrentSessionUser(), 'COOPERATIVE_CASH_REPORT_VIEW');
  const selectedDate = filters.date ? dayjs(filters.date).tz() : dayjs().tz();
  const dateKey = selectedDate.format('YYYY-MM-DD');
  const sourceRows = await getCooperativeFieldCashReport({
    fromDate: selectedDate.startOf('day').toISOString(),
    toDate: selectedDate.endOf('day').toISOString(),
  });
  const employeeOptions = sourceRows.map((row) => ({
    id: row.employee_id,
    name: row.employee_name,
    code: row.cash_account_code,
    position: row.employee_position,
  }));
  const employees = sourceRows
    .filter((row) => !filters.employeeId || row.employee_id === filters.employeeId)
    .map(createCooperativeCashReportEmployee);
  const summary = employees.reduce<CooperativeCashReportSummary>((result, employee) => ({
    total_incoming_amount: roundCurrency(
      result.total_incoming_amount + employee.total_incoming_amount,
    ),
    total_outgoing_amount: roundCurrency(
      result.total_outgoing_amount + employee.total_outgoing_amount,
    ),
    total_balance_amount: roundCurrency(
      result.total_balance_amount + employee.total_balance_amount,
    ),
  }), {
    total_incoming_amount: 0,
    total_outgoing_amount: 0,
    total_balance_amount: 0,
  });

  return {
    date_key: dateKey,
    employee_id: filters.employeeId,
    employeeOptions,
    employees,
    summary,
  };
};
