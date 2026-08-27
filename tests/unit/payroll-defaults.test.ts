import { describe, expect, test } from 'bun:test';
import type {
  Employee,
  EmployeeSalaryComponent,
  EmploymentContract,
  SalaryComponent,
} from '../../src/types';
import {
  buildPayrollEmployeeDefaults,
  isEmployeeEligibleForPayrollPeriod,
} from '../../src/utils/payrollDefaults';

const employee: Employee = {
  id: 'employee-1',
  employee_number: 'EMP-00001',
  name: 'Ayu Payroll',
  job_position_name: 'Kasir',
  department_name: 'Operasional',
  join_date: '2026-01-01',
  active_status: 'ACTIVE',
  salary_payment_method: 'BANK_TRANSFER',
  bank_name: 'BCA',
  bank_account_number: '1234567890',
  base_salary: 5_000_000,
  salary_currency: 'IDR',
  payroll_period: 'MONTHLY',
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const components: SalaryComponent[] = [
  {
    id: 'meal',
    code: 'TUNJ-MAKAN',
    name: 'Tunjangan Makan',
    kind: 'EARNING',
    calculation: 'FIXED',
    default_value: 0,
    is_taxable: false,
    is_active: true,
    created_at: employee.created_at,
    updated_at: employee.updated_at,
  },
  {
    id: 'bonus',
    code: 'BONUS',
    name: 'Bonus',
    kind: 'EARNING',
    calculation: 'PERCENTAGE',
    default_value: 0,
    is_taxable: true,
    is_active: true,
    created_at: employee.created_at,
    updated_at: employee.updated_at,
  },
  {
    id: 'bpjs',
    code: 'BPJS-KES',
    name: 'BPJS Kesehatan',
    kind: 'DEDUCTION',
    calculation: 'PERCENTAGE',
    default_value: 0,
    is_taxable: false,
    is_active: true,
    created_at: employee.created_at,
    updated_at: employee.updated_at,
  },
];

const assignments: EmployeeSalaryComponent[] = components.map((component, index) => ({
  id: `assignment-${component.id}`,
  employee_id: employee.id,
  salary_component_id: component.id,
  component_code: component.code,
  component_name: component.name,
  kind: component.kind,
  calculation: component.calculation,
  value: [300_000, 10, 1][index],
  is_active: true,
  created_at: employee.created_at,
  updated_at: employee.updated_at,
}));

const contract: EmploymentContract = {
  id: 'contract-1',
  contract_number: 'PKWT/001',
  employee_id: employee.id,
  employee_name: employee.name,
  contract_type: 'FIXED_TERM',
  start_date: '2026-07-01',
  end_date: '2027-06-30',
  job_position_id: 'position-supervisor',
  job_position_name: 'Supervisor',
  department_id: 'department-store',
  department_name: 'Toko',
  base_salary: 6_000_000,
  status: 'ACTIVE',
  created_at: employee.created_at,
  updated_at: employee.updated_at,
};

describe('payroll defaults from HRIS', () => {
  test('uses the applicable contract and assigned fixed/percentage components', () => {
    const result = buildPayrollEmployeeDefaults({
      employee,
      assignments,
      salaryComponents: components,
      contracts: [contract],
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
    });

    expect(result.base_salary).toBe(6_000_000);
    expect(result.base_salary_source).toBe('CONTRACT');
    expect(result.employee_position).toBe('Supervisor');
    expect(result.allowance_amount).toBe(300_000);
    expect(result.bonus_amount).toBe(600_000);
    expect(result.other_deduction_amount).toBe(60_000);
  });

  test('does not include resigned employees outside their final payroll period', () => {
    const resigned = {
      ...employee,
      is_active: false,
      active_status: 'RESIGNED' as const,
      exit_date: '2026-06-15',
    };

    expect(isEmployeeEligibleForPayrollPeriod(resigned, '2026-06-01', '2026-06-30')).toBe(true);
    expect(isEmployeeEligibleForPayrollPeriod(resigned, '2026-07-01', '2026-07-31')).toBe(false);
  });

  test('ignores assignments whose salary component is no longer active', () => {
    const result = buildPayrollEmployeeDefaults({
      employee,
      assignments,
      salaryComponents: components.map((component) => (
        component.id === 'bpjs' ? { ...component, is_active: false } : component
      )),
      contracts: [],
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
    });

    expect(result.base_salary).toBe(5_000_000);
    expect(result.allowance_amount).toBe(300_000);
    expect(result.bonus_amount).toBe(500_000);
    expect(result.other_deduction_amount).toBe(0);
  });

  test('lets an assigned GAJI-POKOK override the employee profile before percentages', () => {
    const baseComponent: SalaryComponent = {
      ...components[0],
      id: 'salary-base',
      code: 'GAJI-POKOK',
      name: 'Gaji Pokok',
      is_active: true,
    };
    const baseAssignment: EmployeeSalaryComponent = {
      ...assignments[0],
      id: 'assignment-base',
      salary_component_id: baseComponent.id,
      component_code: baseComponent.code,
      component_name: baseComponent.name,
      value: 7_000_000,
    };
    const result = buildPayrollEmployeeDefaults({
      employee,
      assignments: [...assignments, baseAssignment],
      salaryComponents: [...components, baseComponent],
      contracts: [contract],
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
    });

    expect(result.base_salary).toBe(7_000_000);
    expect(result.base_salary_source).toBe('COMPONENT');
    expect(result.bonus_amount).toBe(700_000);
    expect(result.other_deduction_amount).toBe(70_000);
  });

  test('keeps the calculation method stored on the employee assignment', () => {
    const result = buildPayrollEmployeeDefaults({
      employee,
      assignments,
      salaryComponents: components.map((component) => {
        if (component.id === 'meal') return { ...component, calculation: 'PERCENTAGE' as const };
        if (component.id === 'bpjs') return { ...component, calculation: 'FIXED' as const };
        return component;
      }),
      contracts: [contract],
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
    });

    expect(result.allowance_amount).toBe(300_000);
    expect(result.other_deduction_amount).toBe(60_000);
    expect(result.component_previews.find((component) => component.component_code === 'TUNJ-MAKAN')).toMatchObject({
      calculation: 'FIXED',
      configured_value: 300_000,
      amount: 300_000,
    });
  });

  test('uses only the latest active assignment when local duplicates exist', () => {
    const oldMealAssignment = assignments[0];
    const latestMealAssignment: EmployeeSalaryComponent = {
      ...oldMealAssignment,
      id: 'assignment-meal-latest',
      value: 450_000,
      updated_at: '2026-02-01T00:00:00.000Z',
    };
    const result = buildPayrollEmployeeDefaults({
      employee,
      assignments: [oldMealAssignment, latestMealAssignment],
      salaryComponents: components,
      contracts: [],
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
    });

    expect(result.allowance_amount).toBe(450_000);
    expect(result.component_previews).toHaveLength(1);
  });
});
