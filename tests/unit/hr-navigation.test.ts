import { describe, expect, test } from 'bun:test'
import { getModuleCodesForPath } from '@/auth/moduleAccess'
import { getRequiredPermissionForPath } from '@/auth/routePermissions'

describe('HR navigation access', () => {
  test('HR index is available for any related permission or module', () => {
    expect(getRequiredPermissionForPath('/hr')).toEqual([
      'AREA_MANAGE',
      'EMPLOYEE_MANAGE',
      'FINANCE_ACCESS',
    ])
    expect(getModuleCodesForPath('/hr')).toEqual(['AREA', 'EMPLOYEE', 'CASH_FLOW'])
  })

  test('HR destination routes retain their specific access rules', () => {
    expect(getRequiredPermissionForPath('/master-data/areas')).toBe('AREA_MANAGE')
    expect(getRequiredPermissionForPath('/master-data/employees')).toBe('EMPLOYEE_MANAGE')
    expect(getRequiredPermissionForPath('/finance/payroll')).toBe('FINANCE_ACCESS')

    expect(getModuleCodesForPath('/master-data/areas')).toEqual(['AREA'])
    expect(getModuleCodesForPath('/master-data/employees')).toEqual(['EMPLOYEE'])
    expect(getModuleCodesForPath('/finance/payroll')).toEqual(['CASH_FLOW'])
  })
})
