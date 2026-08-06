import { describe, expect, test } from 'bun:test';
import type { Product, PurchaseDocumentItem } from '@/types';
import { resolveUnitCategory } from '@/constants/units';
import { createStockSchema } from '@/lib/validations/stock';
import {
  getProductDocumentUnits,
  getProductSellableUnits,
  getProductUnitRatio,
  normalizeProductUnitMapping,
  normalizeProductUnitMappings,
  resolveProductUnitRatio,
} from '@/utils/productUnits';
import { getPurchaseReceiptStockQuantity } from '@/utils/purchaseDocuments/calculatePurchaseDocumentStockImpact';

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

describe('pasangan angka pada baris konversi lama', () => {
  test('12 pcs = 1 pack terbaca apa adanya, bukan lewat ratio 0.0833', () => {
    const product = {
      ...buildProduct(),
      purchase_unit: 'pack',
      selling_unit: 'pcs',
      sellable_units: ['pack', 'pcs'],
      // Bentuk yang ditulis branch lama: ratio turunan plus pasangan aslinya.
      unit_mappings: [{ unit: 'pcs', base_unit: 'pack', ratio: 1 / 12, qty: 12, base_qty: 1 }],
    } as unknown as Product;

    expect(normalizeProductUnitMappings(product)).toEqual([{
      from_quantity: 12,
      from_unit: 'pcs',
      to_quantity: 1,
      to_unit: 'pack',
    }]);
  });

  test('pasangan menang atas ratio yang sudah terlanjur salah', () => {
    expect(normalizeProductUnitMapping({
      unit: 'pcs',
      base_unit: 'pack',
      ratio: 999,
      qty: 12,
      base_qty: 1,
    })).toEqual({
      from_quantity: 12,
      from_unit: 'pcs',
      to_quantity: 1,
      to_unit: 'pack',
    });
  });

  test('baris lama tanpa pasangan tetap dibaca sebagai 1 satuan', () => {
    expect(normalizeProductUnitMapping({ unit: 'box', base_unit: 'pcs', ratio: 12 })).toEqual({
      from_quantity: 1,
      from_unit: 'box',
      to_quantity: 12,
      to_unit: 'pcs',
    });
  });
});

describe('pembelian dengan satuan kemasan', () => {
  const receiptItem = (unit: string): PurchaseDocumentItem => ({
    id: 'line-1',
    document_id: 'doc-1',
    product_id: 'unit-conversion-product',
    product_name: 'Produk Konversi',
    unit,
    quantity: 1,
    received_quantity: 1,
    price: 120_000,
    discount_type: 'fixed',
    discount_value: 0,
    discount_amount: 0,
    subtotal: 120_000,
    created_at: '2026-01-01T00:00:00.000Z',
  } as PurchaseDocumentItem);

  test('1 box masuk sebagai 12 pcs saat konversinya terdaftar', () => {
    const product = buildProduct({
      purchase_unit: 'pcs',
      selling_unit: 'pcs',
      sellable_units: ['pcs', 'box'],
      unit_mappings: [{ from_quantity: 1, from_unit: 'box', to_quantity: 12, to_unit: 'pcs' }],
    });

    expect(getPurchaseReceiptStockQuantity(receiptItem('box'), product)).toBe(12);
  });

  test('12 pcs masuk sebagai 1 pack saat satuan utamanya kemasan', () => {
    const product = buildProduct({
      purchase_unit: 'pack',
      selling_unit: 'pcs',
      sellable_units: ['pack', 'pcs'],
      unit_mappings: [{ from_quantity: 12, from_unit: 'pcs', to_quantity: 1, to_unit: 'pack' }],
    });

    expect(getPurchaseReceiptStockQuantity(
      { ...receiptItem('pcs'), quantity: 12, received_quantity: 12 },
      product,
    )).toBeCloseTo(1);
  });
});

describe('validasi form produk', () => {
  const schema = createStockSchema();

  const formData = (overrides: Record<string, unknown> = {}) => ({
    name: 'Produk Multi Unit',
    category: 'sembako',
    purchase_unit: 'pcs',
    selling_unit: 'pcs',
    purchase_price: 10_000,
    selling_price: 12_000,
    sku: '',
    product_type: 'FINISHED_GOOD' as const,
    is_visible_in_pos: true,
    wholesale_prices: [],
    sellable_units: ['pcs'],
    unit_mappings: [],
    ...overrides,
  });

  test('menerima satuan utama kemasan yang dijual per satuan hitungan', () => {
    const result = schema.safeParse(formData({
      purchase_unit: 'box',
      selling_unit: 'pcs',
      sellable_units: ['box', 'pcs'],
      unit_mappings: [{ from_quantity: 12, from_unit: 'pcs', to_quantity: 1, to_unit: 'box' }],
    }));

    expect(result.success).toBe(true);
  });

  test('menolak kemasan yang ditulis lebih kecil dari satuan hitungan', () => {
    const result = schema.safeParse(formData({
      purchase_unit: 'box',
      selling_unit: 'pcs',
      sellable_units: ['box', 'pcs'],
      // "1 pcs = 12 box" — kebalik, satu pcs tidak mungkin berisi 12 box.
      unit_mappings: [{ from_quantity: 1, from_unit: 'pcs', to_quantity: 12, to_unit: 'box' }],
    }));

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.join('.') === 'unit_mappings.0.to_quantity')).toBe(true);
  });

  test('menolak kemasan di atas satuan hitungan yang isinya kurang dari satu', () => {
    const result = schema.safeParse(formData({
      sellable_units: ['pcs', 'box'],
      unit_mappings: [{ from_quantity: 12, from_unit: 'box', to_quantity: 1, to_unit: 'pcs' }],
    }));

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.join('.') === 'unit_mappings.0.to_quantity')).toBe(true);
  });

  test('menerima produk tanpa harga beli dan harga jual', () => {
    const result = schema.safeParse(formData({
      purchase_price: undefined,
      selling_price: undefined,
    }));

    expect(result.success).toBe(true);
  });

  test('tetap menolak harga negatif kalau diisi', () => {
    const result = schema.safeParse(formData({ selling_price: -1 }));

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.join('.') === 'selling_price')).toBe(true);
  });

  test('menerima satuan kemasan buatan pengguna yang terdaftar di master unit', () => {
    const schemaWithMasterUnits = createStockSchema(undefined, {
      getUnitCategory: (unit) => resolveUnitCategory(unit, unit === 'karton' ? 'package' : undefined),
    });

    const result = schemaWithMasterUnits.safeParse(formData({
      sellable_units: ['pcs', 'karton'],
      unit_mappings: [{ from_quantity: 1, from_unit: 'karton', to_quantity: 24, to_unit: 'pcs' }],
    }));

    expect(result.success).toBe(true);
  });
});
