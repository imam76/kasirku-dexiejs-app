import type { Product } from '@/types';
import {
  buildProductCsvImportItemsFromRows,
  normalizeCsvHeaderName,
  parseCsvNumber,
  parseCsvRows,
  type ProductCsvImportItem,
  type ProductCsvRowError,
} from '@/utils/productsCsv';
import { buildProductMasterImportPlan } from '@/utils/productMasterImport';
import { convertProductQuantity, getProductUnitRatio, getProductUnits } from '@/utils/productUnits';

/**
 * Which side of the cutoff a file is being read for. The routing itself belongs
 * to the Stok Masuk screen; the format only needs to know which rules are
 * stricter, because opening balances must produce a journal value and purchases
 * may legitimately arrive before their price does.
 */
export type StockInMode = 'OPENING' | 'PURCHASE';

export interface StockInLine {
  rowNumber: number;
  rawRow: string[];
  product: Product;
  isNewProduct: boolean;
  /** Quantity as typed, expressed in `unit`. */
  quantity: number;
  unit: string;
  /** Quantity converted to the product's stock unit. */
  baseQuantity: number;
  /** Cost per `unit`; undefined means the price is still pending. */
  costPerUnit?: number;
  costPerBaseUnit?: number;
  totalValue?: number;
  notes?: string;
}

export interface StockInImportResult {
  lines: StockInLine[];
  /** Products that do not exist yet, ready to be created with the document. */
  newProducts: Product[];
  fileErrors: string[];
  rowErrors: ProductCsvRowError[];
  headerRow: string[];
  /** Rows left blank on purpose, e.g. a pre-filled template row not counted. */
  skippedRowCount: number;
  totalValue: number;
}

interface BuildStockInImportInput {
  rows: string[][];
  products: Product[];
  mode: StockInMode;
  now: string;
  createId?: () => string;
}

const QUANTITY_HEADERS = [
  'qty',
  'jumlah',
  'quantity',
  'kuantitas',
  'qty_masuk',
  'jumlah_masuk',
  'opening_quantity',
  'received_quantity',
  'stock',
  'stok',
];
const UNIT_HEADERS = ['satuan', 'unit', 'stock_unit', 'satuan_masuk'];
const COST_HEADERS = ['cost_per_unit', 'harga_satuan', 'harga_beli', 'purchase_price', 'harga'];
const NOTES_HEADERS = ['notes', 'catatan', 'keterangan'];

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const normalizeName = (value: string | undefined) => (value ?? '').trim().toLowerCase();

const emptyResult = (fileError: string, headerRow: string[] = []): StockInImportResult => ({
  lines: [],
  newProducts: [],
  fileErrors: [fileError],
  rowErrors: [],
  headerRow,
  skippedRowCount: 0,
  totalValue: 0,
});

/**
 * Reads one sheet into stock-in lines. The product columns are parsed by the
 * master-data parser, so a stock-in file and a master file speak exactly the
 * same dialect: same aliases, same `satuan_N`/`isi_N` conversions, same wholesale
 * tiers. Only `qty`, `satuan`, `harga_beli`, and `notes` are added on top.
 *
 * Rows are independent. A broken row is reported and skipped; the rest stay
 * importable.
 */
export const buildStockInImport = ({
  rows,
  products,
  mode,
  now,
  createId = () => crypto.randomUUID(),
}: BuildStockInImportInput): StockInImportResult => {
  if (rows.length === 0) {
    return emptyResult('File kosong.');
  }

  const rawHeaderRow = rows[0].map((header) => header.trim());
  const normalizedHeaders = rawHeaderRow.map((header) => normalizeCsvHeaderName(header));
  const indexByHeader = new Map<string, number>();
  normalizedHeaders.forEach((header, index) => {
    if (header && !indexByHeader.has(header)) indexByHeader.set(header, index);
  });

  const pickIndex = (candidates: string[]) => {
    for (const candidate of candidates) {
      const index = indexByHeader.get(candidate);
      if (index !== undefined) return index;
    }
    return undefined;
  };

  const idxQuantity = pickIndex(QUANTITY_HEADERS);
  const idxUnit = pickIndex(UNIT_HEADERS);
  const idxCost = pickIndex(COST_HEADERS);
  const idxNotes = pickIndex(NOTES_HEADERS);

  if (idxQuantity === undefined) {
    return emptyResult(
      'Kolom jumlah tidak ditemukan (gunakan qty, jumlah, atau stok).',
      rawHeaderRow,
    );
  }

  const master = buildProductCsvImportItemsFromRows(rows, {
    nameOptional: true,
    allowDuplicateIdentity: true,
  });
  if (master.fileErrors.length > 0) {
    return {
      ...emptyResult(master.fileErrors[0], rawHeaderRow),
      fileErrors: master.fileErrors,
    };
  }

  const rowErrors: ProductCsvRowError[] = [...master.rowErrors];
  const rejectRow = (rowNumber: number, rawRow: string[], message: string) => {
    rowErrors.push({ rowNumber, rawRow, messages: [`Baris ${rowNumber}: ${message}`] });
  };

  const productsById = new Map(products.map((product) => [product.id, product]));
  const productsBySku = new Map<string, Product[]>();
  const productsByName = new Map<string, Product[]>();
  for (const product of products) {
    const sku = normalizeName(product.sku);
    if (sku) {
      const matches = productsBySku.get(sku) ?? [];
      matches.push(product);
      productsBySku.set(sku, matches);
    }
    const name = normalizeName(product.name);
    if (name) {
      const matches = productsByName.get(name) ?? [];
      matches.push(product);
      productsByName.set(name, matches);
    }
  }

  /**
   * Identity is resolved to a real product first, so two lines that name the
   * same product in different ways still collapse onto one product. Only a
   * genuinely unknown product falls back to a synthetic key.
   */
  const resolveIdentity = (item: ProductCsvImportItem):
    | { kind: 'existing'; key: string; product: Product }
    | { kind: 'new'; key: string }
    | { kind: 'ambiguous'; label: string } => {
    const byId = item.id ? productsById.get(item.id) : undefined;
    if (byId) return { kind: 'existing', key: `id:${byId.id}`, product: byId };

    const sku = normalizeName(item.sku);
    if (sku) {
      const matches = productsBySku.get(sku) ?? [];
      if (matches.length > 1) return { kind: 'ambiguous', label: `SKU ${item.sku}` };
      if (matches.length === 1) {
        return { kind: 'existing', key: `id:${matches[0].id}`, product: matches[0] };
      }
      return { kind: 'new', key: `sku:${sku}` };
    }

    const name = normalizeName(item.name);
    if (name) {
      const matches = productsByName.get(name) ?? [];
      if (matches.length > 1) return { kind: 'ambiguous', label: `nama ${item.name}` };
      if (matches.length === 1) {
        return { kind: 'existing', key: `id:${matches[0].id}`, product: matches[0] };
      }
      return { kind: 'new', key: `name:${name}` };
    }

    return { kind: 'ambiguous', label: '' };
  };

  interface StockInCandidate {
    item: ProductCsvImportItem;
    key: string;
    quantity: number;
  }

  const candidates: StockInCandidate[] = [];
  let skippedRowCount = 0;

  for (const item of master.items) {
    const rawRow = item.rawRow;
    const quantityRaw = (rawRow[idxQuantity] ?? '').trim();

    // A blank or zero quantity is how a pre-filled template says "not this one".
    if (!quantityRaw) {
      skippedRowCount += 1;
      continue;
    }
    const quantity = parseCsvNumber(quantityRaw);
    if (quantity === undefined) {
      rejectRow(item.rowNumber, rawRow, 'jumlah harus berupa angka.');
      continue;
    }
    if (quantity < 0) {
      rejectRow(item.rowNumber, rawRow, 'jumlah tidak boleh negatif.');
      continue;
    }
    if (quantity === 0) {
      skippedRowCount += 1;
      continue;
    }

    const identity = resolveIdentity(item);
    if (identity.kind === 'ambiguous') {
      rejectRow(
        item.rowNumber,
        rawRow,
        identity.label
          ? `${identity.label} cocok dengan lebih dari satu produk. Isi kolom sku untuk memastikan.`
          : 'produk tidak dikenali. Isi sku atau nama produk.',
      );
      continue;
    }
    if (identity.kind === 'new' && !item.name) {
      rejectRow(item.rowNumber, rawRow, 'produk baru harus punya nama.');
      continue;
    }

    candidates.push({
      item: identity.kind === 'existing' ? { ...item, id: identity.product.id } : item,
      key: identity.key,
      quantity,
    });
  }

  // One plan entry per product, so repeated lines never look like a master
  // import trying to write the same product twice.
  const representatives = new Map<string, ProductCsvImportItem>();
  for (const candidate of candidates) {
    if (!representatives.has(candidate.key)) representatives.set(candidate.key, candidate.item);
  }

  const plan = buildProductMasterImportPlan({
    items: Array.from(representatives.values()),
    existingProducts: products,
    now,
    createId,
  });
  rowErrors.push(...plan.rowErrors);

  const plannedByRowNumber = new Map(plan.items.map((planItem) => [planItem.rowNumber, planItem]));
  const plannedByKey = new Map<string, { product: Product; isNew: boolean }>();
  for (const [key, representative] of representatives) {
    const planned = plannedByRowNumber.get(representative.rowNumber);
    if (!planned) continue;
    plannedByKey.set(key, {
      product: planned.product,
      isNew: planned.operation === 'create',
    });
  }

  const lines: StockInLine[] = [];
  const newProducts: Product[] = [];
  const newProductIds = new Set<string>();
  const seenProductIds = new Set<string>();

  for (const { item, key, quantity } of candidates) {
    const planned = plannedByKey.get(key);
    if (!planned) continue;

    const { rowNumber, rawRow } = item;
    const { product, isNew: isNewProduct } = planned;

    // Opening balances post one line per product, so a repeat would double the
    // journal value. Purchases may legitimately list the same product twice.
    if (mode === 'OPENING' && seenProductIds.has(product.id)) {
      rejectRow(rowNumber, rawRow, `produk ${product.name} muncul lebih dari satu kali.`);
      continue;
    }
    seenProductIds.add(product.id);

    const rawUnit = idxUnit === undefined ? '' : (rawRow[idxUnit] ?? '').trim();
    const unit = rawUnit || product.purchase_unit;
    const ratio = getProductUnitRatio(product, unit, product.purchase_unit);
    if (ratio === undefined) {
      const knownUnits = getProductUnits(product).join(', ');
      rejectRow(
        rowNumber,
        rawRow,
        `satuan ${unit} tidak dikenal untuk produk ${product.name}. Satuan yang tersedia: ${knownUnits}.`,
      );
      continue;
    }

    const rawCost = idxCost === undefined ? '' : (rawRow[idxCost] ?? '').trim();
    let costPerUnit: number | undefined;
    if (rawCost) {
      const cost = parseCsvNumber(rawCost);
      if (cost === undefined || cost < 0) {
        rejectRow(rowNumber, rawRow, 'harga harus berupa angka 0 atau lebih.');
        continue;
      }
      costPerUnit = cost;
    }

    if (mode === 'OPENING') {
      if (costPerUnit === undefined) {
        rejectRow(rowNumber, rawRow, 'harga wajib diisi untuk saldo awal karena menentukan nilai persediaan.');
        continue;
      }
      if (costPerUnit === 0) {
        rejectRow(rowNumber, rawRow, 'harga saldo awal harus lebih dari 0.');
        continue;
      }
    }

    const baseQuantity = convertProductQuantity(product, quantity, unit, product.purchase_unit) ?? quantity * ratio;
    const costPerBaseUnit = costPerUnit === undefined ? undefined : costPerUnit / ratio;
    const totalValue = costPerUnit === undefined
      ? undefined
      : roundCurrency(quantity * costPerUnit);

    if (isNewProduct && !newProductIds.has(product.id)) {
      newProductIds.add(product.id);
      newProducts.push(product);
    }

    lines.push({
      rowNumber,
      rawRow,
      product,
      isNewProduct,
      quantity,
      unit,
      baseQuantity,
      costPerUnit,
      costPerBaseUnit,
      totalValue,
      notes: idxNotes === undefined ? undefined : (rawRow[idxNotes] ?? '').trim() || undefined,
    });
  }

  rowErrors.sort((a, b) => a.rowNumber - b.rowNumber);

  return {
    lines,
    newProducts,
    fileErrors: [],
    rowErrors,
    headerRow: rawHeaderRow,
    skippedRowCount,
    totalValue: roundCurrency(lines.reduce((sum, line) => sum + (line.totalValue ?? 0), 0)),
  };
};

export const buildStockInImportFromCsv = (
  csvText: string,
  options: Omit<BuildStockInImportInput, 'rows'>,
): StockInImportResult =>
  buildStockInImport({ ...options, rows: parseCsvRows(csvText) });

export const STOCK_IN_TEMPLATE_HEADERS = [
  'sku',
  'name',
  'qty',
  'satuan',
  'harga_beli',
  'notes',
] as const;

/**
 * Pre-fills every product so the file doubles as a stock count sheet: leave the
 * quantity blank for anything not being brought in.
 */
export const createStockInTemplateRows = (products: Product[]) => [
  [...STOCK_IN_TEMPLATE_HEADERS],
  ...products.map((product) => [
    product.sku ?? '',
    product.name,
    '',
    product.purchase_unit,
    product.purchase_price,
    '',
  ]),
];
