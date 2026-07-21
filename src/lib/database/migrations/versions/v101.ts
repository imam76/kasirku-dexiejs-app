import type { KasirkuDB } from '../../KasirkuDB';

export function registerMigrationV101(db: KasirkuDB) {
  db.version(101).stores({
    dashboardPreferences: 'id, user_id, updated_at',
  });
}
