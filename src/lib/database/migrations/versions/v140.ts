import type { KasirkuDB } from '../../KasirkuDB';

/**
 * The point ledger now syncs. `sync_status` finds the rows still owed to PostgreSQL, and
 * `[membership_id+created_at]` reads one member's history newest-first without a scan.
 * Existing rows are left without a status on purpose: they were never pushed as events.
 */
export function registerMigrationV140(db: KasirkuDB) {
  db.version(140).stores({
    membershipPointTransactions: 'id, membership_id, membership_number, transaction_id, transaction_number, type, sync_status, created_at, [membership_id+created_at]',
  });
}
