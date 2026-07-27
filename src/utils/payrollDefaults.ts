import type {
  Employee,
  EmployeeSalaryComponent,
  EmploymentContract,
  SalaryComponent,
  SalaryComponentCalculation,
  SalaryComponentKind,
} from '@/types';

export interface PayrollComponentPreview {
  assignment_id: string;
  component_code: string;
  component_name: string;
  kind: SalaryComponentKind;
  calculation: SalaryComponentCalculation;
  configured_value: number;
  amount: number;
}

export interface PayrollEmployeeDefaults {
  employee_id: string;
  employee_name: string;
  employee_number?: string;
  employee_position?: string;
  employee_department?: string;
  payroll_period: Employee['payroll_period'];
  salary_currency: string;
  salary_payment_method: Employee['salary_payment_method'];
  bank_name?: string;
  bank_account_number?: string;
  base_salary: number;
  base_salary_source: 'EMPLOYEE' | 'CONTRACT' | 'COMPONENT';
  allowance_amount: number;
  bonus_amount: number;
  other_deduction_amount: number;
  component_previews: PayrollComponentPreview[];
}

const BASE_SALARY_CODES = new Set(['GAJIPOKOK', 'BASESALARY']);
const VARIABLE_EARNING_CODES = new Set(['BONUS', 'LEMBUR', 'OVERTIME']);
const INCLUDED_CONTRACT_STATUSES = new Set<EmploymentContract['status']>([
  'ACTIVE',
  'EXPIRED',
  'RENEWED',
]);

export const roundPayrollAmount = (value: number) => (
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
);

const normalizeComponentCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

const overlapsPeriod = (
  startDate: string | undefined,
  endDate: string | undefined,
  periodStart: string,
  periodEnd: string,
) => (
  (!startDate || startDate.slice(0, 10) <= periodEnd.slice(0, 10)) &&
  (!endDate || endDate.slice(0, 10) >= periodStart.slice(0, 10))
);

export const isEmployeeEligibleForPayrollPeriod = (
  employee: Employee,
  periodStart: string,
  periodEnd: string,
) => {
  if (!overlapsPeriod(employee.join_date, employee.exit_date, periodStart, periodEnd)) {
    return false;
  }

  const activeStatus = employee.active_status ?? (employee.is_active ? 'ACTIVE' : 'INACTIVE');
  if (activeStatus === 'ACTIVE' || activeStatus === 'LONG_LEAVE') {
    return true;
  }

  return Boolean(
    employee.exit_date &&
    employee.exit_date.slice(0, 10) >= periodStart.slice(0, 10) &&
    employee.exit_date.slice(0, 10) <= periodEnd.slice(0, 10),
  );
};

export const getApplicablePayrollContract = (
  employeeId: string,
  contracts: EmploymentContract[],
  periodStart: string,
  periodEnd: string,
) => contracts
  .filter((contract) => (
    contract.employee_id === employeeId &&
    INCLUDED_CONTRACT_STATUSES.has(contract.status) &&
    overlapsPeriod(contract.start_date, contract.end_date, periodStart, periodEnd)
  ))
  .sort((left, right) => (
    right.start_date.localeCompare(left.start_date) ||
    right.updated_at.localeCompare(left.updated_at)
  ))[0];

const calculateComponentAmount = (
  calculation: SalaryComponentCalculation,
  configuredValue: number,
  baseSalary: number,
) => roundPayrollAmount(
  calculation === 'PERCENTAGE'
    ? baseSalary * configuredValue / 100
    : configuredValue,
);

export const buildPayrollEmployeeDefaults = ({
  employee,
  assignments,
  salaryComponents,
  contracts,
  periodStart,
  periodEnd,
}: {
  employee: Employee;
  assignments: EmployeeSalaryComponent[];
  salaryComponents: SalaryComponent[];
  contracts: EmploymentContract[];
  periodStart: string;
  periodEnd: string;
}): PayrollEmployeeDefaults => {
  const applicableContract = getApplicablePayrollContract(
    employee.id,
    contracts,
    periodStart,
    periodEnd,
  );
  const activeSalaryComponentById = new Map(
    salaryComponents
      .filter((component) => component.is_active)
      .map((component) => [component.id, component]),
  );
  const activeAssignments = Array.from(
    assignments
      .filter((assignment) => (
        assignment.employee_id === employee.id
        && assignment.is_active
        && activeSalaryComponentById.has(assignment.salary_component_id)
      ))
      .sort((left, right) => (
        left.updated_at.localeCompare(right.updated_at)
        || left.id.localeCompare(right.id)
      ))
      .reduce<Map<string, EmployeeSalaryComponent>>((result, assignment) => {
        result.set(assignment.salary_component_id, assignment);
        return result;
      }, new Map())
      .values(),
  );
  const baseSalaryAssignment = activeAssignments.find((assignment) => (
    BASE_SALARY_CODES.has(normalizeComponentCode(
      activeSalaryComponentById.get(assignment.salary_component_id)?.code
        ?? assignment.component_code,
    )) &&
    (assignment.calculation
      ?? activeSalaryComponentById.get(assignment.salary_component_id)?.calculation) === 'FIXED'
  ));

  const profileBaseSalary = roundPayrollAmount(
    applicableContract?.base_salary ?? employee.base_salary ?? 0,
  );
  const baseSalary = baseSalaryAssignment
    ? roundPayrollAmount(baseSalaryAssignment.value)
    : profileBaseSalary;
  const componentPreviews = activeAssignments
    .map((assignment) => ({
      assignment,
      component: activeSalaryComponentById.get(assignment.salary_component_id),
    }))
    .filter(({ assignment, component }) => !BASE_SALARY_CODES.has(normalizeComponentCode(
      component?.code ?? assignment.component_code,
    )))
    .map(({ assignment, component }): PayrollComponentPreview => {
      const calculation = assignment.calculation ?? component?.calculation;
      return {
        assignment_id: assignment.id,
        component_code: component?.code ?? assignment.component_code,
        component_name: component?.name ?? assignment.component_name,
        kind: assignment.kind ?? component?.kind,
        calculation,
        configured_value: assignment.value,
        amount: calculateComponentAmount(calculation, assignment.value, baseSalary),
      };
    });

  const totals = componentPreviews.reduce((result, component) => {
    if (component.kind === 'DEDUCTION') {
      result.otherDeduction = roundPayrollAmount(result.otherDeduction + component.amount);
    } else if (VARIABLE_EARNING_CODES.has(normalizeComponentCode(component.component_code))) {
      result.bonus = roundPayrollAmount(result.bonus + component.amount);
    } else {
      result.allowance = roundPayrollAmount(result.allowance + component.amount);
    }
    return result;
  }, { allowance: 0, bonus: 0, otherDeduction: 0 });

  return {
    employee_id: employee.id,
    employee_name: employee.name,
    employee_number: employee.employee_number,
    employee_position: applicableContract?.job_position_name
      ?? employee.job_position_name
      ?? employee.position,
    employee_department: applicableContract?.department_name ?? employee.department_name,
    payroll_period: employee.payroll_period ?? 'MONTHLY',
    salary_currency: employee.salary_currency ?? 'IDR',
    salary_payment_method: employee.salary_payment_method ?? 'CASH',
    bank_name: employee.bank_name,
    bank_account_number: employee.bank_account_number,
    base_salary: baseSalary,
    base_salary_source: baseSalaryAssignment
      ? 'COMPONENT'
      : applicableContract
        ? 'CONTRACT'
        : 'EMPLOYEE',
    allowance_amount: totals.allowance,
    bonus_amount: totals.bonus,
    other_deduction_amount: totals.otherDeduction,
    component_previews: componentPreviews,
  };
};
