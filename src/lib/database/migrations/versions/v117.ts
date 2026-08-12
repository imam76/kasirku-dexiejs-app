import type { KasirkuDB } from '../../KasirkuDB';

/**
 * Generic table for storing the last successfully-pulled delta-fetch cursor per entity,
 * keyed by entity name. Introduced so read services stop deriving the next pull cursor from
 * MAX(created_at) of local rows (see purchaseCostReconciliationReadService.ts) - that approach
 * uses a client-supplied business timestamp that can be pushed to the server long after it was
 * set, letting a delayed push get silently skipped once other devices' cursors have advanced
 * past it. No data migration needed - the table starts empty and the first refresh on each
 * device does one full resync (safe: bulkPut merge is idempotent).
 */
export function registerMigrationV117(db: KasirkuDB) {
  db.version(117).stores({
    syncCursors: 'entity',
  });
}
