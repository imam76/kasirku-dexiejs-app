import type { Product } from '@/types';
import type { KasirkuDB } from '../../KasirkuDB';
import {
  toPosCatalogProduct,
  toProductListCatalogProduct,
  toProductSearchCatalogProduct,
  type PosCatalogProduct,
} from '../../checkoutReadModels';

const PRODUCT_BACKFILL_BATCH_SIZE = 1_000;

/**
 * Cursor-ready product projections. Runtime list/search queries only read a
 * bounded page from these stores; this one-time upgrade is the sole full
 * rebuild and keeps source `products` untouched.
 */
export function registerMigrationV138(db: KasirkuDB) {
  db.version(138).stores({
    posProductCatalog: 'id, name, normalized_sku, category, [name+id], [category+name+id]',
    productListCatalog: 'id, category, created_at, [created_at+id], [category+created_at+id]',
    productSearchCatalog: 'id, category, pos_visibility, *search_keys',
  }).upgrade(async (tx) => {
    const productTable = tx.table<Product, string>('products');
    const posCatalogTable = tx.table('posProductCatalog');
    const productListTable = tx.table('productListCatalog');
    const productSearchTable = tx.table('productSearchCatalog');
    const countTable = tx.table('posCatalogCounts');
    const categoryCounts = new Map<string, number>();

    await Promise.all([
      posCatalogTable.clear(),
      productListTable.clear(),
      productSearchTable.clear(),
      countTable.clear(),
    ]);

    let lastId: string | undefined;
    while (true) {
      const products = await (lastId === undefined
        ? productTable.orderBy('id')
        : productTable.where('id').above(lastId))
        .limit(PRODUCT_BACKFILL_BATCH_SIZE)
        .toArray();
      if (products.length === 0) break;

      const posRows = products
        .map(toPosCatalogProduct)
        .filter((row): row is PosCatalogProduct => Boolean(row));
      posRows.forEach((row) => {
        categoryCounts.set(row.category, (categoryCounts.get(row.category) ?? 0) + 1);
      });

      await Promise.all([
        posCatalogTable.bulkPut(posRows),
        productListTable.bulkPut(products.map(toProductListCatalogProduct)),
        productSearchTable.bulkPut(products.map(toProductSearchCatalogProduct)),
      ]);
      lastId = products[products.length - 1].id;
    }

    await countTable.bulkPut(
      [...categoryCounts].map(([category, count]) => ({ category, count })),
    );
  });
}
