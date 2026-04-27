import type { Product } from '@/types';

type ProductWholesalePrice = NonNullable<Product['wholesale_prices']>[number];

export type ProductCsvImportItem = {
  id?: string;
  name: string;
  sku?: string;
  category?: string;
  purchase_unit?: string;
  selling_unit?: string;
  purchase_price: number;
  selling_price: number;
  stock: number;
  purchase_quantity?: number;
  wholesale_prices?: Product['wholesale_prices'];
  sellable_units?: string[];
};

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

  const parsed = Number.parseFloat(cleaned);
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

export const buildProductCsvImportItems = (csvText: string): { items: ProductCsvImportItem[]; errors: string[] } => {
  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    return { items: [], errors: ['CSV kosong.'] };
  }

  const headerRow = rows[0].map((h) => normalizeHeaderName(h));
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

  const errors: string[] = [];
  if (idxName === undefined) errors.push('Kolom "name" (atau "nama") tidak ditemukan.');
  if (errors.length > 0) return { items: [], errors };

  const items: ProductCsvImportItem[] = [];
  const seenSku = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const rowNumber = r + 1;
    const sku = idxSku !== undefined ? (row[idxSku] ?? '').trim() : '';
    const name = (row[idxName!] ?? '').trim();

    if (!name) {
      errors.push(`Baris ${rowNumber}: name/nama kosong.`);
      continue;
    }
    if (sku && seenSku.has(sku)) {
      errors.push(`Baris ${rowNumber}: sku duplikat di file (sku: ${sku}).`);
      continue;
    }
    if (sku) seenSku.add(sku);

    const id = idxId !== undefined ? (row[idxId] ?? '').trim() : undefined;
    const purchase_price = parseNumberFlexible(idxPurchase !== undefined ? row[idxPurchase] : undefined) ?? 0;
    const selling_price = parseNumberFlexible(idxSelling !== undefined ? row[idxSelling] : undefined) ?? 0;
    const stock = parseNumberFlexible(idxStock !== undefined ? row[idxStock] : undefined) ?? 0;
    const purchase_quantity = parseNumberFlexible(idxPurchaseQty !== undefined ? row[idxPurchaseQty] : undefined) ?? undefined;
    const category = idxCategory !== undefined ? (row[idxCategory] ?? '').trim() : undefined;
    const purchase_unit = idxPurchaseUnit !== undefined ? (row[idxPurchaseUnit] ?? '').trim() : undefined;
    const selling_unit = idxSellingUnit !== undefined ? (row[idxSellingUnit] ?? '').trim() : undefined;
    const wholesale_prices = normalizeWholesalePrices(idxWholesalePrices !== undefined ? row[idxWholesalePrices] : undefined);
    const sellable_units = parseDelimitedList(idxSellableUnits !== undefined ? row[idxSellableUnits] : undefined);

    items.push({
      id: id || undefined,
      sku,
      name,
      category: category || undefined,
      purchase_unit: purchase_unit || undefined,
      selling_unit: selling_unit || undefined,
      purchase_price,
      selling_price,
      stock,
      purchase_quantity,
      wholesale_prices,
      sellable_units,
    });
  }

  return { items, errors };
};

export const createProductCsvExportRows = (products: Product[]) => {
  const headers = [
    'id',
    'sku',
    'name',
    'category',
    'purchase_unit',
    'selling_unit',
    'purchase_price',
    'selling_price',
    'stock',
    'purchase_quantity',
    'wholesale_prices',
    'sellable_units',
    'created_at',
    'updated_at',
  ];
  return [
    headers,
    ...products.map((product) => {
      return [
        product.id,
        product.sku || '',
        product.name || '',
        product.category || 'lainnya',
        product.purchase_unit || 'pcs',
        product.selling_unit || 'pcs',
        product.purchase_price,
        product.selling_price,
        product.stock,
        '',
        product.wholesale_prices && product.wholesale_prices.length > 0 ? JSON.stringify(product.wholesale_prices) : '',
        product.sellable_units && product.sellable_units.length > 0 ? JSON.stringify(product.sellable_units) : '',
        product.created_at,
        product.updated_at,
      ];
    }),
  ];
};
