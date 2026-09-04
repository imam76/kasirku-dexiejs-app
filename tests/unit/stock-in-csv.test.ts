import { describe, expect, test } from 'bun:test';
import type { Product } from '@/types';
import {
  buildStockInImportFromCsv,
  createStockInTemplateRows,
  buildStockInImport,
} from '@/utils/stockIn/stockInCsv';

const NOW = '2026-08-06T00:00:00.000Z';

const baseProduct: Product = {
  id: 'product-a',
  sku: 'A',
  name: 'Produk A',
  category: 'sembako',
  purchase_unit: 'pcs',
  selling_unit: 'pcs',
  purchase_price: 10_000,
  selling_price: 12_000,
  stock: 5,
  product_type: 'FINISHED_GOOD',
  is_visible_in_pos: true,
  wholesale_prices: [],
  sellable_units: ['pcs'],
  unit_mappings: [],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const multiUnitProduct: Product = {
  ...baseProduct,
  id: 'product-b',
  sku: 'B',
  name: 'Produk B',
  unit_mappings: [{ from_quantity: 1, from_unit: 'dus', to_quantity: 24, to_unit: 'pcs' }],
  sellable_units: ['pcs', 'dus'],
};

const importCsv = (
  csv: string,
  products: Product[],
  mode: 'OPENING' | 'PURCHASE',
  createId: () => string = () => 'generated-id',
) => buildStockInImportFromCsv(csv, { products, mode, now: NOW, createId });

describe('stock-in file format', () => {
  test('reads an existing product by sku in its own stock unit', () => {
    const result = importCsv([
      'sku,qty,satuan,harga_beli',
      'A,10,pcs,9500',
    ].join('\n'), [baseProduct], 'PURCHASE');

    expect(result.fileErrors).toEqual([]);
    expect(result.rowErrors).toEqual([]);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({
      quantity: 10,
      unit: 'pcs',
      baseQuantity: 10,
      costPerUnit: 9500,
      costPerBaseUnit: 9500,
      isNewProduct: false,
    });
    expect(result.lines[0].product.id).toBe('product-a');
    expect(result.totalValue).toBe(95_000);
  });

  test('converts a non-base unit into the stock unit', () => {
    const result = importCsv([
      'sku,qty,satuan,harga_beli',
      'B,10,dus,240000',
    ].join('\n'), [multiUnitProduct], 'PURCHASE');

    expect(result.rowErrors).toEqual([]);
    expect(result.lines[0]).toMatchObject({
      quantity: 10,
      unit: 'dus',
      baseQuantity: 240,
      costPerUnit: 240_000,
      costPerBaseUnit: 10_000,
    });
    expect(result.totalValue).toBe(2_400_000);
  });

  test('defaults a blank unit to the product stock unit', () => {
    const result = importCsv([
      'sku,qty,harga_beli',
      'A,4,9000',
    ].join('\n'), [baseProduct], 'PURCHASE');

    expect(result.rowErrors).toEqual([]);
    expect(result.lines[0]).toMatchObject({ unit: 'pcs', baseQuantity: 4 });
  });

  test('rejects a unit the product does not know', () => {
    const result = importCsv([
      'sku,qty,satuan,harga_beli',
      'A,2,dus,9000',
    ].join('\n'), [baseProduct], 'PURCHASE');

    expect(result.lines).toEqual([]);
    expect(result.rowErrors[0].messages[0]).toContain('satuan dus tidak dikenal');
  });

  test('works without a name column at all', () => {
    const result = importCsv([
      'sku,qty,harga_beli',
      'A,3,9000',
    ].join('\n'), [baseProduct], 'PURCHASE');

    expect(result.fileErrors).toEqual([]);
    expect(result.lines[0].product.name).toBe('Produk A');
  });

  test('blocks the file when no quantity column exists', () => {
    const result = importCsv([
      'sku,harga_beli',
      'A,9000',
    ].join('\n'), [baseProduct], 'PURCHASE');

    expect(result.lines).toEqual([]);
    expect(result.fileErrors[0]).toContain('Kolom jumlah');
  });
});

describe('stock-in quantity rules', () => {
  test('skips blank and zero quantities instead of failing them', () => {
    const result = importCsv([
      'sku,qty,harga_beli',
      'A,,9000',
      'B,0,9000',
    ].join('\n'), [baseProduct, multiUnitProduct], 'PURCHASE');

    expect(result.lines).toEqual([]);
    expect(result.rowErrors).toEqual([]);
    expect(result.skippedRowCount).toBe(2);
  });

  test('rejects a negative or non-numeric quantity', () => {
    const negative = importCsv([
      'sku,qty,harga_beli',
      'A,-3,9000',
    ].join('\n'), [baseProduct], 'PURCHASE');
    const invalid = importCsv([
      'sku,qty,harga_beli',
      'A,tiga,9000',
    ].join('\n'), [baseProduct], 'PURCHASE');

    expect(negative.rowErrors[0].messages[0]).toContain('tidak boleh negatif');
    expect(invalid.rowErrors[0].messages[0]).toContain('harus berupa angka');
  });

  test('keeps valid rows when another row is broken', () => {
    const result = importCsv([
      'sku,qty,harga_beli',
      'A,5,9000',
      'B,-1,9000',
    ].join('\n'), [baseProduct, multiUnitProduct], 'PURCHASE');

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].product.id).toBe('product-a');
    expect(result.rowErrors).toHaveLength(1);
    expect(result.rowErrors[0].rowNumber).toBe(3);
  });
});

describe('stock-in price rules per mode', () => {
  test('opening balance requires a price because it sets the journal value', () => {
    const missing = importCsv([
      'sku,qty,harga_beli',
      'A,5,',
    ].join('\n'), [baseProduct], 'OPENING');
    const zero = importCsv([
      'sku,qty,harga_beli',
      'A,5,0',
    ].join('\n'), [baseProduct], 'OPENING');

    expect(missing.lines).toEqual([]);
    expect(missing.rowErrors[0].messages[0]).toContain('harga wajib diisi');
    expect(zero.lines).toEqual([]);
    expect(zero.rowErrors[0].messages[0]).toContain('lebih dari 0');
  });

  test('purchase accepts a pending price', () => {
    const result = importCsv([
      'sku,qty,harga_beli',
      'A,5,',
    ].join('\n'), [baseProduct], 'PURCHASE');

    expect(result.rowErrors).toEqual([]);
    expect(result.lines[0].costPerUnit).toBeUndefined();
    expect(result.lines[0].totalValue).toBeUndefined();
    expect(result.totalValue).toBe(0);
  });

  test('purchase accepts a zero price for bonus goods', () => {
    const result = importCsv([
      'sku,qty,harga_beli',
      'A,5,0',
    ].join('\n'), [baseProduct], 'PURCHASE');

    expect(result.rowErrors).toEqual([]);
    expect(result.lines[0].costPerUnit).toBe(0);
  });

  test('rejects a negative price in both modes', () => {
    const result = importCsv([
      'sku,qty,harga_beli',
      'A,5,-100',
    ].join('\n'), [baseProduct], 'PURCHASE');

    expect(result.rowErrors[0].messages[0]).toContain('angka 0 atau lebih');
  });
});

describe('stock-in product identification', () => {
  test('creates a new product from master columns when the sku is unknown', () => {
    const result = importCsv([
      'sku,name,purchase_unit,selling_unit,satuan_2,isi_2,qty,satuan,harga_beli',
      'C,Produk C,pcs,pcs,dus,12,2,dus,120000',
    ].join('\n'), [baseProduct], 'PURCHASE', () => 'product-c');

    expect(result.rowErrors).toEqual([]);
    expect(result.newProducts).toHaveLength(1);
    expect(result.newProducts[0]).toMatchObject({
      id: 'product-c',
      sku: 'C',
      name: 'Produk C',
      stock: 0,
    });
    expect(result.lines[0]).toMatchObject({
      isNewProduct: true,
      unit: 'dus',
      baseQuantity: 24,
      costPerBaseUnit: 10_000,
    });
  });

  test('rejects a new product that has no name', () => {
    const result = importCsv([
      'sku,qty,harga_beli',
      'ZZZ,5,9000',
    ].join('\n'), [baseProduct], 'PURCHASE');

    expect(result.lines).toEqual([]);
    expect(result.newProducts).toEqual([]);
    expect(result.rowErrors[0].messages[0]).toContain('harus punya nama');
  });

  test('matches an existing product by exact name when no sku is given', () => {
    const result = importCsv([
      'name,qty,harga_beli',
      'Produk A,5,9000',
    ].join('\n'), [baseProduct], 'PURCHASE');

    expect(result.rowErrors).toEqual([]);
    expect(result.lines[0].product.id).toBe('product-a');
    expect(result.lines[0].isNewProduct).toBe(false);
  });

  test('refuses to guess when a name matches more than one product', () => {
    const twin: Product = { ...baseProduct, id: 'product-a2', sku: 'A2' };
    const result = importCsv([
      'name,qty,harga_beli',
      'Produk A,5,9000',
    ].join('\n'), [baseProduct, twin], 'PURCHASE');

    expect(result.lines).toEqual([]);
    expect(result.rowErrors[0].messages[0]).toContain('lebih dari satu produk');
  });
});

describe('stock-in duplicate rules per mode', () => {
  test('opening balance rejects the same product twice', () => {
    const result = importCsv([
      'sku,qty,harga_beli',
      'A,5,9000',
      'A,3,9000',
    ].join('\n'), [baseProduct], 'OPENING');

    expect(result.lines).toHaveLength(1);
    expect(result.rowErrors).toHaveLength(1);
    expect(result.rowErrors[0].messages[0]).toContain('lebih dari satu kali');
  });

  test('purchase keeps repeated product lines', () => {
    const result = buildStockInImport({
      rows: [
        ['sku', 'name', 'qty', 'harga_beli'],
        ['A', 'Produk A', '5', '9000'],
        ['', 'Produk A', '3', '9500'],
      ],
      products: [baseProduct],
      mode: 'PURCHASE',
      now: NOW,
    });

    expect(result.rowErrors).toEqual([]);
    expect(result.lines).toHaveLength(2);
    expect(result.lines.map((line) => line.quantity)).toEqual([5, 3]);
  });
});

describe('stock-in template', () => {
  test('pre-fills every product and imports cleanly while quantities are blank', () => {
    const template = createStockInTemplateRows([baseProduct, multiUnitProduct]);
    const result = buildStockInImport({
      rows: template.map((row) => row.map((cell) => String(cell ?? ''))),
      products: [baseProduct, multiUnitProduct],
      mode: 'OPENING',
      now: NOW,
    });

    expect(template[0]).toEqual(['sku', 'name', 'qty', 'satuan', 'harga_beli', 'notes']);
    expect(result.fileErrors).toEqual([]);
    expect(result.rowErrors).toEqual([]);
    expect(result.lines).toEqual([]);
    expect(result.skippedRowCount).toBe(2);
  });

  test('carries notes through to the line', () => {
    const result = importCsv([
      'sku,qty,harga_beli,notes',
      'A,5,9000,sisa gudang lama',
    ].join('\n'), [baseProduct], 'OPENING');

    expect(result.lines[0].notes).toBe('sisa gudang lama');
  });

  /**
   * File barang masuk sering dibuat dari hasil ekspor produk, lalu kolom
   * satuannya dikosongkan karena dianggap tidak relevan. Di file master itu
   * berarti "hapus konversinya"; di sini tidak boleh, karena satu-satunya
   * maksud file ini adalah menambah stok.
   */
  test('never clears unit conversions even when the unit columns are blank', () => {
    const result = importCsv([
      'sku,name,purchase_unit,satuan_2,isi_2,qty,satuan,harga_beli',
      'B,Produk B,pcs,,,2,dus,240000',
    ].join('\n'), [multiUnitProduct], 'PURCHASE');

    expect(result.rowErrors).toEqual([]);
    expect(result.lines[0].unit).toBe('dus');
    expect(result.lines[0].baseQuantity).toBe(48);
  });
});
