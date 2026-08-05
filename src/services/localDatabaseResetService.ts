import { db } from '@/lib/db';

const LOCAL_DATA_TABLES = [
  'authUsers',
  'products',
  'contacts',
  'employees',
  'transactions',
  'salesDocuments',
  'purchaseDocuments',
  'financeTransactions',
  'journalEntries',
  'cooperativeMembers',
] as const;

export const hasLocalBusinessData = async (): Promise<boolean> => {
  for (const tableName of LOCAL_DATA_TABLES) {
    if (await db.table(tableName).count() > 0) return true;
  }

  return false;
};

export const countUnsyncedQueueItems = async (): Promise<number> => (
  db.syncQueue.where('status').anyOf('pending', 'failed').count()
);

/**
 * Drops the whole Dexie database so the next boot repopulates its seed data and
 * pulls a consistent dataset from the currently configured host.
 */
export const resetLocalDatabase = async (): Promise<void> => {
  await db.delete();
};
