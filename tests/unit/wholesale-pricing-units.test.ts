import { describe, expect, test } from 'bun:test';
import type { Product, WholesalePrice } from '@/types';
import { getPrice, hitungHargaJual, materializeWholesalePriceUnits } from '@/utils/pricing';

const buildProduct = (
  wholesalePrice: WholesalePrice,
  overrides: Partial<Product> = {},
): Product => ({
  id: 'product-multi-unit',
  sku: 'MULTI-001',
  name: 'Produk Multi Unit',
  category: 'non_consumable',
  purchase_unit: 'pcs',
  selling_unit: 'pcs',
  purchase_price: 6_000,
  selling_price: 10_000,
  stock: 240,
  product_type: 'FINISHED_GOOD',
  is_visible_in_pos: true,
  wholesale_prices: [wholesalePrice],
  sellable_units: ['pcs', 'dus'],
  unit_mappings: [{
    from_quantity: 1,
    from_unit: 'dus',
    to_quantity: 12,
    to_unit: 'pcs',
  }],
  created_at: '2026-08-04T00:00:00.000Z',
  updated_at: '2026-08-04T00:00:00.000Z',
  ...overrides,
});

describe('wholesale pricing with product units', () => {
  test('uses the selected tier unit for both thresholds and unit prices', () => {
    const product = buildProduct({
      min_quantity: 2,
      unit: 'dus',
      price: 96_000,
      price_type: 'unit',
    });

    expect(getPrice(product, 23, 'pcs')).toBe(10_000);
    expect(getPrice(product, 24, 'pcs')).toBe(8_000);
    expect(getPrice(product, 2, 'dus')).toBe(96_000);
  });

  test('also converts a pcs threshold when the cashier quantity is entered in dus', () => {
    const product = buildProduct({
      min_quantity: 24,
      unit: 'pcs',
      price: 8_000,
      price_type: 'unit',
    });

    expect(getPrice(product, 1, 'dus')).toBe(120_000);
    expect(getPrice(product, 2, 'dus')).toBe(96_000);
  });

  test('normalizes a bundle total from its configured unit into the requested unit', () => {
    const product = buildProduct({
      min_quantity: 2,
      unit: 'dus',
      price: 216_000,
      price_type: 'bundle',
    });

    expect(getPrice(product, 24, 'pcs')).toBe(9_000);
    expect(getPrice(product, 2, 'dus')).toBe(108_000);
    expect(hitungHargaJual(product, 2, 'dus')).toBe(216_000);
  });

  test('ranks tiers by their normalized threshold when units differ', () => {
    const pcsTier: WholesalePrice = {
      min_quantity: 10,
      unit: 'pcs',
      price: 8_000,
      price_type: 'unit',
    };
    const dusTier: WholesalePrice = {
      min_quantity: 2,
      unit: 'dus',
      price: 84_000,
      price_type: 'unit',
    };
    const product = buildProduct(pcsTier, {
      wholesale_prices: [pcsTier, dusTier],
    });

    expect(getPrice(product, 23, 'pcs')).toBe(8_000);
    expect(getPrice(product, 24, 'pcs')).toBe(7_000);
  });

  test('falls back to selling_unit for legacy tiers without a unit', () => {
    const product = buildProduct(
      {
        min_quantity: 2,
        price: 216_000,
        price_type: 'bundle',
      },
      { selling_unit: 'dus' },
    );

    expect(getPrice(product, 23, 'pcs')).toBe(10_000);
    expect(getPrice(product, 24, 'pcs')).toBe(9_000);
    expect(getPrice(product, 2, 'dus')).toBe(108_000);

    const wholesalePrices = materializeWholesalePriceUnits(product, []);
    expect(wholesalePrices).toEqual([{
      min_quantity: 2,
      unit: 'dus',
      price: 216_000,
      price_type: 'bundle',
    }]);
    expect(getPrice({ ...product, wholesale_prices: wholesalePrices }, 2, 'dus')).toBe(108_000);
  });

  test('materializes a legacy unit-price tier without changing its value', () => {
    const product = buildProduct(
      {
        min_quantity: 2,
        price: 8_000,
        price_type: 'unit',
      },
      { selling_unit: 'dus' },
    );

    expect(getPrice(product, 2, 'dus')).toBe(96_000);

    const wholesalePrices = materializeWholesalePriceUnits(product, []);
    const materializedProduct = { ...product, wholesale_prices: wholesalePrices };

    expect(wholesalePrices).toEqual([{
      min_quantity: 2,
      unit: 'dus',
      price: 96_000,
      price_type: 'unit',
    }]);
    expect(getPrice(materializedProduct, 2, 'dus')).toBe(96_000);
  });
});
