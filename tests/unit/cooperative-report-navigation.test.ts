import { describe, expect, test } from 'bun:test';
import { getModuleCodesForPath } from '@/auth/moduleAccess';
import { getRequiredPermissionForPath } from '@/auth/routePermissions';
import {
  COOPERATIVE_REPORT_MODULE_LIST,
  COOPERATIVE_REPORT_PERMISSION_LIST,
} from '@/auth/reportPermissions';

describe('cooperative report navigation access', () => {
  test('report index accepts every cooperative report permission and module', () => {
    expect(getRequiredPermissionForPath('/koperasi/laporan')).toEqual(COOPERATIVE_REPORT_PERMISSION_LIST);
    expect(getModuleCodesForPath('/koperasi/laporan')).toEqual(COOPERATIVE_REPORT_MODULE_LIST);
  });

  test('canonical report routes retain their specific access rules', () => {
    expect(getRequiredPermissionForPath('/koperasi/laporan/ringkasan'))
      .toBe('COOPERATIVE_OVERVIEW_REPORT_VIEW');
    expect(getModuleCodesForPath('/koperasi/laporan/ringkasan')).toEqual(['KOPERASI_SHU']);

    expect(getRequiredPermissionForPath('/koperasi/laporan/drop-harian'))
      .toBe('COOPERATIVE_DAILY_DROP_REPORT_VIEW');
    expect(getModuleCodesForPath('/koperasi/laporan/drop-harian'))
      .toEqual(['KOPERASI_REPORT_DAILY_DROP']);
  });
});
