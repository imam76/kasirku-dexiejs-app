import { db } from '@/lib/db';
import { matchesProductSearch, normalizeProductSearchTerm } from '@/utils/productSearch';

export async function readPosCatalogPage(page: number, pageSize: number, search = '', category?: string) {
  return db.transaction('r', db.posProductCatalog, db.posCatalogCounts, async () => {
    const term = normalizeProductSearchTerm(search);
    const counts = await db.posCatalogCounts.toArray();
    const total = counts.reduce((sum, row) => sum + (!category || row.category === category ? row.count : 0), 0);
    const collection = category
      ? db.posProductCatalog.where('[category+name]').between([category, ''], [category, []])
      : db.posProductCatalog.orderBy('name');
    if (term) {
      const matches = await collection.filter((product) => matchesProductSearch(product, term)).toArray();
      const currentPage = Math.max(1, Math.min(page, Math.max(1, Math.ceil(matches.length / pageSize))));
      const offset = (currentPage - 1) * pageSize;
      return { ids: matches.slice(offset, offset + pageSize).map((row) => row.id), total: matches.length, currentPage };
    }
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
    const row = await db.posProductCatalog.orderBy('name').filter((product) => matchesProductSearch(product, term)).first();
    return row ? db.products.get(row.id) : undefined;
  });
}
