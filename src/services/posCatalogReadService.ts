import Dexie from 'dexie';
import { db } from '@/lib/db';
import {
  buildProductSearchKey,
  buildProductSearchKeyPrefix,
  type PosCatalogProduct,
} from '@/lib/database/checkoutReadModels';
import { matchesProductSearch, normalizeProductSearchTerm } from '@/utils/productSearch';

const POS_CATALOG_PAGE_SIZE = 12;
type PosCatalogCursorRow = Pick<PosCatalogProduct, 'id' | 'name' | 'sku' | 'category'>;

export type PosCatalogCursor =
  | { kind: 'name'; name: string; id: string }
  | { kind: 'search'; key: string };

export interface PosCatalogPageOptions {
  cursor?: PosCatalogCursor;
  limit?: number;
  search?: string;
  category?: string;
}

export interface PosCatalogCursorPage {
  ids: string[];
  nextCursor?: PosCatalogCursor;
}

const normalizeLimit = (limit?: number) => (
  Math.max(1, Math.min(100, Math.floor(limit ?? POS_CATALOG_PAGE_SIZE)))
);

const readCursorPage = async ({
  cursor,
  limit: requestedLimit,
  search = '',
  category,
}: PosCatalogPageOptions): Promise<PosCatalogCursorPage> => {
  const limit = normalizeLimit(requestedLimit);
  const term = normalizeProductSearchTerm(search);

  return db.transaction('r', db.posProductCatalog, db.productSearchCatalog, async () => {
    let rows: PosCatalogCursorRow[];

    if (term) {
      const prefix = buildProductSearchKeyPrefix(term);
      const searchCursor = cursor?.kind === 'search' ? cursor.key : undefined;
      rows = await db.productSearchCatalog
        .where('search_keys')
        .between(searchCursor ?? prefix, `${prefix}\uffff`, !searchCursor, true)
        .and((product) => (
          product.pos_visibility === 1
          && (!category || product.category === category)
          && matchesProductSearch(product, term)
        ))
        .limit(limit + 1)
        .toArray();
    } else if (category) {
      const nameCursor = cursor?.kind === 'name' ? cursor : undefined;
      rows = await db.posProductCatalog
        .where('[category+name+id]')
        .between(
          nameCursor ? [category, nameCursor.name, nameCursor.id] : [category, Dexie.minKey, Dexie.minKey],
          [category, Dexie.maxKey, Dexie.maxKey],
          !nameCursor,
          true,
        )
        .limit(limit + 1)
        .toArray();
    } else {
      const nameCursor = cursor?.kind === 'name' ? cursor : undefined;
      rows = await db.posProductCatalog
        .where('[name+id]')
        .between(
          nameCursor ? [nameCursor.name, nameCursor.id] : [Dexie.minKey, Dexie.minKey],
          [Dexie.maxKey, Dexie.maxKey],
          !nameCursor,
          true,
        )
        .limit(limit + 1)
        .toArray();
    }

    const visibleRows = rows.slice(0, limit);
    const lastVisible = visibleRows[visibleRows.length - 1];
    const nextCursor = rows.length > limit && lastVisible
      ? (term
        ? { kind: 'search' as const, key: buildProductSearchKey(lastVisible, term) }
        : { kind: 'name' as const, name: lastVisible.name, id: lastVisible.id })
      : undefined;

    return {
      ids: visibleRows.map((row) => row.id),
      nextCursor,
    };
  });
};

export const readPosCatalogPage = (options: PosCatalogPageOptions) => readCursorPage(options);

export async function readAvailablePosProductCategories() {
  return (await db.posCatalogCounts.orderBy('category').primaryKeys()) as string[];
}

export async function findPosProductBySku(code: string) {
  const sku = code.trim().toLowerCase();
  if (!sku) return undefined;
  return db.transaction('r', db.posProductCatalog, db.products, async () => {
    const row = await db.posProductCatalog.where('normalized_sku').equals(sku).first();
    return row ? db.products.get(row.id) : undefined;
  });
}

export async function findFirstPosProduct(search: string) {
  const term = normalizeProductSearchTerm(search);
  if (!term) return undefined;
  const page = await readCursorPage({ search: term, limit: 1 });
  return page.ids[0] ? db.products.get(page.ids[0]) : undefined;
}
