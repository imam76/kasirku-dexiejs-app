import type { InventoryLot, Product, SyncQueueItem, SyncQueueStatus } from '@/types';
import { isProductVisibleInPos } from '@/utils/productAvailability';
import { getStockStatus, type StockStatus } from '@/utils/stockStatus';

export interface SyncQueueSummary {
  id: 'current';
  counts: Record<SyncQueueStatus, number>;
}

export const emptySyncQueueSummary = (): SyncQueueSummary => ({
  id: 'current', counts: { pending: 0, processing: 0, synced: 0, failed: 0 },
});

export interface InventoryConsumptionTotal {
  lot_id: string;
  quantity: number;
}

// Only catalog fields: stock, prices and sync metadata must not invalidate catalog searches.
export interface PosCatalogProduct {
  id: string;
  name: string;
  sku: string;
  normalized_sku: string;
  category: string;
  search_tokens: string[];
}

export interface ProductListCatalogProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  created_at: string;
  stock: number;
  min_stock?: number;
  purchase_price: number;
  selling_price: number;
  has_sku: 0 | 1;
  has_wholesale_price: 0 | 1;
  product_type: Product['product_type'];
  pos_visibility: 0 | 1;
  stock_status: StockStatus;
}

export interface ProductSearchCatalogProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  pos_visibility: 0 | 1;
  search_keys: string[];
}

/**
 * Substring search used to filter the whole catalog on every keystroke. These
 * tokens are the suffixes of each word in the name and SKU, indexed multiEntry,
 * so a search can seek candidates through the index instead of reading every row.
 *
 * A term's first word never spans whitespace, so whenever the text contains the
 * term, some word suffix starts with that first word: probing the index with it
 * cannot miss a match. Callers still verify candidates with `matchesProductSearch`,
 * which keeps the result set identical to a full scan.
 */
export const POS_CATALOG_TOKEN_MAX_LENGTH = 32;
const PRODUCT_SEARCH_KEY_SEPARATOR = '\u0000';
const PRODUCT_SEARCH_NGRAM_LENGTH = 3;

export const buildPosCatalogSearchTokens = (name: string, sku: string): string[] => {
  const tokens = new Set<string>();
  `${name} ${sku}`.toLowerCase().split(/\s+/).forEach((word) => {
    for (let start = 0; start < word.length; start += 1) {
      tokens.add(word.slice(start, start + POS_CATALOG_TOKEN_MAX_LENGTH));
    }
  });
  return [...tokens];
};

const buildProductSearchNgrams = (name: string, sku: string): string[] => {
  const grams = new Set<string>();
  `${name} ${sku}`.toLowerCase().split(/\s+/).forEach((word) => {
    for (let start = 0; start < word.length; start += 1) {
      for (let length = 1; length <= PRODUCT_SEARCH_NGRAM_LENGTH && start + length <= word.length; length += 1) {
        grams.add(word.slice(start, start + length));
      }
    }
  });
  return [...grams];
};

export const getProductSearchProbe = (search: string) => (
  (search.trim().toLowerCase().split(/\s+/)[0] ?? '').slice(0, PRODUCT_SEARCH_NGRAM_LENGTH)
);

export const buildProductSearchKeyPrefix = (search: string) => {
  const probe = getProductSearchProbe(search);
  return `${probe}${PRODUCT_SEARCH_KEY_SEPARATOR}`;
};

export const buildProductSearchKey = (
  product: Pick<PosCatalogProduct, 'id' | 'name'>,
  search: string,
) => `${buildProductSearchKeyPrefix(search)}${product.name}${PRODUCT_SEARCH_KEY_SEPARATOR}${product.id}`;

/**
 * One exact 1-3 character n-gram per product is enough to seek every substring
 * search without duplicating a product in the result cursor. The product name
 * and id suffix keep every probe globally ordered and make the key resumable.
 */
export const buildProductSearchKeys = (
  product: Pick<Product, 'id' | 'name' | 'sku' | 'category'>,
) => {
  const suffix = `${product.name}${PRODUCT_SEARCH_KEY_SEPARATOR}${product.id}`;
  return buildProductSearchNgrams(product.name, product.sku || '')
    .map((gram) => `${gram}${PRODUCT_SEARCH_KEY_SEPARATOR}${suffix}`);
};

export interface PosCatalogCount {
  category: string;
  count: number;
}

export const toPosCatalogProduct = (product: Product): PosCatalogProduct | undefined => (
  isProductVisibleInPos(product) ? {
    id: product.id, name: product.name, sku: product.sku || '',
    normalized_sku: (product.sku || '').trim().toLowerCase(),
    category: product.category || 'non_consumable',
    search_tokens: buildPosCatalogSearchTokens(product.name, product.sku || ''),
  } : undefined
);

export const toProductListCatalogProduct = (product: Product): ProductListCatalogProduct => ({
  id: product.id,
  name: product.name,
  sku: product.sku || '',
  category: product.category || 'non_consumable',
  created_at: product.created_at,
  stock: Number(product.stock || 0),
  min_stock: product.min_stock,
  purchase_price: Number(product.purchase_price || 0),
  selling_price: Number(product.selling_price || 0),
  has_sku: product.sku?.trim() ? 1 : 0,
  has_wholesale_price: product.wholesale_prices?.length ? 1 : 0,
  product_type: product.product_type ?? 'FINISHED_GOOD',
  pos_visibility: product.is_visible_in_pos === false ? 0 : 1,
  stock_status: getStockStatus(product),
});

export const toProductSearchCatalogProduct = (product: Product): ProductSearchCatalogProduct => ({
  id: product.id,
  name: product.name,
  sku: product.sku || '',
  category: product.category || 'non_consumable',
  pos_visibility: product.is_visible_in_pos === false ? 0 : 1,
  search_keys: buildProductSearchKeys(product),
});

export const getSyncQueuePriority = (item: Pick<SyncQueueItem, 'entity'>): number => {
  switch (item.entity) {
    case 'products': return 0;
    case 'inventoryOpeningBalancePostings': return 2;
    case 'generalLedgerSetting': return 3;
    case 'inventoryLotConsumptions': return 4;
    default: return 1;
  }
};

export const withFifoBalance = (lot: InventoryLot, consumed: number): InventoryLot => {
  const remaining = lot.fifo_excluded ? 0
    : Number(lot.quantity_received) - consumed - (lot.fifo_untracked_consumed ?? 0);
  return { ...lot, fifo_remaining: remaining, fifo_available: remaining > 0 ? 1 : 0 };
};
