import { describe, expect, test } from 'bun:test';
import { createStockSchema } from '@/lib/validations/stock';

const buildStockForm = (overrides: Record<string, unknown> = {}) => ({
  name: 'Produk Multi Unit',
  category: 'non_consumable',
  purchase_unit: 'kg',
  selling_unit: 'kg',
  purchase_price: 10_000,
  selling_price: 12_000,
  product_type: 'FINISHED_GOOD' as const,
  is_visible_in_pos: true,
  purchase_quantity: 0,
  wholesale_prices: [],
  sellable_units: ['kg'],
  unit_mappings: [],
  ...overrides,
});

describe('stock multi-unit validation', () => {
  test('accepts cross-category conversion units when a product ratio is supplied', () => {
    const schema = createStockSchema(undefined, { globalConversions: [] });
    const result = schema.safeParse(buildStockForm({
      sellable_units: ['kg', 'box'],
      unit_mappings: [{ unit: 'box', base_unit: 'kg', ratio: 5 }],
    }));

    expect(result.success).toBe(true);
  });

  test('requires a product ratio when no global conversion exists', () => {
    const schema = createStockSchema(undefined, { globalConversions: [] });
    const result = schema.safeParse(buildStockForm({
      sellable_units: ['kg', 'box'],
    }));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toContainEqual(expect.objectContaining({
      path: ['sellable_units'],
    }));
  });

  test('allows a configured global conversion without a product ratio', () => {
    const schema = createStockSchema(undefined, {
      globalConversions: [{ fromUnit: 'kg', toUnit: 'gram' }],
    });
    const result = schema.safeParse(buildStockForm({
      sellable_units: ['kg', 'gram'],
    }));

    expect(result.success).toBe(true);
  });
});
