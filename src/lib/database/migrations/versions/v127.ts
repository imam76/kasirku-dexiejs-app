import type { CooperativeLoanCollectionEvent } from '@/types';
import { normalizeStoredTimestamp } from '@/utils/timestamps';
import type { KasirkuDB } from '../../KasirkuDB';

export function registerMigrationV127(db: KasirkuDB) {
  db.version(127).stores({}).upgrade(async (migration) => {
    await migration.table<CooperativeLoanCollectionEvent>('cooperativeLoanCollectionEvents').toCollection().modify((event) => {
      event.follow_up_date = normalizeStoredTimestamp(event.follow_up_date);
      event.contacted_at = normalizeStoredTimestamp(event.contacted_at) ?? event.contacted_at;
      event.created_at = normalizeStoredTimestamp(event.created_at) ?? event.created_at;
      event.last_synced_at = normalizeStoredTimestamp(event.last_synced_at);
      event.remote_updated_at = normalizeStoredTimestamp(event.remote_updated_at);
    });
  });
}
