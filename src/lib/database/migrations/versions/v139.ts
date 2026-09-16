import type { KasirkuDB } from '../../KasirkuDB';

export function registerMigrationV139(db: KasirkuDB) {
  db.version(139).stores({
    documentSyncChecks: 'id',
    documentSyncIssues: 'id, state, entity, document_id, run_id',
  });
}
