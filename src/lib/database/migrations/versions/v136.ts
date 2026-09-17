import type { JournalEntry, JournalEntryLine, SyncCursor } from '@/types';
import type { KasirkuDB } from '../../KasirkuDB';

const STOCK_RECOVERY_CURSORS = ['products', 'stockMutations'];
const BACKFILL_BATCH_SIZE = 1_000;

type LegacyJournalEntryLine = Omit<JournalEntryLine, 'entry_date'> & {
  entry_date?: string;
};

/**
 * Product versions produced by older builds could fail to advance after a stock mutation. Reset
 * only the stock-related pull checkpoints so the next sync performs an idempotent authoritative
 * backfill without deleting any local business data or the rest of Dexie.
 */
export function registerMigrationV136(db: KasirkuDB) {
  db.version(136).stores({
    journalEntries: 'id, entry_number, entry_date, status, source_type, source_id, source_event, reversed_entry_id, sync_status, updated_at, created_at, [entry_date+id]',
    journalEntryLines: 'id, journal_entry_id, account_id, account_code, account_type, entry_date, created_at, [entry_date+id], [account_id+entry_date+id]',
    stockPurchases: 'id, product_id, created_at, [created_at+id]',
    purchaseDocuments: 'id, document_number, type, status, contact_id, supplier_name, document_date, due_date, payment_status, source_document_id, project_id, department_id, tax_id, currency_code, cost_status, sync_status, updated_at, created_at, [type+document_date+id]',
    transactions: 'id, transaction_number, payment_method, payment_method_id, payment_method_code, cashier_session_id, restaurant_session_id, &restaurant_order_id, cashier_user_id, member_contact_id, member_number, created_at, updated_at, sync_status, [created_at+id]',
    financeTransactions: 'id, type, category, account_id, cash_account_id, cash_bank_reconciliation_id, field_cash_session_id, field_employee_id, transfer_group_id, sync_status, updated_at, created_at, reference_id, [created_at+id], [type+created_at+id], [cash_account_id+created_at+id]',
  }).upgrade(async (tx) => {
    await tx.table<SyncCursor>('syncCursors').bulkDelete(STOCK_RECOVERY_CURSORS);

    const linesTable = tx.table<LegacyJournalEntryLine, string>('journalEntryLines');
    const entriesTable = tx.table<JournalEntry, string>('journalEntries');
    let lastId: string | undefined;

    // Keep migration memory bounded. A line inherits the accounting date from
    // its journal header so reports can seek by account/date without scanning
    // and joining every historical line first.
    while (true) {
      const lines = await (lastId === undefined
        ? linesTable.orderBy('id')
        : linesTable.where('id').above(lastId))
        .limit(BACKFILL_BATCH_SIZE)
        .toArray();
      if (lines.length === 0) break;

      const entryIds = [...new Set(lines.map((line) => line.journal_entry_id))];
      const entries = await entriesTable.bulkGet(entryIds);
      const entryDateById = new Map(
        entries.filter((entry): entry is JournalEntry => Boolean(entry))
          .map((entry) => [entry.id, entry.entry_date]),
      );

      await linesTable.bulkPut(lines.map((line) => ({
        ...line,
        entry_date: line.entry_date
          ?? entryDateById.get(line.journal_entry_id)
          ?? line.created_at,
      })));
      lastId = lines[lines.length - 1].id;
    }
  });
}
