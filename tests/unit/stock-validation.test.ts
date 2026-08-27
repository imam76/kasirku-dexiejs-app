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
      unit_mappings: [{
        from_quantity: 1,
        from_unit: 'kg',
        to_quantity: 5,
        to_unit: 'box',
      }],
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
      globalConversions: [{ fromUnit: 'kg', toUnit: 'gram', ratio: 1_000 }],
    });
    const result = schema.safeParse(buildStockForm({
      sellable_units: ['kg', 'gram'],
    }));

    expect(result.success).toBe(true);
  });

  test('accepts a chained product conversion path', () => {
    const schema = createStockSchema(undefined, { globalConversions: [] });
    const result = schema.safeParse(buildStockForm({
      sellable_units: ['kg', 'ikat'],
      unit_mappings: [
        { from_quantity: 1, from_unit: 'kg', to_quantity: 5, to_unit: 'box' },
        { from_quantity: 1, from_unit: 'box', to_quantity: 2, to_unit: 'ikat' },
      ],
    }));

    expect(result.success).toBe(true);
  });

  test('accepts a product package equation chained through a global measurement conversion', () => {
    const schema = createStockSchema(undefined, {
      globalConversions: [{ fromUnit: 'kg', toUnit: 'gram', ratio: 1_000 }],
    });
    const result = schema.safeParse(buildStockForm({
      sellable_units: ['kg', 'box'],
      unit_mappings: [{
        from_quantity: 1,
        from_unit: 'box',
        to_quantity: 100,
        to_unit: 'gram',
      }],
    }));

    expect(result.success).toBe(true);
  });

  test('rejects a product equation that conflicts with a global conversion', () => {
    const schema = createStockSchema(undefined, {
      globalConversions: [{ fromUnit: 'kg', toUnit: 'gram', ratio: 1_000 }],
    });
    const result = schema.safeParse(buildStockForm({
      sellable_units: ['kg', 'box'],
      unit_mappings: [
        { from_quantity: 1, from_unit: 'kg', to_quantity: 500, to_unit: 'gram' },
        { from_quantity: 1, from_unit: 'box', to_quantity: 100, to_unit: 'gram' },
      ],
    }));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toContainEqual(expect.objectContaining({
      path: ['unit_mappings'],
    }));
  });

  test('does not use a global package conversion for product pricing', () => {
    const schema = createStockSchema(undefined, {
      globalConversions: [{ fromUnit: 'box', toUnit: 'ikat', ratio: 10 }],
    });
    const result = schema.safeParse(buildStockForm({
      purchase_unit: 'box',
      selling_unit: 'box',
      sellable_units: ['box', 'ikat'],
    }));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toContainEqual(expect.objectContaining({
      path: ['sellable_units'],
    }));
  });

  test('reports contradictory product equations as inconsistent', () => {
    const schema = createStockSchema(undefined, { globalConversions: [] });
    const result = schema.safeParse(buildStockForm({
      sellable_units: ['kg', 'ikat'],
      unit_mappings: [
        { from_quantity: 1, from_unit: 'kg', to_quantity: 5, to_unit: 'box' },
        { from_quantity: 1, from_unit: 'box', to_quantity: 2, to_unit: 'ikat' },
        { from_quantity: 1, from_unit: 'kg', to_quantity: 20, to_unit: 'ikat' },
      ],
    }));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toContainEqual(expect.objectContaining({
      path: ['unit_mappings'],
    }));
  });

  test('rejects same-unit and reverse duplicate equations', () => {
    const schema = createStockSchema(undefined, { globalConversions: [] });
    const result = schema.safeParse(buildStockForm({
      unit_mappings: [
        { from_quantity: 1, from_unit: 'kg', to_quantity: 1_000, to_unit: ' KG ' },
        { from_quantity: 1, from_unit: 'box', to_quantity: 5, to_unit: 'kg' },
        { from_quantity: 5, from_unit: 'kg', to_quantity: 1, to_unit: 'box' },
      ],
    }));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toContainEqual(expect.objectContaining({
      path: ['unit_mappings', 0, 'to_quantity'],
    }));
    expect(result.error.issues).toContainEqual(expect.objectContaining({
      path: ['unit_mappings', 2, 'to_unit'],
    }));
  });

  test('allows a same-unit equation only when the ratio is exactly 1:1', () => {
    const schema = createStockSchema(undefined, { globalConversions: [] });

    const invalid = schema.safeParse(buildStockForm({
      unit_mappings: [
        { from_quantity: 1, from_unit: 'kg', to_quantity: 5, to_unit: 'kg' },
      ],
    }));
    expect(invalid.success).toBe(false);
    if (invalid.success) return;
    expect(invalid.error.issues).toContainEqual(expect.objectContaining({
      path: ['unit_mappings', 0, 'to_quantity'],
      message: expect.stringContaining('1:1'),
    }));

    const valid = schema.safeParse(buildStockForm({
      unit_mappings: [
        { from_quantity: 1, from_unit: 'kg', to_quantity: 1, to_unit: 'kg' },
      ],
    }));
    expect(valid.success).toBe(true);
  });

  test('allows unconventional package/count ratios since from/to already lets the user pick the direction', () => {
    const schema = createStockSchema(undefined, { globalConversions: [] });

    const packageSmallerThanCount = schema.safeParse(buildStockForm({
      sellable_units: ['kg', 'box', 'pcs'],
      unit_mappings: [
        { from_quantity: 1, from_unit: 'kg', to_quantity: 5, to_unit: 'box' },
        { from_quantity: 1, from_unit: 'box', to_quantity: 1, to_unit: 'pcs' },
      ],
    }));
    expect(packageSmallerThanCount.success).toBe(true);

    const inverted = schema.safeParse(buildStockForm({
      sellable_units: ['kg', 'box', 'pcs'],
      unit_mappings: [
        { from_quantity: 1, from_unit: 'kg', to_quantity: 5, to_unit: 'box' },
        { from_quantity: 1, from_unit: 'pcs', to_quantity: 20, to_unit: 'box' },
      ],
    }));
    expect(inverted.success).toBe(true);
  });

  test('requires every wholesale tier unit to be available for sale', () => {
    const schema = createStockSchema(undefined, { globalConversions: [] });
    const result = schema.safeParse(buildStockForm({
      wholesale_prices: [{
        min_quantity: 2,
        unit: 'box',
        price: 11_000,
        price_type: 'unit',
      }],
    }));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toContainEqual(expect.objectContaining({
      path: ['wholesale_prices', 0, 'unit'],
    }));
  });

  test('allows a tier that starts at 1 selling unit', () => {
    const schema = createStockSchema(undefined, { globalConversions: [] });
    const result = schema.safeParse(buildStockForm({
      wholesale_prices: [{
        min_quantity: 1,
        unit: 'kg',
        price: 24_000,
        price_type: 'unit',
      }],
    }));

    expect(result.success).toBe(true);
  });

  test('still allows a threshold of 1 in a bulkier unit than the selling unit', () => {
    const schema = createStockSchema(undefined, { globalConversions: [] });
    const result = schema.safeParse(buildStockForm({
      sellable_units: ['kg', 'karung'],
      unit_mappings: [{
        from_quantity: 1,
        from_unit: 'karung',
        to_quantity: 25,
        to_unit: 'kg',
      }],
      wholesale_prices: [{
        min_quantity: 1,
        unit: 'karung',
        price: 250_000,
        price_type: 'unit',
      }],
    }));

    expect(result.success).toBe(true);
  });
});
