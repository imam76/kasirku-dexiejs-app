import type { Product } from '@/types';

export type ProductCsvImportItem = {
  id?: string;
  name: string;
  sku: string;
  purchase_price: number;
  selling_price: number;
  stock: number;
  purchase_quantity?: number;
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
  const idxPurchase = pickIndex(['purchase_price', 'harga_beli', 'buy_price', 'modal']);
  const idxSelling = pickIndex(['selling_price', 'harga_jual', 'sell_price', 'harga']);
  const idxStock = pickIndex(['stock', 'stok', 'qty', 'quantity', 'jumlah']);
  const idxPurchaseQty = pickIndex(['purchase_quantity', 'qty_pembelian', 'purchase_qty', 'qty_beli', 'jumlah_pembelian']);

  const errors: string[] = [];
  if (idxSku === undefined) errors.push('Kolom "sku" tidak ditemukan.');
  if (idxName === undefined) errors.push('Kolom "name" (atau "nama") tidak ditemukan.');
  if (errors.length > 0) return { items: [], errors };

  const items: ProductCsvImportItem[] = [];
  const seenSku = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const rowNumber = r + 1;
    const sku = (row[idxSku!] ?? '').trim();
    const name = (row[idxName!] ?? '').trim();

    if (!sku) {
      errors.push(`Baris ${rowNumber}: sku kosong.`);
      continue;
    }
    if (!name) {
      errors.push(`Baris ${rowNumber}: name/nama kosong (sku: ${sku}).`);
      continue;
    }
    if (seenSku.has(sku)) {
      errors.push(`Baris ${rowNumber}: sku duplikat di file (sku: ${sku}).`);
      continue;
    }
    seenSku.add(sku);

    const id = idxId !== undefined ? (row[idxId] ?? '').trim() : undefined;
    const purchase_price = parseNumberFlexible(idxPurchase !== undefined ? row[idxPurchase] : undefined) ?? 0;
    const selling_price = parseNumberFlexible(idxSelling !== undefined ? row[idxSelling] : undefined) ?? 0;
    const stock = parseNumberFlexible(idxStock !== undefined ? row[idxStock] : undefined) ?? 0;
    const purchase_quantity = parseNumberFlexible(idxPurchaseQty !== undefined ? row[idxPurchaseQty] : undefined) ?? undefined;

    items.push({
      id: id || undefined,
      sku,
      name,
      purchase_price,
      selling_price,
      stock,
      purchase_quantity,
    });
  }

  return { items, errors };
};

const escapeCsvString = (value: string) => `"${value.replace(/"/g, '""')}"`;

export const createProductCsvExportContent = (products: Product[]) => {
  const headers = ['id', 'sku', 'name', 'purchase_price', 'selling_price', 'stock', 'created_at', 'updated_at'];
  return [
    headers.join(','),
    ...products.map((product) => {
      return [
        escapeCsvString(product.id),
        escapeCsvString(product.sku || ''),
        escapeCsvString(product.name || ''),
        product.purchase_price,
        product.selling_price,
        product.stock,
        escapeCsvString(product.created_at),
        escapeCsvString(product.updated_at),
      ].join(',');
    }),
  ].join('\n');
};

export const downloadCsvContent = (csvContent: string, filename: string) => {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

