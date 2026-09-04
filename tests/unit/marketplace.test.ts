import { describe, expect, test } from 'bun:test';
import { getModuleCodesForPath } from '@/auth/moduleAccess';
import { PERMISSION_CATALOG } from '@/auth/permissionCatalog';
import { formatMarketplaceMoney } from '@/utils/marketplace';

describe('marketplace module', () => {
  test('maps Marketplace routes and separate view/manage permissions', () => {
    expect(getModuleCodesForPath('/marketplace/shopee')).toEqual(['MARKETPLACE']);
    expect(getModuleCodesForPath('/marketplace/shopee/orders/order-1')).toEqual(['MARKETPLACE']);

    const codes = PERMISSION_CATALOG
      .filter((item) => item.moduleCodes.includes('MARKETPLACE'))
      .map((item) => item.code);
    expect(codes).toEqual(['MARKETPLACE_VIEW', 'MARKETPLACE_MANAGE']);
  });

  test('formats decimal strings without converting Shopee money to Number', () => {
    expect(formatMarketplaceMoney('9999999999999999.1234', 'IDR'))
      .toBe('IDR 9.999.999.999.999.999,1234');
    expect(formatMarketplaceMoney('-1200.5000', 'USD')).toBe('USD -1.200,5');
    expect(formatMarketplaceMoney(null, 'IDR')).toBe('-');
  });
});
