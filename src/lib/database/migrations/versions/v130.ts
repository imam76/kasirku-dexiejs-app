import type { KasirkuDB } from '../../KasirkuDB';

export function registerMigrationV130(db: KasirkuDB) {
  db.version(130).stores({
    budgets: 'id, budget_type, category, period_type, period_key, is_active, created_at, updated_at, sync_status',
  });
}
