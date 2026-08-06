import { describe, expect, test } from 'bun:test';
import type { Product } from '@/types';
import { resolveUnitCategory } from '@/constants/units';
import { createStockSchema } from '@/lib/validations/stock';
import { getConversionRatio, hasConversionRatio } from '@/utils/pricing';
import {
  buildUnitMappingsFromLegacyUnits,
  getProductDefaultUnit,
  getProductUnits,
} from '@/utils/productUnits';
import { getPurchaseReceiptStockQuantity } from '@/utils/purchaseDocuments/calculatePurchaseDocumentStockImpact';
import type { PurchaseDocumentItem } from '@/types';

const buildProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'product-unit',
  sku: 'UNIT-1',
  name: 'Produk Multi Unit',
  category: 'sembako',
  purchase_unit: 'pcs',
  selling_unit: 'pcs',
  purchase_price: 10_000,
  selling_price: 12_000,
  stock: 0,
  product_type: 'FINISHED_GOOD',
  is_visible_in_pos: true,
  wholesale_prices: [],
  unit_mappings: [],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const resolveGlobalRatio = (unit: string, baseUnit: string) => (
  hasConversionRatio(unit, baseUnit) ? getConversionRatio(unit, baseUnit) : undefined
);

describe('daftar satuan produk', () => {
  test('hanya satuan dasar dan satuan yang punya konversi', () => {
    const product = buildProduct({
      unit_mappings: [{ unit: 'box', base_unit: 'pcs', ratio: 12 }],
    });

    expect(getProductUnits(product)).toEqual(['pcs', 'box']);
  });

  test('mengabaikan kolom lama sellable_units yang tanpa konversi', () => {
    const product = buildProduct({
      sellable_units: ['pcs', 'box', 'dus'],
      unit_mappings: [],
    });

    expect(getProductUnits(product)).toEqual(['pcs']);
  });

  test('satuan default jatuh ke satuan dasar kalau satuan jual belum punya konversi', () => {
    const product = buildProduct({ selling_unit: 'box', unit_mappings: [] });

    expect(getProductDefaultUnit(product)).toBe('pcs');
  });

  test('satuan default tetap dipakai kalau konversinya ada', () => {
    const product = buildProduct({
      selling_unit: 'box',
      unit_mappings: [{ unit: 'box', base_unit: 'pcs', ratio: 12 }],
    });

    expect(getProductDefaultUnit(product)).toBe('box');
  });
});

describe('pengangkatan satuan lama jadi konversi eksplisit', () => {
  test('satuan ukur diambil rationya dari konversi global', () => {
    const product = buildProduct({
      purchase_unit: 'gram',
      selling_unit: 'gram',
      sellable_units: ['gram', 'kg'],
    });

    const { unitMappings, droppedUnits } = buildUnitMappingsFromLegacyUnits(product, resolveGlobalRatio);

    expect(unitMappings).toEqual([{ unit: 'kg', base_unit: 'gram', ratio: 1000 }]);
    expect(droppedUnits).toEqual([]);
    expect(getProductUnits({ ...product, unit_mappings: unitMappings })).toEqual(['gram', 'kg']);
  });

  test('satuan kemasan tanpa ratio dibuang, bukan dianggap 1:1', () => {
    const product = buildProduct({ sellable_units: ['pcs', 'box'] });

    const { unitMappings, droppedUnits } = buildUnitMappingsFromLegacyUnits(product, resolveGlobalRatio);

    expect(unitMappings).toEqual([]);
    expect(droppedUnits).toEqual(['box']);
  });

  test('konversi yang sudah ada tidak ditimpa', () => {
    const product = buildProduct({
      sellable_units: ['pcs', 'box'],
      unit_mappings: [{ unit: 'box', base_unit: 'pcs', ratio: 12 }],
    });

    const { unitMappings, droppedUnits } = buildUnitMappingsFromLegacyUnits(product, resolveGlobalRatio);

    expect(unitMappings).toEqual([{ unit: 'box', base_unit: 'pcs', ratio: 12 }]);
    expect(droppedUnits).toEqual([]);
  });
});

describe('pembelian dengan satuan kemasan', () => {
  const receiptItem = (unit: string): PurchaseDocumentItem => ({
    id: 'line-1',
    document_id: 'doc-1',
    product_id: 'product-unit',
    product_name: 'Produk Multi Unit',
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
      unit_mappings: [{ unit: 'box', base_unit: 'pcs', ratio: 12 }],
    });

    expect(getPurchaseReceiptStockQuantity(receiptItem('box'), product)).toBe(12);
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
    unit_mappings: [],
    ...overrides,
  });

  test('menolak satuan default yang belum punya konversi', () => {
    const result = schema.safeParse(formData({ selling_unit: 'box' }));

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.join('.') === 'selling_unit')).toBe(true);
  });

  test('menerima satuan default yang konversinya sudah diisi', () => {
    const result = schema.safeParse(formData({
      selling_unit: 'box',
      unit_mappings: [{ unit: 'box', base_unit: 'pcs', ratio: 12 }],
    }));

    expect(result.success).toBe(true);
  });

  test('menolak satuan kemasan buatan pengguna kalau kategorinya tidak dikenal', () => {
    const result = schema.safeParse(formData({
      unit_mappings: [{ unit: 'karton', base_unit: 'pcs', ratio: 24 }],
    }));

    expect(result.success).toBe(false);
  });

  test('menerima satuan kemasan buatan pengguna yang terdaftar di master unit', () => {
    const schemaWithMasterUnits = createStockSchema(
      undefined,
      (unit) => resolveUnitCategory(unit, unit === 'karton' ? 'package' : undefined),
    );

    const result = schemaWithMasterUnits.safeParse(formData({
      unit_mappings: [{ unit: 'karton', base_unit: 'pcs', ratio: 24 }],
    }));

    expect(result.success).toBe(true);
  });
});
