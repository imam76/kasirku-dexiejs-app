import { describe, expect, test } from 'bun:test'
import { PERMISSION_CATALOG } from '@/auth/permissionCatalog'
import {
  employeeSalaryComponentSchema,
  employmentContractSchema,
  hrEmployeeSchema,
  salaryComponentSchema,
} from '@/lib/validations/hr'

const validEmployee = {
  name: 'Rina Pratiwi',
  employment_status: 'CONTRACT' as const,
  active_status: 'ACTIVE' as const,
  work_schedule_type: 'FULL_TIME' as const,
}

describe('HRIS validation', () => {
  test('identity numbers stay as strings including leading zeroes', () => {
    const result = hrEmployeeSchema.parse({
      ...validEmployee,
      nik: '0012345678901234',
      family_card_number: '000987654321',
      tax_number: '001.002.003.4-005.000',
    })

    expect(result.nik).toBe('0012345678901234')
    expect(result.family_card_number).toBe('000987654321')
    expect(result.tax_number).toBe('001.002.003.4-005.000')
  })

  test('rejects invalid email and employee date ranges', () => {
    expect(hrEmployeeSchema.safeParse({
      ...validEmployee,
      personal_email: 'bukan-email',
    }).success).toBe(false)

    expect(hrEmployeeSchema.safeParse({
      ...validEmployee,
      contract_start_date: '2026-08-01',
      contract_end_date: '2026-07-31',
    }).success).toBe(false)

    expect(hrEmployeeSchema.safeParse({
      ...validEmployee,
      join_date: '2026-08-01',
      exit_date: '2026-07-31',
    }).success).toBe(false)
  })

  test('rejects negative salary and reversed contract dates', () => {
    const baseContract = {
      contract_number: 'PKWT-001',
      employee_id: 'employee-1',
      contract_type: 'FIXED_TERM' as const,
      start_date: '2026-08-01',
      job_position_id: 'position-1',
      department_id: 'department-1',
      status: 'ACTIVE' as const,
    }

    expect(employmentContractSchema.safeParse({
      ...baseContract,
      base_salary: -1,
    }).success).toBe(false)

    expect(employmentContractSchema.safeParse({
      ...baseContract,
      base_salary: 5_000_000,
      end_date: '2026-07-31',
    }).success).toBe(false)
  })

  test('validates fixed and percentage salary components', () => {
    expect(salaryComponentSchema.safeParse({
      code: 'BPJS-KES',
      name: 'BPJS Kesehatan',
      kind: 'DEDUCTION',
      calculation: 'PERCENTAGE',
      default_value: 101,
      is_taxable: false,
      is_active: true,
    }).success).toBe(false)

    expect(salaryComponentSchema.safeParse({
      code: 'TUNJ-MAKAN',
      name: 'Tunjangan Makan',
      kind: 'EARNING',
      calculation: 'FIXED',
      default_value: 500_000,
      is_taxable: false,
      is_active: true,
    }).success).toBe(true)

    expect(employeeSalaryComponentSchema.safeParse({
      salary_component_id: 'bpjs',
      calculation: 'PERCENTAGE',
      value: 101,
    }).success).toBe(false)

    expect(employeeSalaryComponentSchema.safeParse({
      salary_component_id: 'meal',
      calculation: 'FIXED',
      value: 500_000,
    }).success).toBe(true)
  })
})

describe('HRIS permission catalog', () => {
  test('contains all granular HR permissions exactly once', () => {
    const expected = [
      'hr.employee.view',
      'hr.employee.create',
      'hr.employee.update',
      'hr.employee.deactivate',
      'hr.organization.manage',
      'hr.contract.manage',
      'hr.payroll.view',
      'hr.payroll.manage',
      'hr.schedule.manage',
      'hr.leave.self_service',
      'hr.leave.supervisor_approve',
      'hr.leave.hr_approve',
      'hr.leave.policy.manage',
      'cooperative.collection.assignment.manage',
      'cooperative.collection.coverage.manage',
    ]
    const codes = PERMISSION_CATALOG.map((item) => item.code)

    expected.forEach((permission) => {
      expect(codes.filter((code) => code === permission)).toHaveLength(1)
    })
  })
})
