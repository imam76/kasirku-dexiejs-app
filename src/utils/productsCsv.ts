import type { Product } from '@/types';
import { normalizeProductUnitMapping } from '@/utils/productUnits';

type ProductWholesalePrice = NonNullable<Product['wholesale_prices']>[number];

export type ProductCsvImportItem = {
  rowNumber: number;
  /** Original cells, carried so a row rejected later can still be reported back. */
  rawRow: string[];
  id?: string;
  name: string;
  sku?: string;
  category?: string;
  purchase_unit?: string;
  selling_unit?: string;
  purchase_price?: number;
  selling_price?: number;
  wholesale_prices?: Product['wholesale_prices'];
  sellable_units?: string[];
  /**
   * Satuan yang isinya berbeda antara kolom `sellable_units` dan daftar satuan
   * yang punya konversi di file — baik yang diminta tanpa konversi maupun yang
   * dicoba dikeluarkan dari daftar. Dibawa terpisah supaya rencana import bisa
   * melaporkannya sebagai peringatan; barisnya sendiri tetap layak diimpor.
   */
  ignored_sellable_units?: string[];
  unit_mappings?: Product['unit_mappings'];
  product_type?: Product['product_type'];
  is_visible_in_pos?: boolean;
};

/**
 * A row that could not be imported, kept together with its original cells so the
 * user can download only the broken rows, fix them, and upload again.
 */
export interface ProductCsvRowError {
  rowNumber: number;
  rawRow: string[];
  messages: string[];
}

const parseBoolean = (value: string | undefined) => {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized) return undefined;
  if (['true', '1', 'yes', 'ya', 'tampil'].includes(normalized)) return true;
  if (['false', '0', 'no', 'tidak', 'tidak tampil'].includes(normalized)) return false;
  return undefined;
};

export interface ProductCsvIgnoredOperationalColumns {
  stock?: string;
  purchase_quantity?: string;
}

export interface ProductCsvImportResult {
  items: ProductCsvImportItem[];
  /** Every message, file-level first then row-level, for compact display. */
  errors: string[];
  /** Blocking errors only. A non-empty list means nothing can be imported. */
  fileErrors: string[];
  rowErrors: ProductCsvRowError[];
  /** Header cells as written in the source file, used to rebuild the error report. */
  headerRow: string[];
  validRowCount: number;
  ignoredOperationalColumns: ProductCsvIgnoredOperationalColumns;
}

export interface ProductCsvParseOptions {
  /**
   * Stock-in files identify existing products by sku, so they may legitimately
   * arrive without a name column. Master import keeps requiring it.
   */
  nameOptional?: boolean;
  /**
   * One product may appear on several lines of a purchase document, so stock-in
   * files opt out of the one-row-per-product rule that master import needs.
   */
  allowDuplicateIdentity?: boolean;
  /**
   * Sel kosong biasanya berarti "jangan ubah", sehingga konversi satuan dan
   * tier grosir tidak akan pernah bisa dihapus lewat file. File master selalu
   * diekspor lengkap dengan kolomnya, jadi di sana kolom yang ada tapi kosong
   * dibaca sebagai "kosongkan" — itulah yang bikin alur ekspor, hapus isinya,
   * impor lagi benar-benar menghapus. File stock-in tidak ikut aturan ini
   * karena ia cuma menumpang kolom master dan tidak pernah bermaksud mengubah
   * daftar satuan produk.
   */
  allowCollectionClearing?: boolean;
}

const normalizeHeaderName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\uFEFF/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '');

const parseNumberFlexible = (value: string | undefined) => {
  const raw = (value ?? '').trim();
  if (!raw) return undefined;

  let cleaned = raw.replace(/\s+/g, '');
  if (cleaned.includes('.') && cleaned.includes(',')) {
    if (/,(\d{1,4})$/.test(cleaned)) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',') && !cleaned.includes('.')) {
    cleaned = cleaned.replace(',', '.');
  } else {
    cleaned = cleaned.replace(/,/g, '');
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseJsonArray = <T>(value: string | undefined): T[] | undefined => {
  const raw = (value ?? '').trim();
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const parseDelimitedList = (value: string | undefined) => {
  const raw = (value ?? '').trim();
  if (!raw) return undefined;

  const fromJson = parseJsonArray<string>(raw);
  if (fromJson) return fromJson.map((item) => String(item).trim()).filter(Boolean);

  return raw
    .split(/[|,]/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const normalizeWholesalePrices = (value: string | undefined): Product['wholesale_prices'] | undefined => {
  const parsed = parseJsonArray<ProductWholesalePrice>(value);
  if (!parsed) return undefined;

  const prices = parsed
    .map((price) => ({
      min_quantity: Number(price?.min_quantity),
      price: Number(price?.price),
      price_type: price?.price_type === 'bundle' ? 'bundle' as const : 'unit' as const,
    }))
    .filter((price) => Number.isFinite(price.min_quantity) && price.min_quantity > 0 && Number.isFinite(price.price) && price.price >= 0);

  return prices.length > 0 ? prices : undefined;
};

/**
 * Kolom JSON `unit_mappings` menerima dua bentuk: persamaan eksplisit yang
 * dipakai sekarang, dan baris lama `{ unit, base_unit, ratio }` — termasuk yang
 * membawa pasangan `qty`/`base_qty`. Keduanya dinormalkan lewat satu pintu.
 */
const normalizeUnitMappings = (
  value: string | undefined,
  fallbackBaseUnit: string,
): Product['unit_mappings'] | undefined => {
  const parsed = parseJsonArray<unknown>(value);
  if (!parsed) return undefined;

  const mappings = parsed
    .map((mapping) => normalizeProductUnitMapping(mapping, fallbackBaseUnit))
    .filter((mapping): mapping is NonNullable<Product['unit_mappings']>[number] => Boolean(mapping));

  return mappings.length > 0 ? mappings : undefined;
};

const UNIT_NAME_COLUMN_PREFIXES = ['satuan', 'unit'];
const UNIT_RATIO_COLUMN_PREFIXES = ['isi', 'rasio', 'ratio', 'konversi'];
/** Sisi kiri konversi, mis. `jumlah_2=12` untuk "12 pcs = 1 pack". */
const UNIT_QTY_COLUMN_PREFIXES = ['jumlah', 'qty'];
const WHOLESALE_QTY_COLUMN_PREFIXES = ['grosir_qty', 'wholesale_min', 'min_qty'];
const WHOLESALE_PRICE_COLUMN_PREFIXES = ['grosir_harga', 'wholesale_price', 'harga_grosir'];
const WHOLESALE_TYPE_COLUMN_PREFIXES = ['grosir_tipe', 'wholesale_type'];

/**
 * Collects repeating numbered columns such as `satuan_2`, `isi_2`, `grosir_qty_1`.
 * Returns the column index by suffix number so a spreadsheet user can add as many
 * units or wholesale tiers as needed without ever touching JSON.
 */
const collectIndexedColumns = (normalizedHeaders: string[], prefixes: string[]) => {
  const pattern = new RegExp(`^(?:${prefixes.join('|')})_(\\d+)$`);
  const columnBySuffix = new Map<number, number>();

  normalizedHeaders.forEach((header, columnIndex) => {
    const match = header.match(pattern);
    if (!match) return;

    const suffix = Number(match[1]);
    if (!Number.isInteger(suffix) || suffix < 1) return;
    if (columnBySuffix.has(suffix)) return;

    columnBySuffix.set(suffix, columnIndex);
  });

  return columnBySuffix;
};

const sortedSuffixes = (...maps: Array<Map<number, number>>) => {
  const suffixes = new Set<number>();
  for (const map of maps) {
    for (const suffix of map.keys()) suffixes.add(suffix);
  }
  return Array.from(suffixes).sort((a, b) => a - b);
};

const readCell = (row: string[], columnIndex: number | undefined) => (
  columnIndex === undefined ? '' : (row[columnIndex] ?? '').trim()
);

const parseCsv = (text: string) => {
  const input = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const firstLine = input.split('\n').find((l) => l.trim().length > 0) ?? '';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const delimiter = tabCount >= semicolonCount && tabCount >= commaCount ? '\t' : semicolonCount > commaCount ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        const next = input[i + 1];
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === delimiter) {
      row.push(field);
      field = '';
      continue;
    }

    if (ch === '\n') {
      row.push(field);
      field = '';
      const isEmptyRow = row.every((c) => c.trim().length === 0);
      if (!isEmptyRow) rows.push(row);
      row = [];
      continue;
    }

    field += ch;
  }

  row.push(field);
  const isEmptyRow = row.every((c) => c.trim().length === 0);
  if (!isEmptyRow) rows.push(row);

  return rows;
};

const emptyResult = (fileError: string): ProductCsvImportResult => ({
  items: [],
  errors: [fileError],
  fileErrors: [fileError],
  rowErrors: [],
  headerRow: [],
  validRowCount: 0,
  ignoredOperationalColumns: {},
});

/**
 * Parses an already-tabulated sheet. The CSV and XLSX entry points both funnel
 * here so both file types obey exactly the same rules.
 *
 * Rows are independent: a broken row is collected in `rowErrors` and skipped,
 * the rest still import. That is safe because master import never writes stock
 * or cash, so a partially imported file leaves no operational balance behind.
 */
export const buildProductCsvImportItemsFromRows = (
  rows: string[][],
  options: ProductCsvParseOptions = {},
): ProductCsvImportResult => {
  if (rows.length === 0) {
    return emptyResult('CSV kosong.');
  }

  const rawHeaderRow = rows[0].map((header) => header.trim());
  const headerRow = rawHeaderRow.map((h) => normalizeHeaderName(h));
  const indexByHeader = new Map<string, number>();
  headerRow.forEach((h, idx) => {
    if (h && !indexByHeader.has(h)) indexByHeader.set(h, idx);
  });

  const pickIndex = (candidates: string[]) => {
    for (const c of candidates) {
      const idx = indexByHeader.get(c);
      if (idx !== undefined) return idx;
    }
    return undefined;
  };

  const idxId = pickIndex(['id', 'product_id', 'uuid']);
  const idxName = pickIndex(['name', 'nama', 'product_name', 'nama_produk']);
  const idxSku = pickIndex(['sku', 'kode', 'kode_produk', 'product_sku']);
  const idxCategory = pickIndex(['category', 'kategori']);
  const idxPurchaseUnit = pickIndex(['purchase_unit', 'satuan_beli', 'unit_beli']);
  const idxSellingUnit = pickIndex(['selling_unit', 'satuan_jual', 'unit_jual']);
  const idxPurchase = pickIndex(['purchase_price', 'harga_beli', 'buy_price', 'modal']);
  const idxSelling = pickIndex(['selling_price', 'harga_jual', 'sell_price', 'harga']);
  const idxStock = pickIndex(['stock', 'stok', 'qty', 'quantity', 'jumlah']);
  const idxPurchaseQty = pickIndex(['purchase_quantity', 'qty_pembelian', 'purchase_qty', 'qty_beli', 'jumlah_pembelian']);
  const idxWholesalePrices = pickIndex(['wholesale_prices', 'harga_grosir']);
  const idxSellableUnits = pickIndex(['sellable_units', 'satuan_bisa_dijual']);
  const idxUnitMappings = pickIndex(['unit_mappings', 'konversi_satuan_produk', 'product_unit_mappings']);
  const ignoredOperationalColumns: ProductCsvIgnoredOperationalColumns = {
    stock: idxStock === undefined ? undefined : rawHeaderRow[idxStock],
    purchase_quantity: idxPurchaseQty === undefined ? undefined : rawHeaderRow[idxPurchaseQty],
  };
  const idxProductType = pickIndex(['product_type', 'tipe_produk']);
  const idxVisibleInPos = pickIndex(['is_visible_in_pos', 'tampil_di_pos']);

  const unitNameColumns = collectIndexedColumns(headerRow, UNIT_NAME_COLUMN_PREFIXES);
  const unitRatioColumns = collectIndexedColumns(headerRow, UNIT_RATIO_COLUMN_PREFIXES);
  const unitQtyColumns = collectIndexedColumns(headerRow, UNIT_QTY_COLUMN_PREFIXES);
  const unitSuffixes = sortedSuffixes(unitNameColumns, unitRatioColumns);
  const wholesaleQtyColumns = collectIndexedColumns(headerRow, WHOLESALE_QTY_COLUMN_PREFIXES);
  const wholesalePriceColumns = collectIndexedColumns(headerRow, WHOLESALE_PRICE_COLUMN_PREFIXES);
  const wholesaleTypeColumns = collectIndexedColumns(headerRow, WHOLESALE_TYPE_COLUMN_PREFIXES);
  const wholesaleSuffixes = sortedSuffixes(wholesaleQtyColumns, wholesalePriceColumns);

  if (idxName === undefined && !options.nameOptional) {
    return {
      ...emptyResult('Kolom "name" (atau "nama") tidak ditemukan.'),
      headerRow: rawHeaderRow,
      ignoredOperationalColumns,
    };
  }

  const items: ProductCsvImportItem[] = [];
  const rowErrors: ProductCsvRowError[] = [];
  const seenSku = new Set<string>();
  const seenId = new Set<string>();

  const allowCollectionClearing = options.allowCollectionClearing ?? true;
  const hasUnitColumns = unitSuffixes.length > 0 || idxUnitMappings !== undefined;
  const hasWholesaleColumns = wholesaleSuffixes.length > 0 || idxWholesalePrices !== undefined;

  /**
   * Membedakan "kolomnya ada tapi barisnya dikosongkan" (kosongkan daftarnya)
   * dari "kolomnya memang tidak ikut di file" (jangan sentuh apa pun).
   */
  const emptyListWhenBlank = <T>(parsed: T[] | undefined, columnsPresent: boolean) => (
    parsed ?? (allowCollectionClearing && columnsPresent ? ([] as T[]) : undefined)
  );

  const parseOptionalNonNegativeNumber = (
    rawValue: string | undefined,
    fieldLabel: string,
    rowNumber: number,
    messages: string[],
  ) => {
    if (!(rawValue ?? '').trim()) return undefined;

    const value = parseNumberFlexible(rawValue);
    if (value === undefined || value < 0) {
      messages.push(`Baris ${rowNumber}: ${fieldLabel} harus berupa angka 0 atau lebih.`);
      return undefined;
    }

    return value;
  };

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const rowNumber = r + 1;
    const messages: string[] = [];
    const sku = idxSku !== undefined ? (row[idxSku] ?? '').trim() : '';
    const name = idxName !== undefined ? (row[idxName] ?? '').trim() : '';

    // A stock-in file may name nothing and lean on sku alone; whoever consumes
    // the item decides whether a missing name is fatal.
    if (!name && !options.nameOptional) {
      rowErrors.push({ rowNumber, rawRow: row, messages: [`Baris ${rowNumber}: name/nama kosong.`] });
      continue;
    }
    if (sku && seenSku.has(sku) && !options.allowDuplicateIdentity) {
      rowErrors.push({
        rowNumber,
        rawRow: row,
        messages: [`Baris ${rowNumber}: sku duplikat di file (sku: ${sku}).`],
      });
      continue;
    }
    if (sku) seenSku.add(sku);

    const id = idxId !== undefined ? (row[idxId] ?? '').trim() : undefined;
    if (id && seenId.has(id) && !options.allowDuplicateIdentity) {
      rowErrors.push({
        rowNumber,
        rawRow: row,
        messages: [`Baris ${rowNumber}: id duplikat di file (id: ${id}).`],
      });
      continue;
    }
    if (id) seenId.add(id);

    const purchase_price = parseOptionalNonNegativeNumber(
      idxPurchase !== undefined ? row[idxPurchase] : undefined,
      'purchase_price/harga_beli',
      rowNumber,
      messages,
    );
    const selling_price = parseOptionalNonNegativeNumber(
      idxSelling !== undefined ? row[idxSelling] : undefined,
      'selling_price/harga_jual',
      rowNumber,
      messages,
    );
    const category = idxCategory !== undefined ? (row[idxCategory] ?? '').trim() : undefined;
    const purchase_unit = idxPurchaseUnit !== undefined ? (row[idxPurchaseUnit] ?? '').trim() : undefined;
    const selling_unit = idxSellingUnit !== undefined ? (row[idxSellingUnit] ?? '').trim() : undefined;

    const rawUnitMappingsCell = idxUnitMappings !== undefined ? (row[idxUnitMappings] ?? '').trim() : '';
    const rawWholesaleCell = idxWholesalePrices !== undefined ? (row[idxWholesalePrices] ?? '').trim() : '';

    const wideUnitMappings = parseWideUnitMappings({
      row,
      rowNumber,
      suffixes: unitSuffixes,
      nameColumns: unitNameColumns,
      ratioColumns: unitRatioColumns,
      qtyColumns: unitQtyColumns,
      purchaseUnit: purchase_unit,
      messages,
    });
    const wideWholesalePrices = parseWideWholesalePrices({
      row,
      rowNumber,
      suffixes: wholesaleSuffixes,
      qtyColumns: wholesaleQtyColumns,
      priceColumns: wholesalePriceColumns,
      typeColumns: wholesaleTypeColumns,
      messages,
    });

    // Two sources for the same field would mean silently dropping one of them,
    // and a dropped price tier is invisible until a customer is charged wrong.
    if (rawUnitMappingsCell && wideUnitMappings.length > 0) {
      messages.push(
        `Baris ${rowNumber}: kolom unit_mappings dan kolom satuan_N tidak boleh diisi bersamaan.`,
      );
    }
    if (rawWholesaleCell && wideWholesalePrices.length > 0) {
      messages.push(
        `Baris ${rowNumber}: kolom wholesale_prices dan kolom grosir_N tidak boleh diisi bersamaan.`,
      );
    }

    const wholesale_prices = emptyListWhenBlank(
      wideWholesalePrices.length > 0 ? wideWholesalePrices : normalizeWholesalePrices(rawWholesaleCell),
      hasWholesaleColumns,
    );
    const unit_mappings = emptyListWhenBlank(
      wideUnitMappings.length > 0 ? wideUnitMappings : normalizeUnitMappings(rawUnitMappingsCell, purchase_unit || 'pcs'),
      hasUnitColumns,
    );

    const declaredSellableUnits = parseDelimitedList(
      idxSellableUnits !== undefined ? row[idxSellableUnits] : undefined,
    );

    // Kolom satuan yang ada di file menentukan satuan apa saja yang tersedia:
    // satuan utama plus setiap satuan yang konversinya ditulis — dari sisi mana
    // pun persamaannya ditulis, dan dari kolom lebar maupun sel JSON. Tanpa
    // aturan ini, mengosongkan kolom satuan tidak pernah benar-benar menghapus
    // satuan — `sellable_units` hasil ekspor masih menyebutnya, dan barisnya
    // justru ditolak karena satuan itu tak lagi punya konversi.
    const baseUnit = (purchase_unit || '').trim();
    const availableUnits = hasUnitColumns && unit_mappings !== undefined
      ? Array.from(new Set([
        baseUnit,
        ...unit_mappings.flatMap((mapping) => [mapping.from_unit, mapping.to_unit]),
      ].filter(Boolean)))
      : undefined;

    // Satu aturan di semua jalur: daftar satuan jual adalah satuan utama plus
    // setiap satuan yang punya konversi — sama seperti form produk, yang juga
    // tidak bisa lagi menjual satuan tanpa persamaan konversinya. Kolom
    // `sellable_units` karena itu tidak pernah menentukan daftarnya, baik untuk
    // menambah maupun mempersempit; isinya yang berbeda dilaporkan supaya
    // pengguna tahu isian itu tidak terpakai.
    let sellable_units = declaredSellableUnits;
    let ignored_sellable_units: string[] | undefined;
    if (availableUnits) {
      const declared = declaredSellableUnits ?? [];
      const sameUnit = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();
      const ignored = [
        ...declared.filter((unit) => !availableUnits.some((known) => sameUnit(known, unit))),
        ...(declared.length > 0
          ? availableUnits.filter((unit) => !declared.some((known) => sameUnit(known, unit)))
          : []),
      ];

      if (ignored.length > 0) ignored_sellable_units = ignored;
      sellable_units = availableUnits;
    }

    const rawProductType = idxProductType !== undefined ? (row[idxProductType] ?? '').trim().toUpperCase() : '';
    let product_type: Product['product_type'] | undefined = undefined;
    if (rawProductType === 'RAW_MATERIAL' || rawProductType === 'BAHAN BAKU') {
      product_type = 'RAW_MATERIAL';
    } else if (rawProductType === 'FINISHED_GOOD' || rawProductType === 'BARANG JADI') {
      product_type = 'FINISHED_GOOD';
    } else if (rawProductType) {
      messages.push(`Baris ${rowNumber}: product_type/tipe_produk harus FINISHED_GOOD atau RAW_MATERIAL.`);
    }

    const rawVisibleInPos = idxVisibleInPos !== undefined ? row[idxVisibleInPos] : undefined;
    const is_visible_in_pos = parseBoolean(rawVisibleInPos);
    if ((rawVisibleInPos ?? '').trim() && is_visible_in_pos === undefined) {
      messages.push(`Baris ${rowNumber}: is_visible_in_pos/tampil_di_pos harus true atau false.`);
    }

    if (messages.length > 0) {
      rowErrors.push({ rowNumber, rawRow: row, messages });
      continue;
    }

    items.push({
      rowNumber,
      rawRow: row,
      id: id || undefined,
      sku,
      name,
      category: category || undefined,
      purchase_unit: purchase_unit || undefined,
      selling_unit: selling_unit || undefined,
      purchase_price,
      selling_price,
      wholesale_prices,
      sellable_units,
      ignored_sellable_units,
      unit_mappings,
      product_type,
      is_visible_in_pos,
    });
  }

  return {
    items,
    errors: rowErrors.flatMap((rowError) => rowError.messages),
    fileErrors: [],
    rowErrors,
    headerRow: rawHeaderRow,
    validRowCount: items.length,
    ignoredOperationalColumns,
  };
};

interface ParseWideUnitMappingsInput {
  row: string[];
  rowNumber: number;
  suffixes: number[];
  nameColumns: Map<number, number>;
  ratioColumns: Map<number, number>;
  qtyColumns: Map<number, number>;
  purchaseUnit?: string;
  messages: string[];
}

/**
 * Reads `satuan_N` / `isi_N` pairs, with an optional `jumlah_N` on the left.
 * `jumlah_N` defaults to 1, so `satuan_2=dus, isi_2=24` still means 1 dus = 24
 * base units, while `satuan_2=pcs, jumlah_2=12, isi_2=1` means 12 pcs = 1 base
 * unit — the same conversion without a spreadsheet full of 0.0833.
 */
const parseWideUnitMappings = ({
  row,
  rowNumber,
  suffixes,
  nameColumns,
  ratioColumns,
  qtyColumns,
  purchaseUnit,
  messages,
}: ParseWideUnitMappingsInput): NonNullable<Product['unit_mappings']> => {
  const mappings: NonNullable<Product['unit_mappings']> = [];
  if (suffixes.length === 0) return mappings;

  const baseUnit = (purchaseUnit || '').trim();
  // Hanya satuan dasar yang tidak boleh diulang. Satuan jual justru sering
  // butuh baris sendiri: kalau satuan utamanya pack dan jualnya pcs, baris
  // "12 pcs = 1 pack" itulah yang bikin satuan jualnya kepakai.
  const takenUnits = new Set(
    [purchaseUnit]
      .map((unit) => (unit || '').trim().toLowerCase())
      .filter(Boolean),
  );

  for (const suffix of suffixes) {
    const unitName = readCell(row, nameColumns.get(suffix));
    const ratioRaw = readCell(row, ratioColumns.get(suffix));
    const qtyRaw = readCell(row, qtyColumns.get(suffix));

    if (!unitName && !ratioRaw && !qtyRaw) continue;

    if (!unitName) {
      messages.push(`Baris ${rowNumber}: isi_${suffix} diisi tetapi satuan_${suffix} kosong.`);
      continue;
    }
    if (!ratioRaw) {
      messages.push(`Baris ${rowNumber}: satuan_${suffix} diisi tetapi isi_${suffix} kosong.`);
      continue;
    }

    const baseQty = parseNumberFlexible(ratioRaw);
    if (baseQty === undefined || baseQty <= 0) {
      messages.push(`Baris ${rowNumber}: isi_${suffix} harus berupa angka lebih dari 0.`);
      continue;
    }

    // Kolom `jumlah_N` boleh tidak ada sama sekali; file lama yang cuma punya
    // satuan dan isi tetap terbaca sebagai "1 satuan = isi satuan dasar".
    const qty = qtyRaw ? parseNumberFlexible(qtyRaw) : 1;
    if (qty === undefined || qty <= 0) {
      messages.push(`Baris ${rowNumber}: jumlah_${suffix} harus berupa angka lebih dari 0.`);
      continue;
    }

    const unitKey = unitName.toLowerCase();
    if (takenUnits.has(unitKey)) {
      messages.push(`Baris ${rowNumber}: satuan ${unitName} dipakai lebih dari sekali.`);
      continue;
    }
    takenUnits.add(unitKey);

    // `jumlah_N satuan_N = isi_N satuan_utama` masuk sebagai persamaan apa
    // adanya, jadi "12 pcs = 1 pack" tidak pernah lewat 0.0833 di tengah jalan.
    mappings.push({
      from_quantity: qty,
      from_unit: unitName,
      to_quantity: baseQty,
      to_unit: baseUnit,
    });
  }

  return mappings;
};

interface ParseWideWholesalePricesInput {
  row: string[];
  rowNumber: number;
  suffixes: number[];
  qtyColumns: Map<number, number>;
  priceColumns: Map<number, number>;
  typeColumns: Map<number, number>;
  messages: string[];
}

/** Reads `grosir_qty_N` / `grosir_harga_N` / `grosir_tipe_N` tiers. */
const parseWideWholesalePrices = ({
  row,
  rowNumber,
  suffixes,
  qtyColumns,
  priceColumns,
  typeColumns,
  messages,
}: ParseWideWholesalePricesInput): NonNullable<Product['wholesale_prices']> => {
  const prices: NonNullable<Product['wholesale_prices']> = [];
  if (suffixes.length === 0) return prices;

  for (const suffix of suffixes) {
    const qtyRaw = readCell(row, qtyColumns.get(suffix));
    const priceRaw = readCell(row, priceColumns.get(suffix));
    const typeRaw = readCell(row, typeColumns.get(suffix)).toLowerCase();

    if (!qtyRaw && !priceRaw && !typeRaw) continue;

    if (!qtyRaw || !priceRaw) {
      messages.push(
        `Baris ${rowNumber}: grosir_qty_${suffix} dan grosir_harga_${suffix} harus diisi berpasangan.`,
      );
      continue;
    }

    const minQuantity = parseNumberFlexible(qtyRaw);
    if (minQuantity === undefined || minQuantity <= 0) {
      messages.push(`Baris ${rowNumber}: grosir_qty_${suffix} harus berupa angka lebih dari 0.`);
      continue;
    }

    const price = parseNumberFlexible(priceRaw);
    if (price === undefined || price < 0) {
      messages.push(`Baris ${rowNumber}: grosir_harga_${suffix} harus berupa angka 0 atau lebih.`);
      continue;
    }

    if (typeRaw && typeRaw !== 'unit' && typeRaw !== 'bundle') {
      messages.push(`Baris ${rowNumber}: grosir_tipe_${suffix} harus unit atau bundle.`);
      continue;
    }

    prices.push({
      min_quantity: minQuantity,
      price,
      price_type: typeRaw === 'bundle' ? 'bundle' : 'unit',
    });
  }

  return prices.sort((a, b) => a.min_quantity - b.min_quantity);
};

export const buildProductCsvImportItems = (
  csvText: string,
  options: ProductCsvParseOptions = {},
): ProductCsvImportResult =>
  buildProductCsvImportItemsFromRows(parseCsv(csvText), options);

export const parseCsvRows = parseCsv;
export const normalizeCsvHeaderName = normalizeHeaderName;
export const parseCsvNumber = parseNumberFlexible;

const BASE_EXPORT_HEADERS = [
  'id',
  'sku',
  'name',
  'category',
  'purchase_unit',
  'selling_unit',
  'purchase_price',
  'selling_price',
  'stock',
] as const;

const TRAILING_EXPORT_HEADERS = [
  'sellable_units',
  'product_type',
  'is_visible_in_pos',
  'created_at',
  'updated_at',
] as const;

const normalizeUnitName = (unit?: string) => (unit || '').trim().toLowerCase();

/**
 * Kolom lebar selalu berbunyi `jumlah_N satuan_N = isi_N satuan_utama`, jadi
 * baris yang ditulis dari sisi satuan utama ("1 kg = 5 box" — bentuk yang
 * dipakai form produk) dibalik dulu. Persamaannya sama persis, cuma sisinya
 * bertukar, jadi tidak ada konversi yang berubah arti.
 */
const toWideUnitMapping = (
  mapping: NonNullable<Product['unit_mappings']>[number],
  baseUnit: string,
) => {
  if (normalizeUnitName(mapping.to_unit) === baseUnit) return mapping;
  if (normalizeUnitName(mapping.from_unit) === baseUnit) {
    return {
      from_quantity: mapping.to_quantity,
      from_unit: mapping.to_unit,
      to_quantity: mapping.from_quantity,
      to_unit: mapping.from_unit,
    };
  }

  return undefined;
};

/**
 * Unit mappings only survive a round trip through the wide columns when every
 * mapping touches the purchase unit. Anything else keeps its JSON cell so no
 * conversion is lost on export.
 */
const usesWideUnitColumns = (product: Product) => {
  const mappings = product.unit_mappings || [];
  if (mappings.length === 0) return true;

  const baseUnit = normalizeUnitName(product.purchase_unit);
  return mappings.every((mapping) => toWideUnitMapping(mapping, baseUnit) !== undefined);
};

const wideUnitMappingsOf = (product: Product) => {
  if (!usesWideUnitColumns(product)) return [];

  const baseUnit = normalizeUnitName(product.purchase_unit);
  return (product.unit_mappings || [])
    .map((mapping) => toWideUnitMapping(mapping, baseUnit))
    .filter((mapping): mapping is NonNullable<typeof mapping> => mapping !== undefined);
};

export const createProductCsvExportRows = (products: Product[]) => {
  // Kolom `jumlah_N` baru muncul kalau ada konversi yang sisi kirinya bukan 1,
  // supaya file yang isinya konversi biasa tetap sependek dulu.
  const needsUnitQtyColumn = products.some((product) => wideUnitMappingsOf(product)
    .some((mapping) => mapping.from_quantity !== 1));

  const wideUnitCount = products.reduce(
    (max, product) => (usesWideUnitColumns(product)
      ? Math.max(max, (product.unit_mappings || []).length)
      : max),
    0,
  );
  const wholesaleCount = products.reduce(
    (max, product) => Math.max(max, (product.wholesale_prices || []).length),
    0,
  );
  const needsUnitMappingsJson = products.some((product) => !usesWideUnitColumns(product));

  const unitHeaders: string[] = [];
  for (let i = 0; i < wideUnitCount; i++) {
    const suffix = i + 2;
    unitHeaders.push(`satuan_${suffix}`);
    if (needsUnitQtyColumn) unitHeaders.push(`jumlah_${suffix}`);
    unitHeaders.push(`isi_${suffix}`);
  }

  const wholesaleHeaders: string[] = [];
  for (let i = 0; i < wholesaleCount; i++) {
    const suffix = i + 1;
    wholesaleHeaders.push(`grosir_qty_${suffix}`, `grosir_harga_${suffix}`, `grosir_tipe_${suffix}`);
  }

  const headers = [
    ...BASE_EXPORT_HEADERS,
    ...unitHeaders,
    ...wholesaleHeaders,
    ...(needsUnitMappingsJson ? ['unit_mappings'] : []),
    ...TRAILING_EXPORT_HEADERS,
  ];

  return [
    headers,
    ...products.map((product) => {
      const wide = usesWideUnitColumns(product);
      const mappings = wideUnitMappingsOf(product);
      const unitCells: Array<string | number> = [];
      for (let i = 0; i < wideUnitCount; i++) {
        const mapping = mappings[i];

        unitCells.push(mapping ? mapping.from_unit : '');
        if (needsUnitQtyColumn) unitCells.push(mapping ? mapping.from_quantity : '');
        unitCells.push(mapping ? mapping.to_quantity : '');
      }

      const wholesaleCells: Array<string | number> = [];
      for (let i = 0; i < wholesaleCount; i++) {
        const price = (product.wholesale_prices || [])[i];
        wholesaleCells.push(
          price ? price.min_quantity : '',
          price ? price.price : '',
          price ? price.price_type || 'unit' : '',
        );
      }

      return [
        product.id,
        product.sku || '',
        product.name || '',
        product.category || 'non_consumable',
        product.purchase_unit || 'pcs',
        product.selling_unit || 'pcs',
        product.purchase_price,
        product.selling_price,
        product.stock,
        ...unitCells,
        ...wholesaleCells,
        ...(needsUnitMappingsJson
          ? [!wide && (product.unit_mappings || []).length > 0 ? JSON.stringify(product.unit_mappings) : '']
          : []),
        product.sellable_units && product.sellable_units.length > 0 ? JSON.stringify(product.sellable_units) : '',
        product.product_type ?? 'FINISHED_GOOD',
        product.is_visible_in_pos !== false,
        product.created_at,
        product.updated_at,
      ];
    }),
  ];
};

/**
 * A ready-to-fill template: one plain product, one multi-unit product, one
 * product whose extra unit is smaller than its base unit, and one with
 * wholesale tiers, so the shape of every column is visible.
 */
export const createProductCsvTemplateRows = () => [
  [
    'sku',
    'name',
    'category',
    'purchase_unit',
    'selling_unit',
    'purchase_price',
    'selling_price',
    'satuan_2',
    'jumlah_2',
    'isi_2',
    'satuan_3',
    'jumlah_3',
    'isi_3',
    'grosir_qty_1',
    'grosir_harga_1',
    'grosir_tipe_1',
    'product_type',
    'is_visible_in_pos',
  ],
  [
    'BRG-001', 'Air Mineral 600ml', 'minuman', 'pcs', 'pcs', 3000, 4000,
    '', '', '', '', '', '', '', '', '', 'FINISHED_GOOD', 'true',
  ],
  [
    'BRG-002', 'Kopi Sachet', 'minuman', 'pcs', 'pcs', 1500, 2000,
    'renteng', 1, 10, 'dus', 1, 120, '', '', '', 'FINISHED_GOOD', 'true',
  ],
  // Satuan jualnya lebih kecil dari satuan utama, jadi ditulis di sisi kiri:
  // 1000 gram = 1 kg, bukan 1 gram = 0.001 kg.
  [
    'BRG-003', 'Beras Curah', 'sembako', 'kg', 'gram', 13000, 15,
    'gram', 1000, 1, '', '', '', '', '', '', 'FINISHED_GOOD', 'true',
  ],
  [
    'BRG-004', 'Gula Pasir 1kg', 'sembako', 'pcs', 'pcs', 13000, 15000,
    '', '', '', '', '', '', 12, 14000, 'unit', 'FINISHED_GOOD', 'true',
  ],
];

/**
 * Rebuilds only the flagged rows, prefixed with their row number and reason, so
 * the user fixes a short file instead of hunting through the original one. The
 * same shape serves rejected rows and rows that imported with something unused;
 * only the reason column is named differently.
 */
export const createProductImportErrorRows = (
  headerRow: string[],
  rowErrors: ProductCsvRowError[],
  reasonLabel = 'error',
) => [
  ['baris', reasonLabel, ...headerRow],
  ...rowErrors.map((rowError) => [
    rowError.rowNumber,
    rowError.messages.join(' | '),
    ...rowError.rawRow,
  ]),
];
