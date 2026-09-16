import type { KasirkuDB } from '../../KasirkuDB';

export function registerMigrationV133(db: KasirkuDB) {
  db.version(133).stores({
    syncQueue: 'id, entity, entity_id, operation, status, created_at, updated_at, [status+updated_at]',
  });
}
