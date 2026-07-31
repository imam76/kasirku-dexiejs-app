import type { Product } from '@/types';
import type { ExportRows } from '@/utils/export';

export const OPENING_INVENTORY_CSV_HEADERS = [
  'product_id',
  'sku',
  'product_name',
  'stock_unit',
  'opening_quantity',
  'cost_per_unit',
  'notes',
] as const;

export interface OpeningInventoryCsvImportRow {
  rowNumber: number;
  product_id: string;
  sku?: string;
  product_name: string;
  stock_unit: string;
  opening_quantity: number;
  cost_per_unit: number;
  notes?: string;
  total_value: number;
}

export interface OpeningInventoryCsvImportResult {
  rows: OpeningInventoryCsvImportRow[];
  errors: string[];
  sourceRowCount: number;
  validRowCount: number;
  skippedRowCount: number;
  totalValue: number;
}

interface ParsedCsvRecord {
  cells: string[];
  rowNumber: number;
}

interface ParsedCsv {
  records: ParsedCsvRecord[];
  errors: string[];
}

type ParsedNumber =
  | { kind: 'blank' }
  | { kind: 'invalid' }
  | { kind: 'value'; value: number };

const normalizeHeader = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\uFEFF/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '');

const normalizeSku = (value: string | undefined) =>
  (value ?? '').trim().toLowerCase();

const normalizeUnit = (value: string | undefined) =>
  (value ?? '').trim().toLowerCase();

const roundCurrency = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const getHeaderRecord = (content: string) => {
  let header = '';
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        header += char;
        header += nextChar;
        index += 1;
      } else {
        inQuotes = !inQuotes;
        header += char;
      }
      continue;
    }

    if (char === '\n' && !inQuotes) break;
    header += char;
  }

  return header;
};

const countDelimiterOutsideQuotes = (value: string, delimiter: string) => {
  let count = 0;
  let inQuotes = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const nextChar = value[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) count += 1;
  }

  return count;
};

const detectDelimiter = (content: string) => {
  const header = getHeaderRecord(content);
  const candidates = [',', ';', '\t'] as const;
  let selected: (typeof candidates)[number] = ',';
  let selectedCount = -1;

  for (const candidate of candidates) {
    const count = countDelimiterOutsideQuotes(header, candidate);
    if (count > selectedCount) {
      selected = candidate;
      selectedCount = count;
    }
  }

  return selected;
};

const parseCsv = (rawContent: string): ParsedCsv => {
  const content = rawContent
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  const delimiter = detectDelimiter(content);
  const records: ParsedCsvRecord[] = [];
  const errors: string[] = [];
  let cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  let currentLine = 1;
  let recordStartLine = 1;

  const finishRecord = () => {
    cells.push(cell);
    if (cells.some((value) => value.trim().length > 0)) {
      records.push({
        cells,
        rowNumber: recordStartLine,
      });
    }
    cells = [];
    cell = '';
  };

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
        if (char === '\n') currentLine += 1;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === delimiter) {
      cells.push(cell);
      cell = '';
      continue;
    }

    if (char === '\n') {
      finishRecord();
      currentLine += 1;
      recordStartLine = currentLine;
      continue;
    }

    cell += char;
  }

  if (inQuotes) {
    errors.push(`Baris ${recordStartLine}: tanda kutip CSV tidak ditutup.`);
  }

  if (cell.length > 0 || cells.length > 0) finishRecord();

  return {
    records,
    errors,
  };
};

interface ParseFlexibleNumberOptions {
  singleSeparatorAsDecimal?: boolean;
}

const parseFlexibleNumber = (
  rawValue: string | undefined,
  options: ParseFlexibleNumberOptions = {},
): ParsedNumber => {
  const raw = (rawValue ?? '').trim();
  if (!raw) return { kind: 'blank' };

  const compact = raw.replace(/\s+/g, '');
  if (!/^[+-]?\d+(?:[.,]\d+)*$/.test(compact)) {
    return { kind: 'invalid' };
  }

  const commaCount = (compact.match(/,/g) ?? []).length;
  const dotCount = (compact.match(/\./g) ?? []).length;
  let normalized = compact;

  if (commaCount > 0 && dotCount > 0) {
    const decimalSeparator =
      compact.lastIndexOf(',') > compact.lastIndexOf('.') ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
    const unsigned = compact.replace(/^[+-]/, '');
    const decimalIndex = unsigned.lastIndexOf(decimalSeparator);
    const integerPart = unsigned.slice(0, decimalIndex);
    const fractionPart = unsigned.slice(decimalIndex + 1);
    const integerGroups = integerPart.split(thousandsSeparator);
    const hasValidThousandsGrouping = (
      integerGroups.length > 1
      && /^\d{1,3}$/.test(integerGroups[0])
      && integerGroups.slice(1).every((group) => /^\d{3}$/.test(group))
    );
    if (
      !/^\d+$/.test(fractionPart)
      || (
        !/^\d+$/.test(integerPart)
        && !hasValidThousandsGrouping
      )
    ) {
      return { kind: 'invalid' };
    }

    const sign = compact.startsWith('-') ? '-' : compact.startsWith('+') ? '+' : '';
    const normalizedInteger = integerGroups.join('');
    normalized = `${sign}${normalizedInteger}.${fractionPart}`;
  } else {
    const separator = commaCount > 0 ? ',' : dotCount > 0 ? '.' : undefined;
    if (separator) {
      const unsigned = compact.replace(/^[+-]/, '');
      const groups = unsigned.split(separator);

      if (groups.length === 2 && options.singleSeparatorAsDecimal) {
        normalized =
          separator === ',' ? compact.replace(',', '.') : compact;
      } else if (
        groups.length > 2 &&
        groups.slice(1).every((group) => group.length === 3)
      ) {
        normalized = compact.split(separator).join('');
      } else if (groups.length === 2 && groups[1].length === 3) {
        // A leading zero cannot sensibly be a thousands group. Preserve
        // fractional unit costs such as 0.125 while still accepting 7.500 as
        // the common Indonesian thousands notation.
        normalized = groups[0] === '0' || groups[0] === '+0' || groups[0] === '-0'
          ? (separator === ',' ? compact.replace(',', '.') : compact)
          : compact.split(separator).join('');
      } else if (groups.length === 2) {
        normalized =
          separator === ',' ? compact.replace(',', '.') : compact;
      } else {
        return { kind: 'invalid' };
      }
    }
  }

  const value = Number(normalized);
  return Number.isFinite(value)
    ? { kind: 'value', value }
    : { kind: 'invalid' };
};

const emptyResult = (
  errors: string[],
  sourceRowCount = 0,
): OpeningInventoryCsvImportResult => ({
  rows: [],
  errors,
  sourceRowCount,
  validRowCount: 0,
  skippedRowCount: 0,
  totalValue: 0,
});

export const buildOpeningInventoryCsvTemplateRows = (
  products: Product[],
): ExportRows => [
  [...OPENING_INVENTORY_CSV_HEADERS],
  ...products.map((product) => [
    product.id,
    product.sku ?? '',
    product.name,
    product.purchase_unit,
    Number(product.stock || 0) !== 0 ? product.stock : '',
    product.purchase_price,
    '',
  ]),
];

export const buildOpeningInventoryCsvRows =
  buildOpeningInventoryCsvTemplateRows;

export const parseOpeningInventoryCsv = (
  content: string,
  products: Product[],
): OpeningInventoryCsvImportResult => {
  const parsed = parseCsv(content);
  if (parsed.records.length === 0) {
    return emptyResult(
      parsed.errors.length > 0 ? parsed.errors : ['File CSV kosong.'],
    );
  }

  const [headerRecord, ...sourceRecords] = parsed.records;
  const headerIndexes = new Map<string, number>();
  headerRecord.cells.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (normalized && !headerIndexes.has(normalized)) {
      headerIndexes.set(normalized, index);
    }
  });

  const findHeader = (aliases: readonly string[]) => {
    for (const alias of aliases) {
      const index = headerIndexes.get(alias);
      if (index !== undefined) return index;
    }
    return undefined;
  };

  const productIdIndex = findHeader(['product_id', 'id']);
  const skuIndex = findHeader(['sku']);
  const productNameIndex = findHeader(['product_name', 'name']);
  const stockUnitIndex = findHeader(['stock_unit', 'purchase_unit']);
  const quantityIndex = findHeader(['opening_quantity', 'stock', 'stok']);
  const costIndex = findHeader([
    'cost_per_unit',
    'purchase_price',
    'harga_beli',
  ]);
  const notesIndex = findHeader(['notes']);

  const errors = [...parsed.errors];
  if (productIdIndex === undefined && skuIndex === undefined) {
    errors.push('Header product_id atau sku wajib ada.');
  }
  if (stockUnitIndex === undefined) {
    errors.push('Header stock_unit wajib ada.');
  }
  if (quantityIndex === undefined) {
    const purchaseQuantityHint = headerIndexes.has('purchase_quantity')
      ? ' purchase_quantity bukan alias yang didukung.'
      : '';
    errors.push(
      `Header opening_quantity wajib ada (alias: stock atau stok).${purchaseQuantityHint}`,
    );
  }
  if (costIndex === undefined) {
    errors.push(
      'Header cost_per_unit wajib ada (alias: purchase_price atau harga_beli).',
    );
  }

  if (errors.length > 0) {
    return emptyResult(errors, sourceRecords.length);
  }

  const productsById = new Map(products.map((product) => [product.id, product]));
  const productsBySku = new Map<string, Product[]>();
  for (const product of products) {
    const sku = normalizeSku(product.sku);
    if (!sku) continue;
    const matches = productsBySku.get(sku) ?? [];
    matches.push(product);
    productsBySku.set(sku, matches);
  }

  const candidateRows: OpeningInventoryCsvImportRow[] = [];
  const seenProductIds = new Set<string>();
  let skippedRowCount = 0;

  const getCell = (
    cells: string[],
    index: number | undefined,
  ): string | undefined =>
    index === undefined ? undefined : cells[index]?.trim();

  for (const record of sourceRecords) {
    if (
      record.cells.length > headerRecord.cells.length
      && record.cells
        .slice(headerRecord.cells.length)
        .some((value) => value.trim().length > 0)
    ) {
      errors.push(
        `Baris ${record.rowNumber}: jumlah kolom melebihi header. Gunakan delimiter yang sesuai dan beri tanda kutip pada angka desimal yang mengandung delimiter.`,
      );
      continue;
    }

    const quantity = parseFlexibleNumber(
      getCell(record.cells, quantityIndex),
      { singleSeparatorAsDecimal: true },
    );

    if (quantity.kind === 'blank') {
      skippedRowCount += 1;
      continue;
    }
    if (quantity.kind === 'invalid') {
      errors.push(
        `Baris ${record.rowNumber}: opening_quantity harus berupa angka yang valid.`,
      );
      continue;
    }
    if (quantity.value < 0) {
      errors.push(
        `Baris ${record.rowNumber}: opening_quantity tidak boleh negatif.`,
      );
      continue;
    }
    if (quantity.value === 0) {
      skippedRowCount += 1;
      continue;
    }

    const rawProductId = getCell(record.cells, productIdIndex) ?? '';
    const rawSku = getCell(record.cells, skuIndex) ?? '';
    const skuMatches = rawSku
      ? productsBySku.get(normalizeSku(rawSku)) ?? []
      : [];
    let product: Product | undefined;
    let identityInvalid = false;

    if (rawProductId) {
      product = productsById.get(rawProductId);
      if (!product) {
        errors.push(
          `Baris ${record.rowNumber}: product_id ${rawProductId} tidak ditemukan.`,
        );
        identityInvalid = true;
      } else if (
        skuMatches.some((skuProduct) => skuProduct.id !== product?.id)
      ) {
        errors.push(
          `Baris ${record.rowNumber}: product_id ${rawProductId} dan SKU ${rawSku} menunjuk produk yang berbeda.`,
        );
        identityInvalid = true;
      }
    } else if (rawSku) {
      if (skuMatches.length === 0) {
        errors.push(
          `Baris ${record.rowNumber}: SKU ${rawSku} tidak ditemukan.`,
        );
        identityInvalid = true;
      } else if (skuMatches.length > 1) {
        errors.push(
          `Baris ${record.rowNumber}: SKU ${rawSku} cocok dengan lebih dari satu produk.`,
        );
        identityInvalid = true;
      } else {
        [product] = skuMatches;
      }
    } else {
      errors.push(
        `Baris ${record.rowNumber}: product_id atau sku wajib diisi.`,
      );
      identityInvalid = true;
    }

    if (identityInvalid || !product) continue;

    if (seenProductIds.has(product.id)) {
      errors.push(
        `Baris ${record.rowNumber}: produk ${product.id} muncul lebih dari satu kali.`,
      );
      continue;
    }
    seenProductIds.add(product.id);

    const cost = parseFlexibleNumber(getCell(record.cells, costIndex));
    if (cost.kind === 'blank' || cost.kind === 'invalid') {
      errors.push(
        `Baris ${record.rowNumber}: cost_per_unit harus berupa angka yang valid.`,
      );
      continue;
    }
    if (cost.value < 0) {
      errors.push(
        `Baris ${record.rowNumber}: cost_per_unit tidak boleh negatif.`,
      );
      continue;
    }
    if (cost.value === 0) {
      errors.push(
        `Baris ${record.rowNumber}: cost_per_unit harus lebih dari 0 ketika opening_quantity lebih dari 0.`,
      );
      continue;
    }

    const rawStockUnit = getCell(record.cells, stockUnitIndex) ?? '';
    if (!rawStockUnit) {
      errors.push(`Baris ${record.rowNumber}: stock_unit wajib diisi.`);
      continue;
    }
    if (normalizeUnit(rawStockUnit) !== normalizeUnit(product.purchase_unit)) {
      errors.push(
        `Baris ${record.rowNumber}: stock_unit ${rawStockUnit} tidak sama dengan satuan stok produk (${product.purchase_unit}).`,
      );
      continue;
    }

    const totalValue = roundCurrency(quantity.value * cost.value);
    if (!Number.isFinite(totalValue)) {
      errors.push(
        `Baris ${record.rowNumber}: nilai opening_quantity × cost_per_unit terlalu besar.`,
      );
      continue;
    }

    candidateRows.push({
      rowNumber: record.rowNumber,
      product_id: product.id,
      sku: product.sku?.trim() || undefined,
      product_name:
        product.name ||
        getCell(record.cells, productNameIndex) ||
        product.id,
      stock_unit: product.purchase_unit,
      opening_quantity: quantity.value,
      cost_per_unit: cost.value,
      notes: getCell(record.cells, notesIndex) || undefined,
      total_value: totalValue,
    });
  }

  const totalValue = roundCurrency(
    candidateRows.reduce((sum, row) => sum + row.total_value, 0),
  );

  return {
    rows: errors.length > 0 ? [] : candidateRows,
    errors,
    sourceRowCount: sourceRecords.length,
    validRowCount: candidateRows.length,
    skippedRowCount,
    totalValue: errors.length > 0 ? 0 : totalValue,
  };
};
