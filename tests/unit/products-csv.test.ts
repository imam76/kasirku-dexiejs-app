import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import type { Product } from '@/types';
import {
  buildProductCsvImportItems,
  createProductCsvExportRows,
} from '@/utils/productsCsv';
import { buildProductMasterImportPlan } from '@/utils/productMasterImport';

const stockManagementHookSource = readFileSync(
  new URL('../../src/hooks/useStockManagement.tsx', import.meta.url),
  'utf8',
);

const existingProduct: Product = {
  id: 'product-a',
  sku: 'A',
  name: 'Produk A Lama',
  category: 'non_consumable',
  purchase_unit: 'pcs',
  selling_unit: 'pcs',
  purchase_price: 12_000,
  selling_price: 15_000,
  stock: 17,
  wholesale_prices: [],
  sellable_units: ['pcs'],
  unit_mappings: [],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('product master CSV import safety', () => {
  test('preserves the wholesale tier unit through CSV export and import', () => {
    const product: Product = {
      ...existingProduct,
      wholesale_prices: [{
        min_quantity: 2,
        unit: 'dus',
        price: 216_000,
        price_type: 'bundle',
      }],
      sellable_units: ['pcs', 'dus'],
      unit_mappings: [{
        from_quantity: 1,
        from_unit: 'dus',
        to_quantity: 12,
        to_unit: 'pcs',
      }],
    };
    const rows = createProductCsvExportRows([product]);
    const csv = rows
      .map((row) => row.map((cell) => {
        const value = String(cell ?? '');
        return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
      }).join(','))
      .join('\n');

    const imported = buildProductCsvImportItems(csv);

    expect(imported.errors).toEqual([]);
    expect(imported.items).toHaveLength(1);
    expect(imported.items[0].wholesale_prices).toEqual(product.wholesale_prices);
    expect(imported.items[0].unit_mappings).toEqual(product.unit_mappings);
  });

  test('imports a legacy unit mapping as a canonical explicit equation', () => {
    const legacyMapping = JSON.stringify([{ unit: 'dus', base_unit: 'pcs', ratio: 12 }]);
    const csv = [
      'sku,name,purchase_unit,selling_unit,unit_mappings',
      `LEGACY-1,Produk Legacy,pcs,dus,"${legacyMapping.replaceAll('"', '""')}"`,
    ].join('\n');

    const imported = buildProductCsvImportItems(csv);

    expect(imported.errors).toEqual([]);
    expect(imported.items[0].unit_mappings).toEqual([{
      from_quantity: 1,
      from_unit: 'dus',
      to_quantity: 12,
      to_unit: 'pcs',
    }]);
    expect(imported.items[0].sellable_units).toEqual(['dus']);
  });

  test('blocks a master import whose sellable unit has an invalid equation', () => {
    const invalidMapping = JSON.stringify([{
      from_quantity: 1,
      from_unit: 'box',
      to_quantity: 0,
      to_unit: 'ikat',
    }]);
    const parsed = buildProductCsvImportItems([
      'sku,name,purchase_unit,selling_unit,sellable_units,unit_mappings',
      `INVALID-UNIT,Produk Invalid,box,box,box|ikat,"${invalidMapping.replaceAll('"', '""')}"`,
    ].join('\n'));

    expect(parsed.errors).toEqual([]);
    const plan = buildProductMasterImportPlan({
      items: parsed.items,
      existingProducts: [],
      now: '2026-08-04T00:00:00.000Z',
      createId: () => 'invalid-unit-product',
      globalConversions: [],
    });

    expect(plan.items).toEqual([]);
    expect(plan.errors).toContainEqual(expect.stringContaining('konversi satuan ikat ke box'));
  });

  test('preserves existing prices and stock when CSV fields are blank', () => {
    const parsed = buildProductCsvImportItems([
      'sku,name,purchase_price,selling_price,stock,purchase_quantity',
      'A,Produk A,,,,',
    ].join('\n'));

    expect(parsed.errors).toEqual([]);
    expect(parsed.ignoredOperationalColumns).toEqual({
      stock: 'stock',
      purchase_quantity: 'purchase_quantity',
    });
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].purchase_price).toBeUndefined();
    expect(parsed.items[0].selling_price).toBeUndefined();
    expect('stock' in parsed.items[0]).toBe(false);
    expect('purchase_quantity' in parsed.items[0]).toBe(false);

    const plan = buildProductMasterImportPlan({
      items: parsed.items,
      existingProducts: [existingProduct],
      now: '2026-07-31T00:00:00.000Z',
      createId: () => 'unused',
    });

    expect(plan.errors).toEqual([]);
    expect(plan.updatedCount).toBe(1);
    expect(plan.items[0].product).toMatchObject({
      id: existingProduct.id,
      name: 'Produk A',
      purchase_price: 12_000,
      selling_price: 15_000,
      stock: 17,
    });
  });

  test('accepts explicit zero prices but ignores legacy stock and purchase quantity values', () => {
    const parsed = buildProductCsvImportItems([
      'sku,name,purchase_price,selling_price,stock,purchase_quantity',
      'B,Produk B,0,0,99,10',
    ].join('\n'));

    expect(parsed.errors).toEqual([]);
    expect(parsed.items[0]).toMatchObject({
      sku: 'B',
      purchase_price: 0,
      selling_price: 0,
    });

    const plan = buildProductMasterImportPlan({
      items: parsed.items,
      existingProducts: [],
      now: '2026-07-31T00:00:00.000Z',
      createId: () => 'product-b',
    });

    expect(plan.errors).toEqual([]);
    expect(plan.createdCount).toBe(1);
    expect(plan.items[0].product).toMatchObject({
      id: 'product-b',
      purchase_price: 0,
      selling_price: 0,
      stock: 0,
    });
  });

  test('imports POS visibility fields without overwriting them when the columns are blank', () => {
    const explicit = buildProductCsvImportItems([
      'sku,name,product_type,is_visible_in_pos',
      'A,Produk A,RAW_MATERIAL,false',
    ].join('\n'));
    const blank = buildProductCsvImportItems([
      'sku,name,product_type,is_visible_in_pos',
      'A,Produk A,,',
    ].join('\n'));

    expect(explicit.errors).toEqual([]);
    expect(explicit.items[0]).toMatchObject({
      product_type: 'RAW_MATERIAL',
      is_visible_in_pos: false,
    });

    const preservedPlan = buildProductMasterImportPlan({
      items: blank.items,
      existingProducts: [{
        ...existingProduct,
        product_type: 'RAW_MATERIAL',
        is_visible_in_pos: false,
      }],
      now: '2026-07-31T00:00:00.000Z',
    });
    expect(preservedPlan.items[0].product).toMatchObject({
      product_type: 'RAW_MATERIAL',
      is_visible_in_pos: false,
    });
  });

  test('rejects invalid POS visibility field values', () => {
    const parsed = buildProductCsvImportItems([
      'sku,name,product_type,is_visible_in_pos',
      'A,Produk A,SERVICE,mungkin',
    ].join('\n'));

    expect(parsed.items).toEqual([]);
    expect(parsed.errors.join(' ')).toContain('product_type');
    expect(parsed.errors.join(' ')).toContain('is_visible_in_pos');
  });

  test('returns no importable items when any row has a blocking error', () => {
    const parsed = buildProductCsvImportItems([
      'sku,name,purchase_price,selling_price',
      'A,Produk A,12000,15000',
      'B,,invalid,20000',
    ].join('\n'));

    expect(parsed.errors.length).toBeGreaterThan(0);
    expect(parsed.validRowCount).toBe(1);
    expect(parsed.items).toEqual([]);
  });

  test('rejects non-numeric and negative price values instead of silently coercing them', () => {
    const invalidText = buildProductCsvImportItems([
      'sku,name,purchase_price',
      'A,Produk A,123abc',
    ].join('\n'));
    const negative = buildProductCsvImportItems([
      'sku,name,selling_price',
      'A,Produk A,-1',
    ].join('\n'));

    expect(invalidText.errors[0]).toContain('purchase_price/harga_beli');
    expect(invalidText.items).toEqual([]);
    expect(negative.errors[0]).toContain('selling_price/harga_jual');
    expect(negative.items).toEqual([]);
  });

  test('rejects conflicting product id and SKU matches', () => {
    const parsed = buildProductCsvImportItems([
      'id,sku,name',
      'product-a,B,Produk Konflik',
    ].join('\n'));
    const otherProduct: Product = {
      ...existingProduct,
      id: 'product-b',
      sku: 'B',
      name: 'Produk B',
    };

    const plan = buildProductMasterImportPlan({
      items: parsed.items,
      existingProducts: [existingProduct, otherProduct],
      now: '2026-07-31T00:00:00.000Z',
      createId: () => 'unused',
    });

    expect(plan.items).toEqual([]);
    expect(plan.errors[0]).toContain('menunjuk produk yang berbeda');
  });

  test('keeps current stock as export information but removes purchase quantity from export', () => {
    const [headers, row] = createProductCsvExportRows([existingProduct]);

    expect(headers).toContain('stock');
    expect(headers).not.toContain('purchase_quantity');
    expect(row[headers.indexOf('stock')]).toBe(17);
  });

  test('queues every master-import row with remote stock preservation', () => {
    const importStart = stockManagementHookSource.indexOf(
      'const importCsvMutation',
    );
    const importEnd = stockManagementHookSource.indexOf(
      '\n  const onSubmit',
      importStart,
    );
    const importSource = stockManagementHookSource.slice(importStart, importEnd);

    expect(importStart).toBeGreaterThan(-1);
    expect(importSource).toContain('db.syncQueue.bulkAdd');
    expect(importSource).toContain('preserveStock: true');
    expect(importSource).not.toContain(
      "preserveStock: operation === 'update'",
    );
  });
});
