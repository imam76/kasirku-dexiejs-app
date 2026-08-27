import { describe, expect, test } from 'bun:test';
import type { Product } from '@/types';
import { createXlsxContent } from '@/utils/export/xlsx';
import {
  buildProductCsvImportItems,
  buildProductCsvImportItemsFromRows,
  createProductCsvExportRows,
  createProductCsvTemplateRows,
} from '@/utils/productsCsv';
import { buildProductMasterImportPlan } from '@/utils/productMasterImport';
import { isSupportedProductImportFile, readWorkbookRows } from '@/utils/productsWorkbook';

const NOW = '2026-08-06T00:00:00.000Z';

const product: Product = {
  id: 'product-a',
  sku: 'A',
  name: 'Kopi Sachet',
  category: 'minuman',
  purchase_unit: 'pack',
  selling_unit: 'pcs',
  purchase_price: 12_500.5,
  selling_price: 15_000,
  stock: 17,
  product_type: 'FINISHED_GOOD',
  is_visible_in_pos: false,
  wholesale_prices: [{ min_quantity: 12, price: 11_000, price_type: 'bundle' }],
  sellable_units: ['pack', 'pcs'],
  // Sisi kiri bukan 1, jadi kolom `jumlah_2` ikut terbawa.
  unit_mappings: [{ from_quantity: 12, from_unit: 'pcs', to_quantity: 1, to_unit: 'pack' }],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

/** Menulis baris ekspor jadi .xlsx lalu membacanya kembali lewat jalur import yang asli. */
const roundTripThroughWorkbook = async (rows: ReturnType<typeof createProductCsvExportRows>) => {
  const content = createXlsxContent([{ name: 'Produk', rows }]);
  const file = new File([content], 'products_export.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  return await readWorkbookRows(file);
};

describe('product xlsx export round trip', () => {
  test('the file it writes is a file it accepts back', () => {
    expect(isSupportedProductImportFile('products_export.xlsx')).toBe(true);
    expect(isSupportedProductImportFile('template-import-produk.xlsx')).toBe(true);
  });

  test('reimports a product export without losing a single field', async () => {
    const rows = await roundTripThroughWorkbook(createProductCsvExportRows([product]));
    const parsed = buildProductCsvImportItemsFromRows(rows);

    expect(parsed.fileErrors).toEqual([]);
    expect(parsed.rowErrors).toEqual([]);

    const plan = buildProductMasterImportPlan({
      items: parsed.items,
      existingProducts: [product],
      now: NOW,
    });

    expect(plan.warnings).toEqual([]);
    const reimported = plan.items[0].product;
    expect(reimported.purchase_unit).toBe('pack');
    expect(reimported.selling_unit).toBe('pcs');
    // Angka desimal dan boolean lewat sel Excel, bukan lewat teks CSV.
    expect(reimported.purchase_price).toBe(12_500.5);
    expect(reimported.is_visible_in_pos).toBe(false);
    expect(reimported.unit_mappings).toEqual(product.unit_mappings);
    expect(reimported.wholesale_prices).toEqual(product.wholesale_prices);
    // Stok tetap milik jalur operasional, bukan master.
    expect(reimported.stock).toBe(product.stock);
  });

  test('parses to the same values as the csv path', async () => {
    const exportRows = createProductCsvExportRows([product]);
    const fromWorkbook = buildProductCsvImportItemsFromRows(await roundTripThroughWorkbook(exportRows));
    const fromCsv = buildProductCsvImportItemsFromRows(
      exportRows.map((row) => row.map((cell) => String(cell ?? ''))),
    );

    // `rawRow` sengaja tidak ikut dibandingkan: Excel mengembalikan sel boolean
    // sebagai "FALSE" sedangkan CSV menulisnya "false". Itu cuma bentuk sel yang
    // digemakan ke laporan baris gagal — `parseBoolean` menerima keduanya, dan
    // nilai yang benar-benar dipakai harus sama persis.
    const ignoringRawRow = (items: typeof fromCsv.items) =>
      items.map((item) => ({ ...item, rawRow: [] }));

    expect(ignoringRawRow(fromWorkbook.items)).toEqual(ignoringRawRow(fromCsv.items));
    expect(fromWorkbook.items[0].is_visible_in_pos).toBe(false);
  });

  test('ships a template that still imports cleanly as a workbook', async () => {
    const rows = await roundTripThroughWorkbook(createProductCsvTemplateRows());
    const parsed = buildProductCsvImportItemsFromRows(rows);

    expect(parsed.fileErrors).toEqual([]);
    expect(parsed.rowErrors).toEqual([]);
    expect(parsed.items).toHaveLength(4);

    const fromCsv = buildProductCsvImportItems(
      createProductCsvTemplateRows()
        .map((row) => row.map((cell) => String(cell ?? '')).join(','))
        .join('\n'),
    );
    expect(parsed.items).toEqual(fromCsv.items);
  });
});
