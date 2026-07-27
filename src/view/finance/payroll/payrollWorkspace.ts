import type {
  Employee,
  EmployeePayrollPeriod,
  EmployeeSalaryComponent,
  EmploymentContract,
  PayrollRun,
  PayrollRunItem,
  SalaryComponent,
} from '@/types';
import {
  buildPayrollEmployeeDefaults,
  isEmployeeEligibleForPayrollPeriod,
  type PayrollComponentPreview,
} from '@/utils/payrollDefaults';

export interface PayrollWorkspaceItem {
  employee_id: string;
  employee_name: string;
  employee_number?: string;
  employee_position?: string;
  employee_department?: string;
  payroll_period?: EmployeePayrollPeriod;
  salary_currency?: string;
  salary_payment_method?: Employee['salary_payment_method'];
  bank_name?: string;
  bank_account_number?: string;
  base_salary_source?: 'EMPLOYEE' | 'CONTRACT' | 'COMPONENT';
  component_previews?: PayrollComponentPreview[];
  base_salary: number;
  allowance_amount: number;
  bonus_amount: number;
  other_deduction_amount: number;
  cash_advance_deduction_amount: number;
  notes?: string;
}

export interface PayrollWorkspaceRunLike extends PayrollRun {
  items: PayrollRunItem[];
}

export type PayrollWorkspaceIssueSeverity = 'ERROR' | 'WARNING';

export interface PayrollWorkspaceIssue {
  code:
    | 'OVERLAP'
    | 'ZERO_BASE_SALARY'
    | 'NEGATIVE_NET'
    | 'MISSING_BANK_ACCOUNT'
    | 'INVALID_COMPONENT_PERCENTAGE';
  severity: PayrollWorkspaceIssueSeverity;
  message: string;
}

export interface PayrollWorkspacePreview {
  gross: number;
  otherDeduction: number;
  cashAdvanceDeduction: number;
  deduction: number;
  net: number;
}

export interface PayrollWorkspaceComparison {
  previousNet: number;
  amountDelta: number;
  percentDelta?: number;
}

export const roundPayrollWorkspaceCurrency = (value: number) => (
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
);

export const calculatePayrollWorkspacePreview = (
  item: Partial<PayrollWorkspaceItem> | undefined,
  cashAdvanceAvailableByEmployee: Record<string, number>,
): PayrollWorkspacePreview => {
  const gross = roundPayrollWorkspaceCurrency(
    Number(item?.base_salary || 0)
    + Number(item?.allowance_amount || 0)
    + Number(item?.bonus_amount || 0),
  );
  const otherDeduction = roundPayrollWorkspaceCurrency(Number(item?.other_deduction_amount || 0));
  const cashAdvanceAvailable = item?.employee_id
    ? cashAdvanceAvailableByEmployee[item.employee_id] ?? 0
    : 0;
  const cashAdvanceDeduction = roundPayrollWorkspaceCurrency(
    Math.min(Math.max(0, gross - otherDeduction), cashAdvanceAvailable),
  );
  const deduction = roundPayrollWorkspaceCurrency(otherDeduction + cashAdvanceDeduction);

  return {
    gross,
    otherDeduction,
    cashAdvanceDeduction,
    deduction,
    net: roundPayrollWorkspaceCurrency(gross - deduction),
  };
};

export const buildPayrollWorkspaceItems = ({
  employees,
  assignments,
  salaryComponents,
  contracts,
  periodStart,
  periodEnd,
  payrollPeriod,
  salaryCurrency,
}: {
  employees: Employee[];
  assignments: EmployeeSalaryComponent[];
  salaryComponents: SalaryComponent[];
  contracts: EmploymentContract[];
  periodStart: string;
  periodEnd: string;
  payrollPeriod: EmployeePayrollPeriod;
  salaryCurrency: string;
}): PayrollWorkspaceItem[] => (
  employees
    .filter((employee) => (
      isEmployeeEligibleForPayrollPeriod(employee, periodStart, periodEnd)
      && (employee.payroll_period ?? 'MONTHLY') === payrollPeriod
      && (employee.salary_currency ?? 'IDR').toUpperCase() === salaryCurrency.toUpperCase()
    ))
    .map((employee) => ({
      ...buildPayrollEmployeeDefaults({
        employee,
        assignments,
        salaryComponents,
        contracts,
        periodStart,
        periodEnd,
      }),
      cash_advance_deduction_amount: 0,
      notes: undefined,
    }))
);

export const mergePayrollRunItems = (
  workspaceItems: PayrollWorkspaceItem[],
  runItems: PayrollRunItem[],
) => {
  const runItemByEmployeeId = new Map(runItems.map((item) => [item.employee_id, item]));

  return workspaceItems.map((item) => {
    const runItem = runItemByEmployeeId.get(item.employee_id);
    if (!runItem) return item;

    return {
      ...item,
      employee_name: runItem.employee_name,
      employee_number: runItem.employee_number ?? item.employee_number,
      employee_position: runItem.employee_position ?? item.employee_position,
      employee_department: runItem.employee_department ?? item.employee_department,
      payroll_period: runItem.payroll_period ?? item.payroll_period,
      salary_currency: runItem.salary_currency ?? item.salary_currency,
      salary_payment_method: runItem.salary_payment_method ?? item.salary_payment_method,
      base_salary: runItem.base_salary,
      allowance_amount: runItem.allowance_amount,
      bonus_amount: runItem.bonus_amount,
      other_deduction_amount: runItem.other_deduction_amount ?? runItem.deduction_amount ?? 0,
      cash_advance_deduction_amount: runItem.cash_advance_deduction_amount ?? 0,
      notes: runItem.notes,
    };
  });
};

export const buildPayrollWorkspaceItemsFromRun = (
  runItems: PayrollRunItem[],
): PayrollWorkspaceItem[] => (
  runItems.map((item) => ({
    employee_id: item.employee_id,
    employee_name: item.employee_name,
    employee_number: item.employee_number,
    employee_position: item.employee_position,
    employee_department: item.employee_department,
    payroll_period: item.payroll_period,
    salary_currency: item.salary_currency,
    salary_payment_method: item.salary_payment_method,
    base_salary: item.base_salary,
    allowance_amount: item.allowance_amount,
    bonus_amount: item.bonus_amount,
    other_deduction_amount: item.other_deduction_amount ?? item.deduction_amount ?? 0,
    cash_advance_deduction_amount: item.cash_advance_deduction_amount ?? 0,
    notes: item.notes,
  }))
);

export const findPayrollOverlapByEmployee = ({
  runs,
  periodStart,
  periodEnd,
  excludeRunId,
}: {
  runs: PayrollWorkspaceRunLike[];
  periodStart: string;
  periodEnd: string;
  excludeRunId?: string;
}) => {
  const overlaps = runs.filter((run) => (
    run.id !== excludeRunId
    && run.status !== 'VOIDED'
    && run.period_start <= periodEnd
    && run.period_end >= periodStart
  ));
  const result = new Map<string, PayrollWorkspaceRunLike>();

  overlaps.forEach((run) => {
    run.items.forEach((item) => {
      if (!result.has(item.employee_id)) {
        result.set(item.employee_id, run);
      }
    });
  });

  return result;
};

export const getPayrollWorkspaceIssues = ({
  item,
  preview,
  overlappingRun,
}: {
  item: PayrollWorkspaceItem;
  preview: PayrollWorkspacePreview;
  overlappingRun?: PayrollWorkspaceRunLike;
}): PayrollWorkspaceIssue[] => {
  const issues: PayrollWorkspaceIssue[] = [];

  if (overlappingRun) {
    issues.push({
      code: 'OVERLAP',
      severity: 'ERROR',
      message: `Sudah tercatat di ${overlappingRun.payroll_number}.`,
    });
  }
  if (item.base_salary <= 0) {
    issues.push({
      code: 'ZERO_BASE_SALARY',
      severity: 'WARNING',
      message: 'Gaji pokok masih nol.',
    });
  }
  const invalidPercentageComponent = item.component_previews?.find((component) => (
    component.calculation === 'PERCENTAGE'
    && component.configured_value > 100
  ));
  if (invalidPercentageComponent) {
    issues.push({
      code: 'INVALID_COMPONENT_PERCENTAGE',
      severity: 'ERROR',
      message: `${invalidPercentageComponent.component_name} menggunakan ${invalidPercentageComponent.configured_value}%; maksimal 100%.`,
    });
  }
  if (preview.net < 0) {
    issues.push({
      code: 'NEGATIVE_NET',
      severity: 'ERROR',
      message: 'Total potongan melebihi penghasilan.',
    });
  }
  if (
    item.salary_payment_method === 'BANK_TRANSFER'
    && (!item.bank_name?.trim() || !item.bank_account_number?.trim())
  ) {
    issues.push({
      code: 'MISSING_BANK_ACCOUNT',
      severity: 'WARNING',
      message: 'Data rekening transfer belum lengkap.',
    });
  }

  return issues;
};

export const findPreviousPayrollRun = ({
  runs,
  periodStart,
  payrollPeriod,
  salaryCurrency,
  excludeRunId,
}: {
  runs: PayrollWorkspaceRunLike[];
  periodStart: string;
  payrollPeriod: EmployeePayrollPeriod;
  salaryCurrency: string;
  excludeRunId?: string;
}) => (
  runs
    .filter((run) => (
      run.id !== excludeRunId
      && run.status === 'PAID'
      && run.period_end < periodStart
      && (run.payroll_period ?? 'MONTHLY') === payrollPeriod
      && (run.salary_currency ?? 'IDR').toUpperCase() === salaryCurrency.toUpperCase()
    ))
    .sort((left, right) => right.period_end.localeCompare(left.period_end))[0]
);

export const comparePayrollItemWithPrevious = (
  preview: PayrollWorkspacePreview,
  previousItem?: PayrollRunItem,
): PayrollWorkspaceComparison | undefined => {
  if (!previousItem) return undefined;

  const previousNet = Number(previousItem.net_amount || 0);
  const amountDelta = roundPayrollWorkspaceCurrency(preview.net - previousNet);

  return {
    previousNet,
    amountDelta,
    percentDelta: previousNet !== 0
      ? roundPayrollWorkspaceCurrency(amountDelta / previousNet * 100)
      : undefined,
  };
};
