import Dexie from 'dexie';
import { db } from '@/lib/db';
import {
  buildProductSearchKey,
  buildProductSearchKeyPrefix,
  type ProductListCatalogProduct,
  type ProductSearchCatalogProduct,
} from '@/lib/database/checkoutReadModels';
import type { Product } from '@/types';
import { matchesProductSearch, normalizeProductSearchTerm } from '@/utils/productSearch';

export type ProductListStockStatus = 'all' | 'out' | 'low' | 'safe';
export type ProductListSkuStatus = 'all' | 'with' | 'without';
export type ProductListWholesaleStatus = 'all' | 'with' | 'without';
export type ProductListProductType = 'all' | Product['product_type'];
export type ProductListPosVisibility = 'all' | 'visible' | 'hidden';

export interface ProductListFilters {
  search: string;
  categories: string[];
  stockStatus: ProductListStockStatus;
  minStock: number | null;
  maxStock: number | null;
  skuStatus: ProductListSkuStatus;
  minSellingPrice: number | null;
  maxSellingPrice: number | null;
  minPurchasePrice: number | null;
  maxPurchasePrice: number | null;
  wholesaleStatus: ProductListWholesaleStatus;
  productType: ProductListProductType;
  posVisibility: ProductListPosVisibility;
}

export const EMPTY_PRODUCT_LIST_FILTERS: ProductListFilters = {
  search: '',
  categories: [],
  stockStatus: 'all',
  minStock: null,
  maxStock: null,
  skuStatus: 'all',
  minSellingPrice: null,
  maxSellingPrice: null,
  minPurchasePrice: null,
  maxPurchasePrice: null,
  wholesaleStatus: 'all',
  productType: 'all',
  posVisibility: 'all',
};

export type ProductListCursor =
  | { kind: 'created'; createdAt: string; id: string }
  | { kind: 'search'; key: string };

export interface ProductListPageOptions {
  filters?: ProductListFilters;
  cursor?: ProductListCursor;
  limit?: number;
}

export interface ProductListPage {
  rows: Product[];
  nextCursor?: ProductListCursor;
}

const PRODUCT_LIST_PAGE_SIZE = 50;
const PRODUCT_SEARCH_SCAN_BATCH_SIZE = 100;

const normalizePageSize = (limit?: number) => (
  Math.max(1, Math.min(100, Math.floor(limit ?? PRODUCT_LIST_PAGE_SIZE)))
);

const matchesFilters = (
  product: ProductListCatalogProduct,
  filters: ProductListFilters,
) => {
  if (filters.categories.length > 0 && !filters.categories.includes(product.category)) return false;
  if (filters.stockStatus === 'out' && product.stock_status !== 'habis') return false;
  if (filters.stockStatus === 'low' && product.stock_status !== 'menipis') return false;
  if (filters.stockStatus === 'safe' && product.stock_status !== 'tersedia') return false;
  if (filters.minStock !== null && product.stock < filters.minStock) return false;
  if (filters.maxStock !== null && product.stock > filters.maxStock) return false;
  if (filters.skuStatus === 'with' && product.has_sku === 0) return false;
  if (filters.skuStatus === 'without' && product.has_sku === 1) return false;
  if (filters.minSellingPrice !== null && product.selling_price < filters.minSellingPrice) return false;
  if (filters.maxSellingPrice !== null && product.selling_price > filters.maxSellingPrice) return false;
  if (filters.minPurchasePrice !== null && product.purchase_price < filters.minPurchasePrice) return false;
  if (filters.maxPurchasePrice !== null && product.purchase_price > filters.maxPurchasePrice) return false;
  if (filters.wholesaleStatus === 'with' && product.has_wholesale_price === 0) return false;
  if (filters.wholesaleStatus === 'without' && product.has_wholesale_price === 1) return false;
  if (filters.productType !== 'all' && product.product_type !== filters.productType) return false;
  if (filters.posVisibility === 'visible' && product.pos_visibility === 0) return false;
  if (filters.posVisibility === 'hidden' && product.pos_visibility === 1) return false;
  return true;
};

export const readProductListPage = async ({
  filters = EMPTY_PRODUCT_LIST_FILTERS,
  cursor,
  limit: requestedLimit,
}: ProductListPageOptions = {}): Promise<ProductListPage> => {
  const limit = normalizePageSize(requestedLimit);
  const search = normalizeProductSearchTerm(filters.search);
  const indexedCategory = filters.categories.length === 1 ? filters.categories[0] : undefined;

  return db.transaction('r', db.productListCatalog, db.productSearchCatalog, db.products, async () => {
    let catalogRows: ProductListCatalogProduct[];

    if (search) {
      const prefix = buildProductSearchKeyPrefix(search);
      let searchCursor = cursor?.kind === 'search' ? cursor.key : undefined;
      catalogRows = [];

      while (catalogRows.length <= limit) {
        const searchRows: ProductSearchCatalogProduct[] = await db.productSearchCatalog
          .where('search_keys')
          .between(searchCursor ?? prefix, `${prefix}\uffff`, !searchCursor, true)
          .limit(PRODUCT_SEARCH_SCAN_BATCH_SIZE)
          .toArray();
        if (searchRows.length === 0) break;

        const listRows = await db.productListCatalog.bulkGet(searchRows.map((row) => row.id));
        searchRows.forEach((searchRow, index) => {
          const listRow = listRows[index];
          if (
            listRow
            && matchesProductSearch(searchRow, search)
            && matchesFilters(listRow, filters)
          ) {
            catalogRows.push(listRow);
          }
        });

        const lastSearchRow = searchRows[searchRows.length - 1];
        searchCursor = buildProductSearchKey(lastSearchRow, search);
        if (catalogRows.length > limit || searchRows.length < PRODUCT_SEARCH_SCAN_BATCH_SIZE) break;
      }
    } else if (indexedCategory) {
      const createdCursor = cursor?.kind === 'created' ? cursor : undefined;
      catalogRows = await db.productListCatalog
        .where('[category+created_at+id]')
        .between(
          [indexedCategory, Dexie.minKey, Dexie.minKey],
          createdCursor
            ? [indexedCategory, createdCursor.createdAt, createdCursor.id]
            : [indexedCategory, Dexie.maxKey, Dexie.maxKey],
          true,
          !createdCursor,
        )
        .reverse()
        .and((product) => matchesFilters(product, filters))
        .limit(limit + 1)
        .toArray();
    } else {
      const createdCursor = cursor?.kind === 'created' ? cursor : undefined;
      catalogRows = await db.productListCatalog
        .where('[created_at+id]')
        .between(
          [Dexie.minKey, Dexie.minKey],
          createdCursor
            ? [createdCursor.createdAt, createdCursor.id]
            : [Dexie.maxKey, Dexie.maxKey],
          true,
          !createdCursor,
        )
        .reverse()
        .and((product) => matchesFilters(product, filters))
        .limit(limit + 1)
        .toArray();
    }

    const visibleCatalogRows = catalogRows.slice(0, limit);
    const products = await db.products.bulkGet(visibleCatalogRows.map((row) => row.id));
    const rows = products.filter((product): product is Product => Boolean(product));
    const lastVisible = visibleCatalogRows[visibleCatalogRows.length - 1];

    return {
      rows,
      nextCursor: catalogRows.length > limit && lastVisible
        ? (search
          ? {
            kind: 'search',
            key: buildProductSearchKey(lastVisible, search),
          }
          : {
            kind: 'created',
            createdAt: lastVisible.created_at,
            id: lastVisible.id,
          })
        : undefined,
    };
  });
};
