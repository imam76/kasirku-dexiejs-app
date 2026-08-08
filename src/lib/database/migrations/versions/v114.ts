import type { KasirkuDB } from '../../KasirkuDB';

/**
 * New local read cache for the stock_mutations ledger pulled from Postgres. The table only
 * exists to receive delta-fetched rows (see stockMutationReadService.ts) - local mutation
 * creation (checkoutService.ts, productionService.ts, etc.) still builds StockMutation objects
 * in memory and pushes them straight to the sync queue without writing here.
 */
export function registerMigrationV114(db: KasirkuDB) {
  db.version(114).stores({
    stockMutations: 'id, product_id, warehouse_id, source_type, source_id, occurred_at, created_at',
  });
}
