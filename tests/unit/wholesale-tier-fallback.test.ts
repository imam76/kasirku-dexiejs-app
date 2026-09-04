import { describe, expect, test } from 'bun:test';
import type { Product } from '@/types';
import { getBasePrice, getLowestWholesalePrice, getPrice, getProductDisplayPricing } from '@/utils/pricing';

const buildProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'box-product',
  sku: '',
  name: 'Test Box',
  category: 'non_consumable',
  purchase_unit: 'box',
  selling_unit: 'box',
  purchase_price: 40_000,
  selling_price: 60_000,
  stock: 100,
  product_type: 'FINISHED_GOOD',
  is_visible_in_pos: true,
  created_at: '2026-08-04T00:00:00.000Z',
  updated_at: '2026-08-04T00:00:00.000Z',
  ...overrides,
});

describe('wholesale tiers that cannot be converted', () => {
  test('ignores a tier priced in a unit with no equation to the target unit', () => {
    const product = buildProduct({
      // Tidak ada unit_mappings: pcs tidak terhubung ke box.
      wholesale_prices: [{ min_quantity: 1, unit: 'pcs', price: 10_000, price_type: 'unit' }],
    });

    expect(getPrice(product, 1)).toBe(60_000);
    expect(getPrice(product, 50)).toBe(60_000);
  });

  test('still applies a tier once the product supplies the missing equation', () => {
    const product = buildProduct({
      sellable_units: ['box', 'pcs'],
      unit_mappings: [{ from_quantity: 1, from_unit: 'box', to_quantity: 12, to_unit: 'pcs' }],
      wholesale_prices: [{ min_quantity: 24, unit: 'pcs', price: 4_000, price_type: 'unit' }],
    });

    expect(getPrice(product, 1)).toBe(60_000);
    expect(getPrice(product, 2)).toBe(48_000);
    expect(getPrice(product, 24, 'pcs')).toBe(4_000);
  });

  test('drops only the unusable tier and keeps the convertible one', () => {
    const product = buildProduct({
      sellable_units: ['box'],
      wholesale_prices: [
        { min_quantity: 1, unit: 'pcs', price: 10_000, price_type: 'unit' },
        { min_quantity: 5, unit: 'box', price: 50_000, price_type: 'unit' },
      ],
    });

    expect(getPrice(product, 1)).toBe(60_000);
    expect(getPrice(product, 5)).toBe(50_000);
  });
});

describe('catalog display pricing', () => {
  test('getBasePrice never looks at wholesale tiers', () => {
    const product = buildProduct({
      sellable_units: ['box'],
      wholesale_prices: [{ min_quantity: 1, unit: 'box', price: 120_000, price_type: 'unit' }],
    });

    expect(getPrice(product, 1)).toBe(120_000);
    expect(getBasePrice(product)).toBe(60_000);
    // Kartu katalog memakai harga dasar, jadi cocok dengan kolom Master Data.
    expect(getProductDisplayPricing(product)).toEqual({ basePrice: 60_000 });
  });

  test('reports the cheapest tier as the "grosir mulai" hint', () => {
    const product = buildProduct({
      sellable_units: ['box'],
      wholesale_prices: [
        { min_quantity: 5, unit: 'box', price: 55_000, price_type: 'unit' },
        { min_quantity: 20, unit: 'box', price: 48_000, price_type: 'unit' },
      ],
    });

    expect(getLowestWholesalePrice(product)).toBe(48_000);
    expect(getProductDisplayPricing(product)).toEqual({
      basePrice: 60_000,
      wholesaleFromPrice: 48_000,
    });
  });

  test('omits the hint when no tier is actually cheaper than the base price', () => {
    const product = buildProduct({
      sellable_units: ['box'],
      wholesale_prices: [{ min_quantity: 5, unit: 'box', price: 70_000, price_type: 'unit' }],
    });

    expect(getProductDisplayPricing(product)).toEqual({ basePrice: 60_000 });
  });

  test('keeps a contradictory product from throwing in render', () => {
    const product = buildProduct({
      selling_unit: 'ikat',
      sellable_units: ['ikat', 'box'],
      unit_mappings: [
        { from_quantity: 1, from_unit: 'box', to_quantity: 10, to_unit: 'ikat' },
        { from_quantity: 1, from_unit: 'box', to_quantity: 5, to_unit: 'pack' },
        { from_quantity: 1, from_unit: 'pack', to_quantity: 3, to_unit: 'ikat' },
      ],
    });

    expect(() => getPrice(product, 1)).toThrow('saling bertentangan');
    expect(getProductDisplayPricing(product)).toEqual({ basePrice: 60_000 });
  });
});
