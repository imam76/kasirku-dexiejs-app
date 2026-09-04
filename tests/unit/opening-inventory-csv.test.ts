import { describe, expect, test } from 'bun:test';
import type { Product } from '@/types';
import {
  buildOpeningInventoryCsvTemplateRows,
  OPENING_INVENTORY_CSV_HEADERS,
  parseOpeningInventoryCsv,
} from '@/utils/openingBalances/inventoryCsv';

const products: Product[] = [
  {
    id: 'product-a',
    sku: 'SKU-A',
    name: 'Produk A',
    category: 'non_consumable',
    purchase_unit: 'pcs',
    selling_unit: 'pcs',
    purchase_price: 12_000,
    selling_price: 15_000,
    stock: 0,
    wholesale_prices: [],
    sellable_units: ['pcs'],
    unit_mappings: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'product-b',
    sku: 'SKU-B',
    name: 'Produk B',
    category: 'non_consumable',
    purchase_unit: 'kg',
    selling_unit: 'kg',
    purchase_price: 7_500,
    selling_price: 10_000,
    stock: 0,
    wholesale_prices: [],
    sellable_units: ['kg'],
    unit_mappings: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];

describe('opening inventory CSV', () => {
  test('builds the canonical template with blank quantity and purchase price as HPP', () => {
    const rows = buildOpeningInventoryCsvTemplateRows(products);

    expect(rows[0]).toEqual([...OPENING_INVENTORY_CSV_HEADERS]);
    expect(rows[1]).toEqual([
      'product-a',
      'SKU-A',
      'Produk A',
      'pcs',
      '',
      12_000,
      '',
    ]);
    expect(rows[2]).toEqual([
      'product-b',
      'SKU-B',
      'Produk B',
      'kg',
      '',
      7_500,
      '',
    ]);
  });

  test('prefills an existing stock snapshot so large migrations need less retyping', () => {
    const rows = buildOpeningInventoryCsvTemplateRows([
      { ...products[0], stock: 8.5 },
    ]);

    expect(rows[1][4]).toBe(8.5);
    expect(rows[1][5]).toBe(12_000);
  });

  test('parses canonical rows, skips blank or zero quantities, and calculates totals', () => {
    const result = parseOpeningInventoryCsv(
      [
        OPENING_INVENTORY_CSV_HEADERS.join(','),
        'product-a,SKU-A,Produk A,pcs,10,12000,Stok pembukaan',
        'product-b,SKU-B,Produk B,kg,0,7500,Diabaikan',
        'product-b,SKU-B,Produk B,kg,,7500,Diabaikan juga',
      ].join('\n'),
      products,
    );

    expect(result.errors).toEqual([]);
    expect(result.sourceRowCount).toBe(3);
    expect(result.validRowCount).toBe(1);
    expect(result.skippedRowCount).toBe(2);
    expect(result.totalValue).toBe(120_000);
    expect(result.rows).toEqual([
      {
        rowNumber: 2,
        product_id: 'product-a',
        sku: 'SKU-A',
        product_name: 'Produk A',
        stock_unit: 'pcs',
        opening_quantity: 10,
        cost_per_unit: 12_000,
        notes: 'Stok pembukaan',
        total_value: 120_000,
      },
    ]);
  });

  test('accepts BOM, semicolon delimiter, quantity and cost aliases, and SKU fallback', () => {
    const result = parseOpeningInventoryCsv(
      [
        '\uFEFFsku;product_name;stock_unit;stok;harga_beli;notes',
        'SKU-B;Nama lama;kg;3;7.500;hasil hitung fisik',
      ].join('\r\n'),
      products,
    );

    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      product_id: 'product-b',
      product_name: 'Produk B',
      opening_quantity: 3,
      cost_per_unit: 7_500,
      total_value: 22_500,
    });
  });

  test('treats one separator in quantity as decimal while cost keeps thousands format', () => {
    const result = parseOpeningInventoryCsv(
      [
        'product_id;stock_unit;opening_quantity;cost_per_unit',
        'product-a;pcs;0.125;12.000',
        'product-b;kg;1,25;7.500',
      ].join('\n'),
      products,
    );

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      opening_quantity: 0.125,
      cost_per_unit: 12_000,
      total_value: 1_500,
    });
    expect(result.rows[1]).toMatchObject({
      opening_quantity: 1.25,
      cost_per_unit: 7_500,
      total_value: 9_375,
    });
    expect(result.totalValue).toBe(10_875);
  });

  test('keeps a fractional unit cost that starts with zero', () => {
    const result = parseOpeningInventoryCsv(
      [
        'product_id;stock_unit;opening_quantity;cost_per_unit',
        'product-a;pcs;10;0.125',
      ].join('\n'),
      products,
    );

    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      opening_quantity: 10,
      cost_per_unit: 0.125,
      total_value: 1.25,
    });
  });

  test('accepts the existing product-export columns as a migration shortcut', () => {
    const result = parseOpeningInventoryCsv(
      [
        'id,sku,name,purchase_unit,purchase_price,stock',
        'product-a,SKU-A,Produk A,pcs,12000,4',
      ].join('\n'),
      products,
    );

    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      product_id: 'product-a',
      stock_unit: 'pcs',
      opening_quantity: 4,
      cost_per_unit: 12_000,
      total_value: 48_000,
    });
  });

  test('supports tab-delimited CSV and quoted multiline fields', () => {
    const result = parseOpeningInventoryCsv(
      [
        OPENING_INVENTORY_CSV_HEADERS.join('\t'),
        'product-a\tSKU-A\tProduk A\tpcs\t2\t12000\t"Hitung lantai 1,',
        'lanjut lantai 2"',
      ].join('\n'),
      products,
    );

    expect(result.errors).toEqual([]);
    expect(result.sourceRowCount).toBe(1);
    expect(result.rows[0].notes).toBe('Hitung lantai 1,\nlanjut lantai 2');
    expect(result.rows[0].rowNumber).toBe(2);
  });

  test('does not treat purchase_quantity as an opening quantity alias', () => {
    const result = parseOpeningInventoryCsv(
      [
        'product_id,sku,stock_unit,purchase_quantity,cost_per_unit',
        'product-a,SKU-A,pcs,10,12000',
      ].join('\n'),
      products,
    );

    expect(result.rows).toEqual([]);
    expect(result.errors.join(' ')).toContain('opening_quantity');
    expect(result.errors.join(' ')).toContain(
      'purchase_quantity bukan alias yang didukung',
    );
  });

  test('rejects extra columns and malformed mixed number grouping', () => {
    const extraColumn = parseOpeningInventoryCsv(
      [
        'product_id,stock_unit,opening_quantity,cost_per_unit',
        'product-a,pcs,1,25,7500',
      ].join('\n'),
      products,
    );
    const malformedGrouping = parseOpeningInventoryCsv(
      [
        'product_id;stock_unit;opening_quantity;cost_per_unit',
        'product-a;pcs;1;1,2.3',
        'product-b;kg;1;1.2,3',
      ].join('\n'),
      products,
    );

    expect(extraColumn.rows).toEqual([]);
    expect(extraColumn.errors[0]).toContain('jumlah kolom melebihi header');
    expect(malformedGrouping.rows).toEqual([]);
    expect(malformedGrouping.errors).toHaveLength(2);
    expect(malformedGrouping.errors.join(' ')).toContain(
      'cost_per_unit harus berupa angka yang valid',
    );
  });

  test('uses product_id authoritatively and rejects ID versus SKU conflicts', () => {
    const unknownId = parseOpeningInventoryCsv(
      [
        'product_id,sku,stock_unit,opening_quantity,cost_per_unit',
        'missing-product,SKU-A,pcs,1,12000',
      ].join('\n'),
      products,
    );
    const conflictingIdentity = parseOpeningInventoryCsv(
      [
        'product_id,sku,stock_unit,opening_quantity,cost_per_unit',
        'product-a,SKU-B,pcs,1,12000',
      ].join('\n'),
      products,
    );

    expect(unknownId.rows).toEqual([]);
    expect(unknownId.errors[0]).toContain(
      'product_id missing-product tidak ditemukan',
    );
    expect(conflictingIdentity.rows).toEqual([]);
    expect(conflictingIdentity.errors[0]).toContain(
      'menunjuk produk yang berbeda',
    );
  });

  test('rejects unknown SKU fallback, duplicate products, and unit mismatches', () => {
    const unknown = parseOpeningInventoryCsv(
      [
        'sku,stock_unit,opening_quantity,cost_per_unit',
        'UNKNOWN,pcs,1,1000',
      ].join('\n'),
      products,
    );
    const duplicate = parseOpeningInventoryCsv(
      [
        'product_id,sku,stock_unit,opening_quantity,cost_per_unit',
        'product-a,,pcs,1,12000',
        ',SKU-A,pcs,2,12000',
      ].join('\n'),
      products,
    );
    const unitMismatch = parseOpeningInventoryCsv(
      [
        'product_id,stock_unit,opening_quantity,cost_per_unit',
        'product-b,pcs,1,7500',
      ].join('\n'),
      products,
    );

    expect(unknown.errors[0]).toContain('SKU UNKNOWN tidak ditemukan');
    expect(duplicate.errors[0]).toContain('muncul lebih dari satu kali');
    expect(unitMismatch.errors[0]).toContain(
      'tidak sama dengan satuan stok produk',
    );
    expect(unknown.rows).toEqual([]);
    expect(duplicate.rows).toEqual([]);
    expect(unitMismatch.rows).toEqual([]);
  });

  test('blocks invalid and negative quantities and invalid, negative, or zero costs', () => {
    const cases = [
      {
        row: 'product-a,pcs,tidak-valid,12000',
        expected: 'opening_quantity harus berupa angka',
      },
      {
        row: 'product-a,pcs,-1,12000',
        expected: 'opening_quantity tidak boleh negatif',
      },
      {
        row: 'product-a,pcs,1,tidak-valid',
        expected: 'cost_per_unit harus berupa angka',
      },
      {
        row: 'product-a,pcs,1,-1',
        expected: 'cost_per_unit tidak boleh negatif',
      },
      {
        row: 'product-a,pcs,1,0',
        expected: 'cost_per_unit harus lebih dari 0',
      },
    ];

    for (const item of cases) {
      const result = parseOpeningInventoryCsv(
        [
          'product_id,stock_unit,opening_quantity,cost_per_unit',
          item.row,
        ].join('\n'),
        products,
      );

      expect(result.rows).toEqual([]);
      expect(result.errors[0]).toContain(item.expected);
    }
  });

  test('is all-or-nothing when any active row has a blocking error', () => {
    const result = parseOpeningInventoryCsv(
      [
        'product_id,stock_unit,stock,purchase_price,notes',
        'product-a,pcs,2,12000,valid',
        'product-b,kg,3,0,invalid',
      ].join('\n'),
      products,
    );

    expect(result.errors).toHaveLength(1);
    expect(result.rows).toEqual([]);
    expect(result.validRowCount).toBe(1);
    expect(result.sourceRowCount).toBe(2);
    expect(result.totalValue).toBe(0);
  });
});
