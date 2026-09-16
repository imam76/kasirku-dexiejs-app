import type { KasirkuDB } from '../../KasirkuDB';
import { buildPosCatalogSearchTokens } from '../../checkoutReadModels';
import type { PosCatalogProduct } from '../../checkoutReadModels';

export function registerMigrationV135(db: KasirkuDB) {
  db.version(135).stores({
    posProductCatalog: 'id, name, normalized_sku, category, [category+name], *search_tokens',
  }).upgrade(async (tx) => {
    // Tokens are derived from the name and SKU already held here, so the upgrade
    // does not need to walk `products` again. One pass over catalog metadata only.
    await tx.table<PosCatalogProduct>('posProductCatalog').toCollection().modify((row) => {
      row.search_tokens = buildPosCatalogSearchTokens(row.name, row.sku || '');
    });
  });
}
