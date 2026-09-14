import type { Collection } from 'dexie';
import { db } from '@/lib/db';
import { POS_CATALOG_TOKEN_MAX_LENGTH, type PosCatalogProduct } from '@/lib/database/checkoutReadModels';
import { matchesProductSearch, normalizeProductSearchTerm } from '@/utils/productSearch';

// IndexedDB orders strings by code unit, which is how the `name` index already
// ordered these rows. Ties fall back to the primary key, as a Dexie index does.
const byNameThenId = (left: PosCatalogProduct, right: PosCatalogProduct) => {
  if (left.name !== right.name) return left.name < right.name ? -1 : 1;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
};

/**
 * Search candidates come from the multiEntry `search_tokens` index instead of a
 * full catalog scan. The probe is the term's first word: a term found inside the
 * text always begins inside one word, so some suffix of that word starts with it.
 *
 * Every candidate is still checked with `matchesProductSearch`, so the result set
 * is identical to filtering the whole catalog. A term longer than an indexed token
 * cannot be probed, so it falls back to the scan.
 */
const searchCatalog = (term: string, category?: string): Collection<PosCatalogProduct, string> => {
  const probe = term.split(/\s+/)[0] ?? '';
  const base: Collection<PosCatalogProduct, string> = probe && probe.length <= POS_CATALOG_TOKEN_MAX_LENGTH
    ? db.posProductCatalog.where('search_tokens').startsWith(probe).distinct()
    : db.posProductCatalog.toCollection();

  return base
    .and((product) => matchesProductSearch(product, term))
    .and((product) => !category || product.category === category);
};

export async function readPosCatalogPage(page: number, pageSize: number, search = '', category?: string) {
  return db.transaction('r', db.posProductCatalog, db.posCatalogCounts, async () => {
    const term = normalizeProductSearchTerm(search);
    const counts = await db.posCatalogCounts.toArray();
    const total = counts.reduce((sum, row) => sum + (!category || row.category === category ? row.count : 0), 0);
    if (term) {
      const matches = await searchCatalog(term, category).toArray();
      matches.sort(byNameThenId);
      const currentPage = Math.max(1, Math.min(page, Math.max(1, Math.ceil(matches.length / pageSize))));
      const offset = (currentPage - 1) * pageSize;
      return { ids: matches.slice(offset, offset + pageSize).map((row) => row.id), total: matches.length, currentPage };
    }
    const collection = category
      ? db.posProductCatalog.where('[category+name]').between([category, ''], [category, []])
      : db.posProductCatalog.orderBy('name');
    const currentPage = Math.max(1, Math.min(page, Math.max(1, Math.ceil(total / pageSize))));
    const ids = await collection.offset((currentPage - 1) * pageSize).limit(pageSize).primaryKeys();
    return { ids: ids as string[], total, currentPage };
  });
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
  return db.transaction('r', db.posProductCatalog, db.products, async () => {
    // Track the lowest name while streaming candidates: no full array is built
    // just to take one row, and the pick matches the old name-ordered `first()`.
    let first: PosCatalogProduct | undefined;
    await searchCatalog(term).each((product) => {
      if (!first || byNameThenId(product, first) < 0) first = product;
    });
    return first ? db.products.get(first.id) : undefined;
  });
}
