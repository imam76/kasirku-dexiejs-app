import { db } from '@/lib/db';
import type { PaymentMethod, PayrollRun, PayrollRunItem, PayrollRunStatus } from '@/types';

export type PayrollReportStatusFilter = PayrollRunStatus | 'ALL';

export interface PayrollReportFilters {
  startDate?: string;
  endDate?: string;
  status?: PayrollReportStatusFilter;
}

export interface PayrollReportAmountSummary {
  run_count: number;
  employee_count: number;
  base_salary: number;
  allowance_amount: number;
  bonus_amount: number;
  gross_amount: number;
  other_deduction_amount: number;
  cash_advance_deduction_amount: number;
  deduction_amount: number;
  net_amount: number;
}

export interface PayrollReportRow {
  id: string;
  payroll_run_id: string;
  payroll_number: string;
  period_start: string;
  period_end: string;
  status: PayrollRunStatus;
  paid_at?: string;
  payment_method?: PaymentMethod;
  payment_channel?: string;
  cash_account_code?: string;
  cash_account_name?: string;
  employee_id: string;
  employee_name: string;
  employee_position?: string;
  base_salary: number;
  allowance_amount: number;
  bonus_amount: number;
  gross_amount: number;
  other_deduction_amount: number;
  cash_advance_deduction_amount: number;
  deduction_amount: number;
  net_amount: number;
  notes?: string;
}

export interface PayrollReportGroup {
  payroll_run_id: string;
  payroll_number: string;
  period_start: string;
  period_end: string;
  status: PayrollRunStatus;
  paid_at?: string;
  payment_method?: PaymentMethod;
  payment_channel?: string;
  cash_account_code?: string;
  cash_account_name?: string;
  notes?: string;
  rows: PayrollReportRow[];
  summary: PayrollReportAmountSummary;
}

export interface PayrollReport {
  filters: PayrollReportFilters;
  groups: PayrollReportGroup[];
  rows: PayrollReportRow[];
  summary: PayrollReportAmountSummary;
}

const roundCurrency = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const emptySummary = (): PayrollReportAmountSummary => ({
  run_count: 0,
  employee_count: 0,
  base_salary: 0,
  allowance_amount: 0,
  bonus_amount: 0,
  gross_amount: 0,
  other_deduction_amount: 0,
  cash_advance_deduction_amount: 0,
  deduction_amount: 0,
  net_amount: 0,
});

const summarizeRows = (rows: PayrollReportRow[], runCount = 0): PayrollReportAmountSummary => rows.reduce(
  (acc, row) => ({
    run_count: runCount,
    employee_count: acc.employee_count + 1,
    base_salary: roundCurrency(acc.base_salary + row.base_salary),
    allowance_amount: roundCurrency(acc.allowance_amount + row.allowance_amount),
    bonus_amount: roundCurrency(acc.bonus_amount + row.bonus_amount),
    gross_amount: roundCurrency(acc.gross_amount + row.gross_amount),
    other_deduction_amount: roundCurrency(acc.other_deduction_amount + row.other_deduction_amount),
    cash_advance_deduction_amount: roundCurrency(acc.cash_advance_deduction_amount + row.cash_advance_deduction_amount),
    deduction_amount: roundCurrency(acc.deduction_amount + row.deduction_amount),
    net_amount: roundCurrency(acc.net_amount + row.net_amount),
  }),
  { ...emptySummary(), run_count: runCount },
);

const dateOverlaps = (run: PayrollRun, filters: PayrollReportFilters) => {
  const startDate = filters.startDate?.slice(0, 10);
  const endDate = filters.endDate?.slice(0, 10);

  if (startDate && run.period_end < startDate) return false;
  if (endDate && run.period_start > endDate) return false;
  return true;
};

const matchesStatus = (run: PayrollRun, status: PayrollReportStatusFilter | undefined) => (
  !status || status === 'ALL' || run.status === status
);

const buildReportRow = (run: PayrollRun, item: PayrollRunItem): PayrollReportRow => ({
  id: item.id,
  payroll_run_id: run.id,
  payroll_number: run.payroll_number,
  period_start: run.period_start,
  period_end: run.period_end,
  status: run.status,
  paid_at: run.paid_at,
  payment_method: run.payment_method,
  payment_channel: run.payment_channel,
  cash_account_code: run.cash_account_code,
  cash_account_name: run.cash_account_name,
  employee_id: item.employee_id,
  employee_name: item.employee_name,
  employee_position: item.employee_position,
  base_salary: Number(item.base_salary || 0),
  allowance_amount: Number(item.allowance_amount || 0),
  bonus_amount: Number(item.bonus_amount || 0),
  gross_amount: Number(item.gross_amount || 0),
  other_deduction_amount: Number(item.other_deduction_amount ?? item.deduction_amount ?? 0),
  cash_advance_deduction_amount: Number(item.cash_advance_deduction_amount || 0),
  deduction_amount: Number(item.deduction_amount || 0),
  net_amount: Number(item.net_amount || 0),
  notes: item.notes,
});

export const getPayrollReport = async (filters: PayrollReportFilters): Promise<PayrollReport> => {
  const runs = (await db.payrollRuns.orderBy('period_start').toArray())
    .filter((run) => dateOverlaps(run, filters) && matchesStatus(run, filters.status))
    .sort((left, right) => (
      left.period_start.localeCompare(right.period_start) ||
      left.payroll_number.localeCompare(right.payroll_number)
    ));
  const runIds = runs.map((run) => run.id);
  const items = runIds.length > 0
    ? await db.payrollRunItems.where('payroll_run_id').anyOf(runIds).toArray()
    : [];
  const itemsByRun = items.reduce<Record<string, PayrollRunItem[]>>((acc, item) => {
    acc[item.payroll_run_id] = [...(acc[item.payroll_run_id] ?? []), item];
    return acc;
  }, {});

  const groups = runs.map<PayrollReportGroup>((run) => {
    const rows = (itemsByRun[run.id] ?? [])
      .sort((left, right) => left.employee_name.localeCompare(right.employee_name))
      .map((item) => buildReportRow(run, item));

    return {
      payroll_run_id: run.id,
      payroll_number: run.payroll_number,
      period_start: run.period_start,
      period_end: run.period_end,
      status: run.status,
      paid_at: run.paid_at,
      payment_method: run.payment_method,
      payment_channel: run.payment_channel,
      cash_account_code: run.cash_account_code,
      cash_account_name: run.cash_account_name,
      notes: run.notes,
      rows,
      summary: summarizeRows(rows, rows.length > 0 ? 1 : 0),
    };
  }).filter((group) => group.rows.length > 0);
  const rows = groups.flatMap((group) => group.rows);

  return {
    filters,
    groups,
    rows,
    summary: summarizeRows(rows, groups.length),
  };
};
