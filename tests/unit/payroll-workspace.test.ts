import { describe, expect, test } from 'bun:test';
import type { Employee, PayrollRun, PayrollRunItem } from '../../src/types';
import {
  calculatePayrollWorkspacePreview,
  comparePayrollItemWithPrevious,
  findPayrollOverlapByEmployee,
  getPayrollWorkspaceIssues,
  type PayrollWorkspaceItem,
  type PayrollWorkspaceRunLike,
} from '../../src/view/finance/payroll/payrollWorkspace';

const now = '2026-07-01T00:00:00.000Z';

const employee: Employee = {
  id: 'employee-1',
  employee_number: 'EMP-001',
  name: 'Ayu Payroll',
  salary_payment_method: 'BANK_TRANSFER',
  bank_name: 'BCA',
  bank_account_number: '123456',
  base_salary: 5_000_000,
  payroll_period: 'MONTHLY',
  salary_currency: 'IDR',
  is_active: true,
  created_at: now,
  updated_at: now,
};

const item: PayrollWorkspaceItem = {
  employee_id: employee.id,
  employee_name: employee.name,
  employee_number: employee.employee_number,
  salary_payment_method: employee.salary_payment_method,
  bank_name: employee.bank_name,
  bank_account_number: employee.bank_account_number,
  base_salary: 5_000_000,
  allowance_amount: 500_000,
  bonus_amount: 250_000,
  other_deduction_amount: 100_000,
  cash_advance_deduction_amount: 0,
};

const buildRunItem = (runId: string): PayrollRunItem => ({
  id: `${runId}:employee-1`,
  payroll_run_id: runId,
  employee_id: employee.id,
  employee_name: employee.name,
  base_salary: 4_000_000,
  allowance_amount: 0,
  bonus_amount: 0,
  other_deduction_amount: 0,
  cash_advance_deduction_amount: 0,
  deduction_amount: 0,
  gross_amount: 4_000_000,
  net_amount: 4_000_000,
  created_at: now,
  updated_at: now,
});

const buildRun = (overrides: Partial<PayrollRun> = {}): PayrollWorkspaceRunLike => {
  const runId = overrides.id ?? 'run-1';
  return {
    id: runId,
    payroll_number: 'PYR-001',
    period_start: '2026-06-01',
    period_end: '2026-06-30',
    payroll_period: 'MONTHLY',
    salary_currency: 'IDR',
    status: 'PAID',
    employee_count: 1,
    gross_amount: 4_000_000,
    allowance_amount: 0,
    bonus_amount: 0,
    other_deduction_amount: 0,
    cash_advance_deduction_amount: 0,
    deduction_amount: 0,
    net_amount: 4_000_000,
    created_at: now,
    updated_at: now,
    ...overrides,
    items: [buildRunItem(runId)],
  };
};

describe('payroll workspace model', () => {
  test('calculates net and caps automatic cash advance deduction', () => {
    const preview = calculatePayrollWorkspacePreview(item, {
      [employee.id]: 8_000_000,
    });

    expect(preview).toEqual({
      gross: 5_750_000,
      otherDeduction: 100_000,
      cashAdvanceDeduction: 5_650_000,
      deduction: 5_750_000,
      net: 0,
    });
  });

  test('detects overlapping employees before payroll is submitted', () => {
    const run = buildRun();
    const overlap = findPayrollOverlapByEmployee({
      runs: [run],
      periodStart: '2026-06-15',
      periodEnd: '2026-07-14',
    });

    expect(overlap.get(employee.id)?.payroll_number).toBe('PYR-001');
    expect(findPayrollOverlapByEmployee({
      runs: [run],
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
    }).has(employee.id)).toBe(false);
  });

  test('marks missing bank data as warning and negative net as blocking', () => {
    const incomplete = {
      ...item,
      bank_account_number: undefined,
      other_deduction_amount: 9_000_000,
    };
    const preview = calculatePayrollWorkspacePreview(incomplete, {});
    const issues = getPayrollWorkspaceIssues({ item: incomplete, preview });

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MISSING_BANK_ACCOUNT', severity: 'WARNING' }),
      expect.objectContaining({ code: 'NEGATIVE_NET', severity: 'ERROR' }),
    ]));
  });

  test('explains invalid percentage assignments before the generic net error', () => {
    const invalidPercentageItem: PayrollWorkspaceItem = {
      ...item,
      component_previews: [{
        assignment_id: 'assignment-bpjs',
        component_code: 'BPJS-KES',
        component_name: 'BPJS Kesehatan',
        kind: 'DEDUCTION',
        calculation: 'PERCENTAGE',
        configured_value: 100_000,
        amount: 5_000_000_000,
      }],
      other_deduction_amount: 5_000_000_000,
    };
    const preview = calculatePayrollWorkspacePreview(invalidPercentageItem, {});
    const issues = getPayrollWorkspaceIssues({ item: invalidPercentageItem, preview });

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'INVALID_COMPONENT_PERCENTAGE',
        severity: 'ERROR',
        message: 'BPJS Kesehatan menggunakan 100000%; maksimal 100%.',
      }),
    ]));
  });

  test('compares current net with previous payroll', () => {
    const comparison = comparePayrollItemWithPrevious(
      calculatePayrollWorkspacePreview(item, {}),
      buildRunItem('previous'),
    );

    expect(comparison).toEqual({
      previousNet: 4_000_000,
      amountDelta: 1_650_000,
      percentDelta: 41.25,
    });
  });
});
