import { describe, expect, test } from 'bun:test';
import type { Product } from '@/types';
import {
  DEFAULT_MIN_STOCK,
  getStockStatus,
  normalizeMinStockInput,
  resolveProductMinStock,
} from '@/utils/stockStatus';

const productWith = (overrides: Partial<Product>): Product => ({
  id: 'product-a',
  name: 'Produk A',
  category: 'non_consumable',
  purchase_unit: 'pcs',
  selling_unit: 'pcs',
  purchase_price: 1_000,
  selling_price: 1_500,
  stock: 0,
  product_type: 'FINISHED_GOOD',
  is_visible_in_pos: true,
  wholesale_prices: [],
  sellable_units: ['pcs'],
  unit_mappings: [],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('ambang stok per produk', () => {
  test('produk lama tanpa min_stock tetap memakai ambang statis lama', () => {
    expect(resolveProductMinStock(productWith({}))).toBe(DEFAULT_MIN_STOCK);
    expect(getStockStatus(productWith({ stock: 9 }))).toBe('menipis');
    expect(getStockStatus(productWith({ stock: 10 }))).toBe('tersedia');
  });

  test('stok habis dibedakan dari stok menipis', () => {
    expect(getStockStatus(productWith({ stock: 0 }))).toBe('habis');
    expect(getStockStatus(productWith({ stock: -3 }))).toBe('habis');
    expect(getStockStatus(productWith({ stock: 1 }))).toBe('menipis');
  });

  test('ambang khusus produk mengalahkan ambang bawaan', () => {
    expect(getStockStatus(productWith({ stock: 9, min_stock: 3 }))).toBe('tersedia');
    expect(getStockStatus(productWith({ stock: 40, min_stock: 50 }))).toBe('menipis');
  });

  test('min_stock 0 berarti hanya peringatan saat benar-benar habis', () => {
    expect(resolveProductMinStock(productWith({ min_stock: 0 }))).toBe(0);
    expect(getStockStatus(productWith({ stock: 1, min_stock: 0 }))).toBe('tersedia');
    expect(getStockStatus(productWith({ stock: 0, min_stock: 0 }))).toBe('habis');
  });

  test('nilai rusak dari baris DB lama jatuh ke ambang bawaan, bukan 0', () => {
    for (const broken of [Number.NaN, -1, undefined]) {
      expect(resolveProductMinStock(productWith({ min_stock: broken }))).toBe(DEFAULT_MIN_STOCK);
    }
  });

  test('input form kosong disimpan sebagai undefined, bukan 0', () => {
    expect(normalizeMinStockInput(undefined)).toBeUndefined();
    expect(normalizeMinStockInput(null)).toBeUndefined();
    expect(normalizeMinStockInput(Number.NaN)).toBeUndefined();
    expect(normalizeMinStockInput(-2)).toBeUndefined();
    expect(normalizeMinStockInput(0)).toBe(0);
    expect(normalizeMinStockInput(7.5)).toBe(7.5);
  });
});
