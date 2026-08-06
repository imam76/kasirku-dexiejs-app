import { describe, expect, test } from 'bun:test';
import { resolveQuickItemEstimatedCost } from '../../src/services/posQuickItemService';

describe('resolveQuickItemEstimatedCost', () => {
  test('memakai harga beli manual saat kasir mengisinya', () => {
    expect(resolveQuickItemEstimatedCost(10000, 7500)).toEqual({ price: 7500, isGuessed: false });
  });

  test('menebak dari harga jual saat harga beli dikosongkan', () => {
    expect(resolveQuickItemEstimatedCost(10000)).toEqual({ price: 7000, isGuessed: true });
  });

  test('menebak juga saat harga beli diisi nol atau negatif', () => {
    expect(resolveQuickItemEstimatedCost(10000, 0).isGuessed).toBe(true);
    expect(resolveQuickItemEstimatedCost(10000, -5).isGuessed).toBe(true);
  });

  test('tebakan selalu lebih dari nol selama harga jual lebih dari nol', () => {
    // Penerimaan barang berstatus ESTIMATED ditolak bila harga belinya nol.
    expect(resolveQuickItemEstimatedCost(1).price).toBeGreaterThan(0);
    expect(resolveQuickItemEstimatedCost(100).price).toBeGreaterThan(0);
  });

  test('membulatkan tebakan ke dua desimal', () => {
    expect(resolveQuickItemEstimatedCost(3333).price).toBe(2333.1);
  });
});
