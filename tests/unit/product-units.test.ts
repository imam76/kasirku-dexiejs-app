import { describe, expect, test } from 'bun:test';
import type { Product } from '@/types';
import { resolveUnitCategory } from '@/constants/units';
import { createStockSchema } from '@/lib/validations/stock';
import { getConversionRatio, hasConversionRatio } from '@/utils/pricing';
import {
  buildUnitMappingPair,
  buildUnitMappingsFromLegacyUnits,
  convertProductQuantity,
  getProductDefaultUnit,
  getProductUnits,
  normalizeProductUnitMappings,
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

    expect(unitMappings).toEqual([{ unit: 'kg', base_unit: 'gram', ratio: 1000, qty: 1, base_qty: 1000 }]);
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

    expect(unitMappings).toEqual([{ unit: 'box', base_unit: 'pcs', ratio: 12, qty: 1, base_qty: 12 }]);
    expect(droppedUnits).toEqual([]);
  });
});

describe('konversi dua arah', () => {
  test('pasangan angka jadi sumber kebenaran, ratio cuma turunannya', () => {
    const product = buildProduct({
      purchase_unit: 'pack',
      selling_unit: 'pcs',
      unit_mappings: [{ unit: 'pcs', base_unit: 'pack', ratio: 999, qty: 12, base_qty: 1 }],
    });

    expect(normalizeProductUnitMappings(product)).toEqual([
      { unit: 'pcs', base_unit: 'pack', ratio: 1 / 12, qty: 12, base_qty: 1 },
    ]);
  });

  test('baris lama yang cuma punya ratio dibaca sebagai 1 satuan', () => {
    const product = buildProduct({
      unit_mappings: [{ unit: 'box', base_unit: 'pcs', ratio: 12 }],
    });

    expect(normalizeProductUnitMappings(product)).toEqual([
      { unit: 'box', base_unit: 'pcs', ratio: 12, qty: 1, base_qty: 12 },
    ]);
  });

  test('ratio pecahan lama dipulihkan jadi pasangan bilangan bulat', () => {
    expect(buildUnitMappingPair(1 / 12)).toEqual({ qty: 12, base_qty: 1, ratio: 1 / 12 });
    expect(buildUnitMappingPair(0.08333333)).toEqual({ qty: 12, base_qty: 1, ratio: 1 / 12 });
    expect(buildUnitMappingPair(24)).toEqual({ qty: 1, base_qty: 24, ratio: 24 });
  });

  test('12 pcs kembali jadi tepat 1 pack, bukan 0.999999', () => {
    const product = buildProduct({
      purchase_unit: 'pack',
      selling_unit: 'pcs',
      unit_mappings: [{ unit: 'pcs', base_unit: 'pack', ratio: 1 / 12, qty: 12, base_qty: 1 }],
    });

    expect(convertProductQuantity(product, 12, 'pcs', 'pack')).toBe(1);
    expect(convertProductQuantity(product, 1, 'pack', 'pcs')).toBe(12);
  });

  test('konversi antar satuan non-dasar lewat satu pembagian saja', () => {
    const product = buildProduct({
      purchase_unit: 'pack',
      unit_mappings: [
        { unit: 'pcs', base_unit: 'pack', ratio: 1 / 12, qty: 12, base_qty: 1 },
        { unit: 'dus', base_unit: 'pack', ratio: 6, qty: 1, base_qty: 6 },
      ],
    });

    expect(convertProductQuantity(product, 1, 'dus', 'pcs')).toBe(72);
    expect(convertProductQuantity(product, 72, 'pcs', 'dus')).toBe(1);
  });

  test('satuan tanpa konversi tetap ditolak', () => {
    const product = buildProduct({ unit_mappings: [] });

    expect(convertProductQuantity(product, 1, 'box', 'pcs')).toBeUndefined();
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

  test('12 pcs masuk sebagai tepat 1 pack saat satuan utamanya kemasan', () => {
    const product = buildProduct({
      purchase_unit: 'pack',
      selling_unit: 'pcs',
      unit_mappings: [{ unit: 'pcs', base_unit: 'pack', ratio: 1 / 12, qty: 12, base_qty: 1 }],
    });

    expect(getPurchaseReceiptStockQuantity(
      { ...receiptItem('pcs'), quantity: 12, received_quantity: 12 },
      product,
    )).toBe(1);
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

  test('menerima pasangan angka dua arah untuk satuan yang lebih kecil dari satuan utama', () => {
    const result = schema.safeParse(formData({
      purchase_unit: 'kg',
      selling_unit: 'gram',
      unit_mappings: [{ unit: 'gram', base_unit: 'kg', ratio: 0.001, qty: 1000, base_qty: 1 }],
    }));

    expect(result.success).toBe(true);
  });

  test('menerima satuan utama kemasan yang dijual per satuan hitungan', () => {
    const result = schema.safeParse(formData({
      purchase_unit: 'box',
      selling_unit: 'pcs',
      unit_mappings: [{ unit: 'pcs', base_unit: 'box', ratio: 1 / 12, qty: 12, base_qty: 1 }],
    }));

    expect(result.success).toBe(true);
  });

  test('menerima kemasan bertingkat, mis. satuan utama dus dengan isi box', () => {
    const result = schema.safeParse(formData({
      purchase_unit: 'dus',
      selling_unit: 'box',
      unit_mappings: [{ unit: 'box', base_unit: 'dus', ratio: 0.25, qty: 4, base_qty: 1 }],
    }));

    expect(result.success).toBe(true);
  });

  test('tetap menolak pasangan kategori yang tidak sepadan', () => {
    const result = schema.safeParse(formData({
      purchase_unit: 'kg',
      selling_unit: 'kg',
      unit_mappings: [{ unit: 'box', base_unit: 'kg', ratio: 5, qty: 1, base_qty: 5 }],
    }));

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.join('.') === 'unit_mappings.0.unit')).toBe(true);
  });

  test('menolak sisi kiri yang kosong', () => {
    const result = schema.safeParse(formData({
      purchase_unit: 'kg',
      selling_unit: 'gram',
      unit_mappings: [{ unit: 'gram', base_unit: 'kg', ratio: 0, qty: 0, base_qty: 1 }],
    }));

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.join('.') === 'unit_mappings.0.qty')).toBe(true);
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
