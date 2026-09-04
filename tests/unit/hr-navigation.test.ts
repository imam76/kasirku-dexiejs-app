import { describe, expect, test } from 'bun:test'
import { getModuleCodesForPath } from '@/auth/moduleAccess'
import { getRequiredPermissionForPath } from '@/auth/routePermissions'

describe('HR navigation access', () => {
  test('HR index is available for any related permission or module', () => {
    expect(getRequiredPermissionForPath('/hr')).toEqual([
      'hr.employee.view',
      'hr.organization.manage',
      'hr.contract.manage',
      'hr.payroll.view',
      'AREA_MANAGE',
      'EMPLOYEE_MANAGE',
      'FINANCE_ACCESS',
    ])
    expect(getModuleCodesForPath('/hr')).toEqual(['AREA', 'EMPLOYEE', 'CASH_FLOW'])
  })

  test('HR destination routes retain their specific access rules', () => {
    expect(getRequiredPermissionForPath('/master-data/areas')).toBe('AREA_MANAGE')
    expect(getRequiredPermissionForPath('/master-data/employees')).toEqual([
      'EMPLOYEE_MANAGE',
      'hr.employee.view',
    ])
    expect(getRequiredPermissionForPath('/finance/payroll')).toEqual([
      'FINANCE_ACCESS',
      'hr.payroll.view',
    ])

    expect(getModuleCodesForPath('/master-data/areas')).toEqual(['AREA'])
    expect(getModuleCodesForPath('/master-data/employees')).toEqual(['EMPLOYEE'])
    expect(getModuleCodesForPath('/finance/payroll')).toEqual(['CASH_FLOW'])
  })

  test('HRIS routes use granular HR permissions and modules', () => {
    expect(getRequiredPermissionForPath('/hr/dashboard')).toBe('hr.employee.view')
    expect(getRequiredPermissionForPath('/hr/employees')).toBe('hr.employee.view')
    expect(getRequiredPermissionForPath('/hr/departments')).toBe('hr.organization.manage')
    expect(getRequiredPermissionForPath('/hr/positions')).toBe('hr.organization.manage')
    expect(getRequiredPermissionForPath('/hr/contracts')).toBe('hr.contract.manage')
    expect(getRequiredPermissionForPath('/hr/salary-components')).toBe('hr.payroll.view')

    expect(getModuleCodesForPath('/hr/dashboard')).toEqual(['EMPLOYEE'])
    expect(getModuleCodesForPath('/hr/departments')).toEqual(['DEPARTMENT'])
    expect(getModuleCodesForPath('/hr/contracts')).toEqual(['EMPLOYEE'])
    expect(getModuleCodesForPath('/hr/salary-components')).toEqual(['EMPLOYEE', 'CASH_FLOW'])
  })
})
