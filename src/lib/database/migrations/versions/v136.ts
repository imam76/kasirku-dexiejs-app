import type { SyncCursor } from '@/types';
import type { KasirkuDB } from '../../KasirkuDB';

const STOCK_RECOVERY_CURSORS = ['products', 'stockMutations'];

/**
 * Product versions produced by older builds could fail to advance after a stock mutation. Reset
 * only the stock-related pull checkpoints so the next sync performs an idempotent authoritative
 * backfill without deleting any local business data or the rest of Dexie.
 */
export function registerMigrationV136(db: KasirkuDB) {
  db.version(136).stores({}).upgrade(async (tx) => {
    await tx.table<SyncCursor>('syncCursors').bulkDelete(STOCK_RECOVERY_CURSORS);
  });
}
