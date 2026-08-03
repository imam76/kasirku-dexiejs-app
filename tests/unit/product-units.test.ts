import { describe, expect, test } from 'bun:test';
import type { Product } from '@/types';
import {
  getProductDocumentUnits,
  getProductSellableUnits,
  getProductUnitRatio,
  normalizeProductUnitMapping,
  normalizeProductUnitMappings,
  resolveProductUnitRatio,
} from '@/utils/productUnits';

const buildProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'unit-conversion-product',
  name: 'Produk Konversi',
  purchase_unit: 'box',
  selling_unit: 'ikat',
  purchase_price: 50_000,
  selling_price: 50_000,
  stock: 10,
  product_type: 'FINISHED_GOOD',
  is_visible_in_pos: true,
  sellable_units: ['box', 'ikat'],
  unit_mappings: [{
    from_quantity: 1,
    from_unit: 'box',
    to_quantity: 10,
    to_unit: 'ikat',
  }],
  created_at: '2026-08-04T00:00:00.000Z',
  updated_at: '2026-08-04T00:00:00.000Z',
  ...overrides,
});

describe('explicit product unit equations', () => {
  test('derives direct and reverse ratios from 1 box = 10 ikat', () => {
    const product = buildProduct();

    expect(getProductUnitRatio(product, 'box', 'ikat')).toBe(10);
    expect(getProductUnitRatio(product, 'ikat', 'box')).toBe(0.1);
    expect(getProductUnitRatio(product, 'box', 'box')).toBe(1);
  });

  test('derives a chained ratio in either direction', () => {
    const product = buildProduct({
      sellable_units: ['pallet', 'box', 'ikat'],
      unit_mappings: [
        {
          from_quantity: 1,
          from_unit: 'pallet',
          to_quantity: 5,
          to_unit: 'box',
        },
        {
          from_quantity: 1,
          from_unit: 'box',
          to_quantity: 10,
          to_unit: 'ikat',
        },
      ],
    });

    expect(getProductUnitRatio(product, 'pallet', 'ikat')).toBe(50);
    expect(getProductUnitRatio(product, 'ikat', 'pallet')).toBeCloseTo(0.02);
  });

  test('resolves a product package equation through an eligible global measurement edge', () => {
    const product = buildProduct({
      purchase_unit: 'kg',
      selling_unit: 'box',
      sellable_units: ['kg', 'box'],
      unit_mappings: [{
        from_quantity: 1,
        from_unit: 'box',
        to_quantity: 100,
        to_unit: 'gram',
      }],
    });
    const options = {
      globalConversions: [{ fromUnit: 'kg', toUnit: 'gram', ratio: 1_000 }],
    };

    expect(getProductUnitRatio(product, 'box', 'kg', options)).toBe(0.1);
    expect(getProductUnitRatio(product, 'kg', 'box', options)).toBe(10);
  });

  test('rejects a product equation that contradicts a global measurement edge', () => {
    const product = buildProduct({
      purchase_unit: 'kg',
      selling_unit: 'box',
      sellable_units: ['kg', 'box'],
      unit_mappings: [
        { from_quantity: 1, from_unit: 'kg', to_quantity: 500, to_unit: 'gram' },
        { from_quantity: 1, from_unit: 'box', to_quantity: 100, to_unit: 'gram' },
      ],
    });

    expect(resolveProductUnitRatio(product, 'box', 'kg', {
      globalConversions: [{ fromUnit: 'kg', toUnit: 'gram', ratio: 1_000 }],
    })).toEqual({ status: 'inconsistent' });
  });

  test('normalizes and resolves legacy 1 dus = 12 pcs rows', () => {
    const product = {
      ...buildProduct(),
      purchase_unit: 'pcs',
      selling_unit: 'dus',
      sellable_units: ['pcs', 'dus'],
      unit_mappings: [{ unit: 'dus', base_unit: 'pcs', ratio: 12 }],
    } as unknown as Product;

    expect(normalizeProductUnitMappings(product)).toEqual([{
      from_quantity: 1,
      from_unit: 'dus',
      to_quantity: 12,
      to_unit: 'pcs',
    }]);
    expect(getProductUnitRatio(product, 'dus', 'pcs')).toBe(12);
    expect(getProductUnitRatio(product, 'pcs', 'dus')).toBeCloseTo(1 / 12);
  });

  test('safely rejects malformed values received from persistence boundaries', () => {
    expect(normalizeProductUnitMapping(null)).toBeUndefined();
    expect(normalizeProductUnitMapping('invalid')).toBeUndefined();
    expect(normalizeProductUnitMapping({
      from_quantity: 1,
      from_unit: 123,
      to_quantity: 10,
      to_unit: 'ikat',
    })).toBeUndefined();
    expect(normalizeProductUnitMapping({
      from_quantity: '1',
      from_unit: ' BOX ',
      to_quantity: '10',
      to_unit: ' IKAT ',
    })).toEqual({
      from_quantity: 1,
      from_unit: 'box',
      to_quantity: 10,
      to_unit: 'ikat',
    });

    const invalidLegacyProduct = {
      ...buildProduct(),
      purchase_unit: 'pcs',
      selling_unit: 'pcs',
      sellable_units: undefined,
      unit_mappings: [{ unit: 'dus', base_unit: 'pcs', ratio: 0 }],
    } as unknown as Product;
    expect(normalizeProductUnitMappings(invalidLegacyProduct)).toEqual([]);
    expect(getProductSellableUnits(invalidLegacyProduct)).toEqual(['pcs']);
  });

  test('does not make equation endpoints sellable but exposes them to product documents', () => {
    const product = buildProduct({
      purchase_unit: 'pcs',
      selling_unit: 'pcs',
      sellable_units: ['pcs'],
      unit_mappings: [{
        from_quantity: 1,
        from_unit: 'box',
        to_quantity: 10,
        to_unit: 'ikat',
      }],
    });

    expect(getProductSellableUnits(product)).toEqual(['pcs']);
    expect(getProductDocumentUnits(product)).toEqual(['pcs', 'box', 'ikat']);
  });

  test('keeps legacy mapping units sellable until old persisted rows are migrated', () => {
    const product = {
      ...buildProduct(),
      purchase_unit: 'pcs',
      selling_unit: 'pcs',
      sellable_units: undefined,
      unit_mappings: [{ unit: 'dus', base_unit: 'pcs', ratio: 12 }],
    } as unknown as Product;

    expect(getProductSellableUnits(product)).toEqual(['pcs', 'dus']);
  });

  test('rejects an ambiguous conversion graph with conflicting paths', () => {
    const product = buildProduct({
      unit_mappings: [
        {
          from_quantity: 1,
          from_unit: 'box',
          to_quantity: 10,
          to_unit: 'ikat',
        },
        {
          from_quantity: 1,
          from_unit: 'box',
          to_quantity: 5,
          to_unit: 'pack',
        },
        {
          from_quantity: 1,
          from_unit: 'pack',
          to_quantity: 3,
          to_unit: 'ikat',
        },
      ],
    });

    expect(resolveProductUnitRatio(product, 'box', 'ikat')).toEqual({ status: 'inconsistent' });
    expect(getProductUnitRatio(product, 'box', 'ikat')).toBeUndefined();
  });

  test('keeps conflicting duplicate equations visible to the resolver', () => {
    const product = buildProduct({
      unit_mappings: [
        {
          from_quantity: 1,
          from_unit: 'box',
          to_quantity: 10,
          to_unit: 'ikat',
        },
        {
          from_quantity: 1,
          from_unit: 'ikat',
          to_quantity: 0.2,
          to_unit: 'box',
        },
      ],
    });

    expect(normalizeProductUnitMappings(product)).toHaveLength(2);
    expect(resolveProductUnitRatio(product, 'box', 'ikat')).toEqual({ status: 'inconsistent' });
  });

  test('drops equivalent duplicate and same-unit equations', () => {
    const product = buildProduct({
      unit_mappings: [
        {
          from_quantity: 1,
          from_unit: 'box',
          to_quantity: 10,
          to_unit: 'ikat',
        },
        {
          from_quantity: 1,
          from_unit: 'ikat',
          to_quantity: 0.1,
          to_unit: 'box',
        },
        {
          from_quantity: 1,
          from_unit: 'box',
          to_quantity: 2,
          to_unit: 'box',
        },
      ],
    });

    expect(normalizeProductUnitMappings(product)).toEqual([{
      from_quantity: 1,
      from_unit: 'box',
      to_quantity: 10,
      to_unit: 'ikat',
    }]);
  });

  test('ignores invalid equations instead of producing non-finite ratios', () => {
    const product = buildProduct({
      unit_mappings: [{
        from_quantity: 1,
        from_unit: 'box',
        to_quantity: 0,
        to_unit: 'ikat',
      }],
    });

    expect(normalizeProductUnitMappings(product)).toEqual([]);
    expect(resolveProductUnitRatio(product, 'box', 'ikat')).toEqual({ status: 'disconnected' });
    expect(getProductUnitRatio(product, 'box', 'ikat')).toBeUndefined();
  });
});
