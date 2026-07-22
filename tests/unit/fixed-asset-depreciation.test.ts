import { describe, expect, test } from 'bun:test';
import type { AccountingPeriod, FixedAsset } from '../../src/types';
import {
  calculateDepreciationForPeriod,
  calculateFixedAssetPolicy,
  calculateFixedAssetPosition,
} from '../../src/utils/fixedAssets/calculateDepreciation';
import { fixedAssetInputSchema } from '../../src/lib/validations/fixedAsset';
import { getModuleCodesForPath, isRouteEnabledForModules } from '../../src/auth/moduleAccess';
import { PERMISSION_CATALOG } from '../../src/auth/permissionCatalog';

const period = (month: number): AccountingPeriod => ({
  id: `2026-${String(month).padStart(2, '0')}`,
  name: `2026-${month}`,
  period_type: 'MONTHLY',
  start_date: `2026-${String(month).padStart(2, '0')}-01`,
  end_date: `2026-${String(month).padStart(2, '0')}-${month === 2 ? '28' : '31'}`,
  status: 'OPEN',
  created_at: '',
  updated_at: '',
});

const asset = (overrides: Partial<FixedAsset> = {}): FixedAsset => ({
  id: 'asset-1', asset_code: 'AST-1', name: 'Aset', category: 'OTHER', registration_type: 'NEW',
  acquisition_date: '2026-01-01', available_for_use_date: '2026-01-15', acquisition_cost: 12_000_000,
  residual_value: 0, useful_life_months: 12, depreciation_method: 'STRAIGHT_LINE',
  depreciation_start_date: '2026-02-01', regular_depreciation_amount: 1_000_000,
  opening_accumulated_depreciation: 0, asset_account_id: 'a', asset_account_code: '1500', asset_account_name: 'Aset',
  accumulated_depreciation_account_id: 'b', accumulated_depreciation_account_code: '1590', accumulated_depreciation_account_name: 'Akumulasi',
  depreciation_expense_account_id: 'c', depreciation_expense_account_code: '6080', depreciation_expense_account_name: 'Beban',
  is_active: true, version: 1, created_at: '', updated_at: '', ...overrides,
});

describe('fixed asset straight-line depreciation', () => {
  test('requires both fixed-asset and general-ledger modules', () => {
    expect(getModuleCodesForPath('/master-data/fixed-assets')).toEqual(['FIXED_ASSET', 'GENERAL_LEDGER']);
    expect(isRouteEnabledForModules('/master-data/fixed-assets', ['FIXED_ASSET'])).toBe(false);
    expect(isRouteEnabledForModules('/master-data/fixed-assets', ['GENERAL_LEDGER'])).toBe(false);
    expect(isRouteEnabledForModules('/master-data/fixed-assets', ['FIXED_ASSET', 'GENERAL_LEDGER'])).toBe(true);
    expect(PERMISSION_CATALOG.some((item) => item.code === 'FIXED_ASSET_MANAGE' && item.moduleCodes.includes('FIXED_ASSET'))).toBe(true);
  });

  test('starts in the month after available for use', () => {
    const policy = calculateFixedAssetPolicy(asset());
    expect(policy.depreciationStartDate).toBe('2026-02-01');
    expect(policy.regularDepreciationAmount).toBe(1_000_000);
    expect(calculateDepreciationForPeriod(asset(), [], period(1)).eligible).toBe(false);
    expect(calculateDepreciationForPeriod(asset(), [], period(2)).depreciationAmount).toBe(1_000_000);
  });

  test('uses opening balance and remaining life for an existing asset', () => {
    const policy = calculateFixedAssetPolicy({
      ...asset(), registration_type: 'EXISTING', opening_balance_date: '2026-03-31',
      opening_accumulated_depreciation: 4_000_000, opening_remaining_useful_life_months: 8,
    });
    expect(policy.depreciationStartDate).toBe('2026-04-01');
    expect(policy.regularDepreciationAmount).toBe(1_000_000);
  });

  test('puts rounding remainder in the last line', () => {
    const small = asset({ acquisition_cost: 100, useful_life_months: 3, regular_depreciation_amount: 33.33 });
    const first = calculateDepreciationForPeriod(small, [], period(2));
    const posted1 = [{ asset_id: small.id, depreciation_amount: first.depreciationAmount, period_id: period(2).id, period_end: period(2).end_date, run_status: 'POSTED' as const }];
    const second = calculateDepreciationForPeriod(small, posted1, period(3));
    const posted2 = [...posted1, { asset_id: small.id, depreciation_amount: second.depreciationAmount, period_id: period(3).id, period_end: period(3).end_date, run_status: 'POSTED' as const }];
    const third = calculateDepreciationForPeriod(small, posted2, period(4));
    expect([first.depreciationAmount, second.depreciationAmount, third.depreciationAmount]).toEqual([33.33, 33.33, 33.34]);
    expect(third.closingBookValue).toBe(0);
  });

  test('stops at residual value and ignores reversed lines', () => {
    const residualAsset = asset({ acquisition_cost: 12_000_000, residual_value: 2_000_000, useful_life_months: 10, regular_depreciation_amount: 1_000_000 });
    const posted = Array.from({ length: 10 }, (_, index) => ({
      asset_id: residualAsset.id,
      depreciation_amount: 1_000_000,
      period_end: `2026-${String(index + 2).padStart(2, '0')}-28`,
      run_status: 'POSTED' as const,
    }));
    const position = calculateFixedAssetPosition(residualAsset, posted, '2027-12-31');
    expect(position.bookValue).toBe(2_000_000);
    expect(position.derivedStatus).toBe('FULLY_DEPRECIATED');
    const reversedPosition = calculateFixedAssetPosition(residualAsset, [{ ...posted[0], run_status: 'REVERSED' }], '2027-12-31');
    expect(reversedPosition.accumulatedDepreciation).toBe(0);
  });

  test('validates dates, residual value, and existing-asset baseline', () => {
    const validInput = {
      asset_code: 'ast-1', name: 'Aset', category: 'OTHER' as const, registration_type: 'EXISTING' as const,
      acquisition_date: '2025-01-01', available_for_use_date: '2025-01-15', acquisition_cost: 100,
      residual_value: 0, useful_life_months: 10, opening_balance_date: '2026-03-31',
      opening_accumulated_depreciation: 20, opening_remaining_useful_life_months: 8,
      asset_account_id: 'a', accumulated_depreciation_account_id: 'b', depreciation_expense_account_id: 'c', is_active: true,
    };
    expect(fixedAssetInputSchema.safeParse(validInput).success).toBe(true);
    expect(fixedAssetInputSchema.safeParse({ ...validInput, acquisition_cost: 0 }).success).toBe(false);
    expect(fixedAssetInputSchema.safeParse({ ...validInput, residual_value: -1 }).success).toBe(false);
    expect(fixedAssetInputSchema.safeParse({ ...validInput, residual_value: 100 }).success).toBe(false);
    expect(fixedAssetInputSchema.safeParse({ ...validInput, useful_life_months: 10.5 }).success).toBe(false);
    expect(fixedAssetInputSchema.safeParse({ ...validInput, opening_balance_date: '2026-03-30' }).success).toBe(false);
    expect(fixedAssetInputSchema.safeParse({ ...validInput, opening_accumulated_depreciation: 101 }).success).toBe(false);
    expect(fixedAssetInputSchema.safeParse({ ...validInput, opening_remaining_useful_life_months: 0 }).success).toBe(false);
    expect(fixedAssetInputSchema.safeParse({ ...validInput, opening_accumulated_depreciation: 100, opening_remaining_useful_life_months: 1 }).success).toBe(false);
    expect(fixedAssetInputSchema.safeParse({ ...validInput, acquisition_date: '2025-02-01' }).success).toBe(false);
  });
});
