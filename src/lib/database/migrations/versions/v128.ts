import type { KasirkuDB } from '../../KasirkuDB';

export function registerMigrationV128(db: KasirkuDB) {
  db.version(128).stores({
    lotteries: 'id, active, start_at, end_at, created_at, updated_at, sync_status',
  });
}
