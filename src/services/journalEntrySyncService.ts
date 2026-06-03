import { db } from '@/lib/db';
import { enqueueJournalEntryBundleSync } from '@/services/syncQueueService';
import type { AuthUser, JournalEntry, SyncQueueOperation } from '@/types';

type JournalEntryActor = Pick<AuthUser, 'id' | 'name'> | null | undefined;

const toPositiveVersion = (version: number | null | undefined) => (
  typeof version === 'number' && Number.isFinite(version) && version > 0 ? version : 1
);

export const withPendingJournalEntrySync = (
  entry: JournalEntry,
  actor?: JournalEntryActor,
  updatedAt = entry.updated_at ?? entry.created_at ?? new Date().toISOString(),
): JournalEntry => ({
  ...entry,
  version: toPositiveVersion(entry.version),
  created_by: entry.created_by ?? actor?.id,
  created_by_name: entry.created_by_name ?? actor?.name,
  updated_by: actor?.id ?? entry.updated_by,
  updated_by_name: actor?.name ?? entry.updated_by_name,
  updated_at: updatedAt,
  sync_status: 'pending',
  sync_error: undefined,
});

export const withUpdatedJournalEntrySync = (
  entry: JournalEntry,
  actor?: JournalEntryActor,
  updatedAt = new Date().toISOString(),
): JournalEntry => withPendingJournalEntrySync({
  ...entry,
  version: toPositiveVersion(entry.version) + 1,
  updated_at: updatedAt,
}, actor, updatedAt);

export const enqueueJournalEntryBundleById = async (
  entryId: string,
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const entry = await db.journalEntries.get(entryId);
  if (!entry) return undefined;

  const lines = await db.journalEntryLines
    .where('journal_entry_id')
    .equals(entry.id)
    .toArray();

  return enqueueJournalEntryBundleSync(entry, lines, operation);
};

export const scheduleJournalEntryBundleSync = (
  entryId: string,
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  setTimeout(() => {
    void enqueueJournalEntryBundleById(entryId, operation);
  }, 0);
};
