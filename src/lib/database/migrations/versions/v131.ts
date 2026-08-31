import type { KasirkuDB } from '../../KasirkuDB';

export function registerMigrationV131(db: KasirkuDB) {
  db.version(131).stores({
    budgetCommitments: 'id, budget_id, status, created_at, updated_at, sync_status',
  });
}
