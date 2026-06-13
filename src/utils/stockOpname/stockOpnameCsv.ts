import type { ExportRows } from '@/utils/export';
import type { StockOpnameItem } from '@/types';

export const STOCK_OPNAME_CSV_HEADERS = [
  'product_id',
  'sku',
  'name',
  'system_quantity',
  'counted_quantity',
  'unit',
  'notes',
] as const;

export interface StockOpnameCsvImportRow {
  rowNumber: number;
  product_id: string;
  sku?: string;
  name?: string;
  system_quantity?: number;
  counted_quantity?: number;
  unit?: string;
  notes?: string;
}

export interface StockOpnameCsvImportResult {
  rows: StockOpnameCsvImportRow[];
  errors: string[];
}

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/^\uFEFF/, '');

const parseCsvLine = (line: string) => {
  const cells: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(cell);
      cell = '';
      continue;
    }

    cell += char;
  }

  cells.push(cell);
  return cells;
};

const parseCsvRows = (content: string) => {
  const rows: string[][] = [];
  const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let line = '';
  let inQuotes = false;

  for (let index = 0; index < normalizedContent.length; index += 1) {
    const char = normalizedContent[index];
    const nextChar = normalizedContent[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        line += char;
        line += nextChar;
        index += 1;
      } else {
        inQuotes = !inQuotes;
        line += char;
      }
      continue;
    }

    if (char === '\n' && !inQuotes) {
      if (line.trim().length > 0) {
        rows.push(parseCsvLine(line));
      }
      line = '';
      continue;
    }

    line += char;
  }

  if (line.trim().length > 0) {
    rows.push(parseCsvLine(line));
  }

  return rows;
};

const parseOptionalNumber = (value: string | undefined, rowNumber: number, field: string, errors: string[]) => {
  const normalizedValue = value?.trim();
  if (!normalizedValue) return undefined;

  const numeric = Number(normalizedValue);
  if (!Number.isFinite(numeric)) {
    errors.push(`Baris ${rowNumber}: ${field} harus berupa angka.`);
    return undefined;
  }

  return numeric;
};

export const buildStockOpnameCsvRows = (items: StockOpnameItem[]): ExportRows => [
  [...STOCK_OPNAME_CSV_HEADERS],
  ...items.map((item) => [
    item.product_id,
    item.sku ?? '',
    item.product_name,
    item.system_quantity,
    item.counted_quantity ?? '',
    item.unit,
    item.notes ?? '',
  ]),
];

export const parseStockOpnameCsv = (content: string): StockOpnameCsvImportResult => {
  const parsedRows = parseCsvRows(content);
  const errors: string[] = [];

  if (parsedRows.length === 0) {
    return {
      rows: [],
      errors: ['File CSV kosong.'],
    };
  }

  const headerCells = parsedRows[0].map(normalizeHeader);
  const headerIndex = new Map(headerCells.map((header, index) => [header, index]));

  if (!headerIndex.has('product_id')) {
    errors.push('Header product_id wajib ada.');
  }
  if (!headerIndex.has('counted_quantity')) {
    errors.push('Header counted_quantity wajib ada.');
  }

  const rows = parsedRows.slice(1).reduce<StockOpnameCsvImportRow[]>((result, cells, index) => {
    const rowNumber = index + 2;
    const getValue = (key: string) => {
      const cellIndex = headerIndex.get(key);
      return cellIndex === undefined ? undefined : cells[cellIndex]?.trim();
    };
    const productId = getValue('product_id') ?? '';
    const countedQuantity = parseOptionalNumber(getValue('counted_quantity'), rowNumber, 'counted_quantity', errors);
    const systemQuantity = parseOptionalNumber(getValue('system_quantity'), rowNumber, 'system_quantity', errors);

    if (!productId) {
      errors.push(`Baris ${rowNumber}: product_id wajib diisi.`);
      return result;
    }
    if (countedQuantity !== undefined && countedQuantity < 0) {
      errors.push(`Baris ${rowNumber}: counted_quantity tidak boleh negatif.`);
      return result;
    }

    result.push({
      rowNumber,
      product_id: productId,
      sku: getValue('sku') || undefined,
      name: getValue('name') || undefined,
      system_quantity: systemQuantity,
      counted_quantity: countedQuantity,
      unit: getValue('unit') || undefined,
      notes: getValue('notes') || undefined,
    });

    return result;
  }, []);

  return {
    rows,
    errors,
  };
};
