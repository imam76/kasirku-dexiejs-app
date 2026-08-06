import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import type { Product } from '@/types';
import {
  buildProductCsvImportItems,
  buildProductCsvImportItemsFromRows,
  createProductCsvExportRows,
  createProductCsvTemplateRows,
  createProductImportErrorRows,
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
  product_type: 'FINISHED_GOOD',
  is_visible_in_pos: true,
  wholesale_prices: [],
  sellable_units: ['pcs'],
  unit_mappings: [],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('product master CSV import safety', () => {
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

describe('wide unit conversion columns', () => {
  test('reads satuan/isi pairs against the purchase unit', () => {
    const parsed = buildProductCsvImportItems([
      'sku,name,purchase_unit,selling_unit,satuan_2,isi_2,satuan_3,isi_3',
      'A,Rokok Contoh,bungkus,bungkus,slop,10,dus,100',
    ].join('\n'));

    expect(parsed.errors).toEqual([]);
    expect(parsed.items[0].unit_mappings).toEqual([
      { unit: 'slop', base_unit: 'bungkus', ratio: 10 },
      { unit: 'dus', base_unit: 'bungkus', ratio: 100 },
    ]);
  });

  test('reads non-contiguous suffixes in ascending order', () => {
    const parsed = buildProductCsvImportItems([
      'sku,name,purchase_unit,satuan_4,isi_4,satuan_2,isi_2',
      'A,Produk A,pcs,dus,240,lusin,12',
    ].join('\n'));

    expect(parsed.errors).toEqual([]);
    expect(parsed.items[0].unit_mappings).toEqual([
      { unit: 'lusin', base_unit: 'pcs', ratio: 12 },
      { unit: 'dus', base_unit: 'pcs', ratio: 240 },
    ]);
  });

  test('accepts unit_N and rasio_N aliases', () => {
    const parsed = buildProductCsvImportItems([
      'sku,name,purchase_unit,unit_2,rasio_2',
      'A,Produk A,pcs,dus,24',
    ].join('\n'));

    expect(parsed.errors).toEqual([]);
    expect(parsed.items[0].unit_mappings).toEqual([
      { unit: 'dus', base_unit: 'pcs', ratio: 24 },
    ]);
  });

  test('rejects an incomplete unit pair without dropping the other rows', () => {
    const parsed = buildProductCsvImportItems([
      'sku,name,purchase_unit,satuan_2,isi_2',
      'A,Produk A,pcs,dus,',
      'B,Produk B,pcs,dus,24',
    ].join('\n'));

    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].sku).toBe('B');
    expect(parsed.rowErrors).toHaveLength(1);
    expect(parsed.rowErrors[0].rowNumber).toBe(2);
    expect(parsed.rowErrors[0].messages[0]).toContain('isi_2');
  });

  test('rejects a ratio that is zero or negative', () => {
    const zero = buildProductCsvImportItems([
      'sku,name,purchase_unit,satuan_2,isi_2',
      'A,Produk A,pcs,dus,0',
    ].join('\n'));
    const negative = buildProductCsvImportItems([
      'sku,name,purchase_unit,satuan_2,isi_2',
      'A,Produk A,pcs,dus,-4',
    ].join('\n'));

    expect(zero.items).toEqual([]);
    expect(zero.errors[0]).toContain('isi_2');
    expect(negative.items).toEqual([]);
    expect(negative.errors[0]).toContain('isi_2');
  });

  test('rejects a unit name that collides with the purchase unit', () => {
    const parsed = buildProductCsvImportItems([
      'sku,name,purchase_unit,satuan_2,isi_2',
      'A,Produk A,dus,Dus,10',
    ].join('\n'));

    expect(parsed.items).toEqual([]);
    expect(parsed.errors[0]).toContain('dipakai lebih dari sekali');
  });
});

describe('wide wholesale price columns', () => {
  test('reads wholesale tiers sorted by minimum quantity with a unit default', () => {
    const parsed = buildProductCsvImportItems([
      'sku,name,grosir_qty_1,grosir_harga_1,grosir_qty_2,grosir_harga_2',
      'A,Produk A,24,9000,12,9500',
    ].join('\n'));

    expect(parsed.errors).toEqual([]);
    expect(parsed.items[0].wholesale_prices).toEqual([
      { min_quantity: 12, price: 9500, price_type: 'unit' },
      { min_quantity: 24, price: 9000, price_type: 'unit' },
    ]);
  });

  test('reads an explicit bundle tier type', () => {
    const parsed = buildProductCsvImportItems([
      'sku,name,grosir_qty_1,grosir_harga_1,grosir_tipe_1',
      'A,Produk A,6,50000,bundle',
    ].join('\n'));

    expect(parsed.errors).toEqual([]);
    expect(parsed.items[0].wholesale_prices).toEqual([
      { min_quantity: 6, price: 50_000, price_type: 'bundle' },
    ]);
  });

  test('rejects an incomplete wholesale pair', () => {
    const parsed = buildProductCsvImportItems([
      'sku,name,grosir_qty_1,grosir_harga_1',
      'A,Produk A,24,',
    ].join('\n'));

    expect(parsed.items).toEqual([]);
    expect(parsed.errors[0]).toContain('berpasangan');
  });
});

describe('legacy JSON columns', () => {
  test('still reads unit_mappings written as JSON', () => {
    const parsed = buildProductCsvImportItems([
      'sku,name,purchase_unit,unit_mappings',
      'A,Produk A,pcs,"[{""unit"":""dus"",""base_unit"":""pcs"",""ratio"":24}]"',
    ].join('\n'));

    expect(parsed.errors).toEqual([]);
    expect(parsed.items[0].unit_mappings).toEqual([
      { unit: 'dus', base_unit: 'pcs', ratio: 24 },
    ]);
  });

  test('rejects a row that fills both the JSON column and the wide columns', () => {
    const parsed = buildProductCsvImportItems([
      'sku,name,purchase_unit,satuan_2,isi_2,unit_mappings',
      'A,Produk A,pcs,dus,24,"[{""unit"":""lusin"",""base_unit"":""pcs"",""ratio"":12}]"',
    ].join('\n'));

    expect(parsed.items).toEqual([]);
    expect(parsed.errors[0]).toContain('tidak boleh diisi bersamaan');
  });
});

describe('partial import reporting', () => {
  test('imports valid rows and collects only the broken ones', () => {
    const parsed = buildProductCsvImportItems([
      'sku,name,purchase_price',
      'A,Produk A,1000',
      'B,Produk B,2000',
      'C,,3000',
      'D,Produk D,4000',
    ].join('\n'));

    expect(parsed.items).toHaveLength(3);
    expect(parsed.validRowCount).toBe(3);
    expect(parsed.rowErrors).toHaveLength(1);
    expect(parsed.rowErrors[0].rowNumber).toBe(4);
    expect(parsed.fileErrors).toEqual([]);
  });

  test('keeps the original cells of a failed row for the downloadable report', () => {
    const parsed = buildProductCsvImportItems([
      'sku,name,purchase_price',
      'A,Produk A,1000',
      'B,,harga-salah',
    ].join('\n'));

    expect(parsed.rowErrors[0].rawRow).toEqual(['B', '', 'harga-salah']);

    const errorRows = createProductImportErrorRows(parsed.headerRow, parsed.rowErrors);
    expect(errorRows[0]).toEqual(['baris', 'error', 'sku', 'name', 'purchase_price']);
    expect(errorRows[1][0]).toBe(3);
    expect(String(errorRows[1][1])).toContain('name/nama kosong');
    expect(errorRows[1].slice(2)).toEqual(['B', '', 'harga-salah']);
  });

  test('still blocks the whole file when the name column is missing', () => {
    const parsed = buildProductCsvImportItems([
      'sku,harga_beli',
      'A,1000',
    ].join('\n'));

    expect(parsed.items).toEqual([]);
    expect(parsed.fileErrors).toHaveLength(1);
    expect(parsed.fileErrors[0]).toContain('name');
  });

  test('drops only the duplicated SKU row when planning against existing products', () => {
    const parsed = buildProductCsvImportItems([
      'sku,name',
      'A,Produk A',
      'B,Produk B',
    ].join('\n'));
    const duplicateSkuProducts: Product[] = [
      { ...existingProduct, id: 'product-a1', sku: 'A' },
      { ...existingProduct, id: 'product-a2', sku: 'A' },
    ];

    const plan = buildProductMasterImportPlan({
      items: parsed.items,
      existingProducts: duplicateSkuProducts,
      now: '2026-07-31T00:00:00.000Z',
      createId: () => 'product-b',
    });

    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].product.sku).toBe('B');
    expect(plan.rowErrors).toHaveLength(1);
    expect(plan.rowErrors[0].rowNumber).toBe(2);
    expect(plan.rowErrors[0].rawRow).toEqual(['A', 'Produk A']);
  });
});

describe('sellable units and round trip', () => {
  test('derives sellable units from the base unit plus every wide unit', () => {
    const parsed = buildProductCsvImportItems([
      'sku,name,purchase_unit,selling_unit,satuan_2,isi_2',
      'A,Produk A,pcs,pcs,dus,24',
    ].join('\n'));

    const plan = buildProductMasterImportPlan({
      items: parsed.items,
      existingProducts: [],
      now: '2026-07-31T00:00:00.000Z',
      createId: () => 'product-a',
    });

    expect(plan.items[0].product.sellable_units).toEqual(['pcs', 'dus']);
  });

  test('keeps an explicit sellable_units column as the override', () => {
    const parsed = buildProductCsvImportItems([
      'sku,name,purchase_unit,selling_unit,satuan_2,isi_2,sellable_units',
      'A,Produk A,pcs,pcs,dus,24,dus',
    ].join('\n'));

    expect(parsed.items[0].sellable_units).toEqual(['dus']);
  });

  test('survives an export then import round trip without JSON cells', () => {
    const product: Product = {
      ...existingProduct,
      unit_mappings: [{ unit: 'dus', base_unit: 'pcs', ratio: 24 }],
      wholesale_prices: [{ min_quantity: 12, price: 11_000, price_type: 'unit' }],
    };
    const exported = createProductCsvExportRows([product]);

    expect(exported[0]).toContain('satuan_2');
    expect(exported[0]).toContain('grosir_qty_1');
    expect(exported[0]).not.toContain('unit_mappings');

    const reimported = buildProductCsvImportItemsFromRows(
      exported.map((row) => row.map((cell) => String(cell ?? ''))),
    );

    expect(reimported.errors).toEqual([]);
    expect(reimported.items[0].unit_mappings).toEqual(product.unit_mappings);
    expect(reimported.items[0].wholesale_prices).toEqual(product.wholesale_prices);
  });

  test('falls back to a JSON column when a mapping is not based on the purchase unit', () => {
    const product: Product = {
      ...existingProduct,
      purchase_unit: 'pcs',
      unit_mappings: [{ unit: 'dus', base_unit: 'lusin', ratio: 20 }],
    };
    const [headers, row] = createProductCsvExportRows([product]);

    expect(headers).toContain('unit_mappings');
    expect(String(row[headers.indexOf('unit_mappings')])).toContain('lusin');
  });

  test('ships a template that imports cleanly as-is', () => {
    const template = createProductCsvTemplateRows();
    const parsed = buildProductCsvImportItemsFromRows(
      template.map((row) => row.map((cell) => String(cell ?? ''))),
    );

    expect(parsed.fileErrors).toEqual([]);
    expect(parsed.rowErrors).toEqual([]);
    expect(parsed.items).toHaveLength(4);
    expect(parsed.items[1].unit_mappings).toEqual([
      { unit: 'renteng', base_unit: 'pcs', ratio: 10, qty: 1, base_qty: 10 },
      { unit: 'dus', base_unit: 'pcs', ratio: 120, qty: 1, base_qty: 120 },
    ]);
    // Satuan yang lebih kecil dari satuan utama ditulis di sisi kiri.
    expect(parsed.items[2].unit_mappings).toEqual([
      { unit: 'gram', base_unit: 'kg', ratio: 0.001, qty: 1000, base_qty: 1 },
    ]);
    expect(parsed.items[3].wholesale_prices).toEqual([
      { min_quantity: 12, price: 14_000, price_type: 'unit' },
    ]);
  });

  test('reads a conversion written with the smaller unit on the left', () => {
    const parsed = buildProductCsvImportItems([
      'sku,name,purchase_unit,selling_unit,satuan_2,jumlah_2,isi_2',
      'A,Produk A,pack,pcs,pcs,12,1',
    ].join('\n'));

    expect(parsed.errors).toEqual([]);
    expect(parsed.items[0].unit_mappings).toEqual([
      { unit: 'pcs', base_unit: 'pack', ratio: 1 / 12, qty: 12, base_qty: 1 },
    ]);
  });

  test('keeps the typed pair through an export then import round trip', () => {
    const product: Product = {
      ...existingProduct,
      purchase_unit: 'pack',
      selling_unit: 'pcs',
      unit_mappings: [{ unit: 'pcs', base_unit: 'pack', ratio: 1 / 12, qty: 12, base_qty: 1 }],
    };
    const exported = createProductCsvExportRows([product]);

    expect(exported[0]).toContain('jumlah_2');
    expect(exported[0]).not.toContain('unit_mappings');

    const reimported = buildProductCsvImportItemsFromRows(
      exported.map((row) => row.map((cell) => String(cell ?? ''))),
    );

    expect(reimported.errors).toEqual([]);
    expect(reimported.items[0].unit_mappings).toEqual(product.unit_mappings);
  });
});
