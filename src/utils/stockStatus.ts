import type { Product } from '@/types';

/**
 * Ambang yang dipakai saat produk belum punya `min_stock` sendiri. Angkanya
 * sengaja sama dengan aturan statis lama supaya seluruh produk yang sudah ada —
 * termasuk baris Postgres lama yang kolomnya masih NULL — berperilaku persis
 * seperti sebelum ambang per-produk ada.
 */
export const DEFAULT_MIN_STOCK = 10;

export type StockStatus = 'habis' | 'menipis' | 'tersedia';

/**
 * Kolom form/CSV yang kosong atau tidak masuk akal disimpan sebagai undefined —
 * bukan 0 — supaya artinya tetap "pakai ambang bawaan" dan bukan "produk ini
 * tidak pernah dianggap menipis".
 */
export const normalizeMinStockInput = (
  value: number | undefined | null,
): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return value;
};

type StockStatusSource = Pick<Product, 'stock' | 'min_stock'>;

/**
 * `min_stock` bernilai 0 itu pilihan yang sah — artinya produk hanya dianggap
 * bermasalah kalau stoknya benar-benar habis — jadi hanya nilai kosong, negatif,
 * atau bukan angka yang jatuh ke ambang bawaan.
 */
export const resolveProductMinStock = (product: Pick<Product, 'min_stock'>): number => {
  const minStock = product.min_stock;
  if (typeof minStock !== 'number' || !Number.isFinite(minStock) || minStock < 0) {
    return DEFAULT_MIN_STOCK;
  }
  return minStock;
};

/**
 * Satu-satunya sumber kebenaran status stok. Sebelumnya tiap pemakai menghitung
 * `stock < 10` sendiri-sendiri sehingga stok 0 tampil sama persis dengan stok 9.
 */
export const getStockStatus = (product: StockStatusSource): StockStatus => {
  if (product.stock <= 0) return 'habis';
  return product.stock < resolveProductMinStock(product) ? 'menipis' : 'tersedia';
};

const STOCK_STATUS_BADGE_CLASS: Record<StockStatus, string> = {
  habis: 'bg-red-100 text-red-800',
  menipis: 'bg-amber-100 text-amber-800',
  tersedia: 'bg-green-100 text-green-800',
};

const STOCK_STATUS_PILL_CLASS: Record<StockStatus, string> = {
  habis: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  menipis: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  tersedia: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
};

/** Badge padat untuk tabel/daftar Master Produk. */
export const getStockStatusClass = (product: StockStatusSource): string => (
  STOCK_STATUS_BADGE_CLASS[getStockStatus(product)]
);

/** Pil bercincin untuk kartu produk di katalog POS. */
export const getStockStatusPillClass = (product: StockStatusSource): string => (
  STOCK_STATUS_PILL_CLASS[getStockStatus(product)]
);
