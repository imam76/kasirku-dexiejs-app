import { describe, expect, test } from 'bun:test';
import { getModuleCodesForPath } from '@/auth/moduleAccess';
import { AUTH_PIN_LENGTH, isValidAuthPin } from '@/auth/pinPolicy';
import { getRequiredPermissionForPath } from '@/auth/routePermissions';

describe('auth user access policy', () => {
  test('protects user management with USER_MANAGE and ROLE_PERMISSION setup module', () => {
    expect(getRequiredPermissionForPath('/master-data/users')).toBe('USER_MANAGE');
    expect(getModuleCodesForPath('/master-data/users')).toEqual(['ROLE_PERMISSION']);
  });

  test('protects activity log with ACTIVITY_LOG_VIEW', () => {
    expect(getRequiredPermissionForPath('/activity-log')).toBe('ACTIVITY_LOG_VIEW');
  });

  test('requires exactly six numeric digits for newly written PINs', () => {
    expect(AUTH_PIN_LENGTH).toBe(6);
    expect(isValidAuthPin('123456')).toBeTrue();
    expect(isValidAuthPin('1234')).toBeFalse();
    expect(isValidAuthPin('1234567')).toBeFalse();
    expect(isValidAuthPin('12a456')).toBeFalse();
  });
});
