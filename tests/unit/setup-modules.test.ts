import { describe, expect, test } from 'bun:test';
import { PERMISSION_CATALOG } from '@/auth/permissionCatalog';
import { ROUTE_MODULE_MAP, isRouteEnabledForModules } from '@/auth/moduleAccess';
import {
  COOPERATIVE_REPORT_ACCESS,
  GENERAL_REPORT_ACCESS,
} from '@/auth/reportPermissions';
import {
  DEFAULT_SELECTED_MODULES,
  SETUP_MODULE_GROUPS,
} from '@/constants/setupModules';
import {
  CURRENT_MODULE_CATALOG_VERSION,
  normalizeSetupConfig,
} from '@/services/setupKeyService';

const moduleCodes = SETUP_MODULE_GROUPS.flatMap((group) => (
  group.modules.map((module) => module.code)
));

const reportModuleCodes = [
  ...Object.values(GENERAL_REPORT_ACCESS),
  ...Object.values(COOPERATIVE_REPORT_ACCESS),
].flatMap(({ moduleCode }) => (
  Array.isArray(moduleCode) ? moduleCode : [moduleCode]
));

describe('developer setup module catalog', () => {
  test('follows the root sidebar feature group order', () => {
    expect(SETUP_MODULE_GROUPS.map((group) => group.key)).toEqual([
      'pos',
      'sales',
      'purchases',
      'master-data',
      'finance',
      'hr',
      'koperasi',
      'marketplace',
      'reports',
    ]);

    expect(SETUP_MODULE_GROUPS.find((group) => group.key === 'hr')?.modules.map((module) => module.code))
      .toEqual(['EMPLOYEE', 'DEPARTMENT', 'AREA']);
    expect(SETUP_MODULE_GROUPS.find((group) => group.key === 'pos')?.modules.map((module) => module.code))
      .toEqual(['POS_TRANSACTION', 'POS_RESTAURANT']);
  });

  test('keeps group keys and module codes unique', () => {
    const groupKeys = SETUP_MODULE_GROUPS.map((group) => group.key);

    expect(new Set(groupKeys).size).toBe(groupKeys.length);
    expect(new Set(moduleCodes).size).toBe(moduleCodes.length);
  });

  test('contains every module used by route and permission gates', () => {
    const catalogCodes = new Set(moduleCodes);
    const runtimeCodes = new Set([
      ...Object.values(ROUTE_MODULE_MAP).flat(),
      ...PERMISSION_CATALOG.flatMap((permission) => permission.moduleCodes),
      ...reportModuleCodes,
    ]);

    expect([...runtimeCodes].filter((code) => !catalogCodes.has(code))).toEqual([]);
    expect(DEFAULT_SELECTED_MODULES.filter((code) => !catalogCodes.has(code))).toEqual([]);
  });

  test('migrates the new daily field cash report for legacy cooperative setups', () => {
    const config = normalizeSetupConfig({
      enabledModules: ['KOPERASI_SHU'],
      configuredAt: '2026-01-01T00:00:00.000Z',
      configuredBy: 'test',
      moduleCatalogVersion: CURRENT_MODULE_CATALOG_VERSION - 1,
    });

    expect(config.moduleCatalogVersion).toBe(CURRENT_MODULE_CATALOG_VERSION);
    expect(config.enabledModules).toContain('KOPERASI_REPORT_DAILY_FIELD_CASH');
  });

  test('migrates the legacy combined POS entitlement without removing existing access', () => {
    const config = normalizeSetupConfig({
      enabledModules: ['POS_TRANSACTION'],
      configuredAt: '2026-01-01T00:00:00.000Z',
      configuredBy: 'test',
      moduleCatalogVersion: CURRENT_MODULE_CATALOG_VERSION - 1,
    });

    expect(config.enabledModules).toContain('POS_TRANSACTION');
    expect(config.enabledModules).toContain('POS_RESTAURANT');
  });

  test('keeps POS Kasir and POS Resto independent for current catalog configs', () => {
    const baseConfig = {
      configuredAt: '2026-08-03T00:00:00.000Z',
      configuredBy: 'test',
      moduleCatalogVersion: CURRENT_MODULE_CATALOG_VERSION,
    };
    const cashierConfig = normalizeSetupConfig({
      ...baseConfig,
      enabledModules: ['POS_TRANSACTION'],
    });
    const restaurantConfig = normalizeSetupConfig({
      ...baseConfig,
      enabledModules: ['POS_RESTAURANT'],
    });

    expect(cashierConfig.enabledModules).not.toContain('POS_RESTAURANT');
    expect(restaurantConfig.enabledModules).not.toContain('POS_TRANSACTION');
    expect(isRouteEnabledForModules('/transaction', cashierConfig.enabledModules)).toBe(true);
    expect(isRouteEnabledForModules('/pos-resto', cashierConfig.enabledModules)).toBe(false);
    expect(isRouteEnabledForModules('/master-data/restaurant-tables', cashierConfig.enabledModules)).toBe(false);
    expect(isRouteEnabledForModules('/transaction', restaurantConfig.enabledModules)).toBe(false);
    expect(isRouteEnabledForModules('/pos-resto', restaurantConfig.enabledModules)).toBe(true);
    expect(isRouteEnabledForModules('/master-data/restaurant-tables', restaurantConfig.enabledModules)).toBe(true);
    expect(isRouteEnabledForModules('/history', cashierConfig.enabledModules)).toBe(true);
    expect(isRouteEnabledForModules('/history', restaurantConfig.enabledModules)).toBe(true);
  });
});
