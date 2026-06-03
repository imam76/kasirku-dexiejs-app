import { db } from '@/lib/db';
import {
  isPostgresUnavailableError,
  isTauriRuntime,
  journalEntryPostgresAdapter,
  type RemoteJournalEntryBundleDto,
  type RemoteJournalEntryDto,
  type RemoteJournalEntryLineDto,
} from '@/services/postgresAdapter';
import type { AccountType, JournalEntry, JournalEntryLine, JournalEntryStatus, JournalSourceType } from '@/types';

export interface JournalEntryReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  deleted: number;
  skipped: number;
}

const EMPTY_JOURNAL_ENTRY_READ_SYNC_RESULT: JournalEntryReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  deleted: 0,
  skipped: 0,
};

const VALID_JOURNAL_STATUSES: JournalEntryStatus[] = ['DRAFT', 'POSTED', 'VOIDED', 'REVERSED'];
const VALID_JOURNAL_SOURCE_TYPES: JournalSourceType[] = [
  'POS_TRANSACTION',
  'STOCK_PURCHASE',
  'SALES_INVOICE',
  'SALES_INVOICE_PAYMENT',
  'SALES_RETURN',
  'ACCOUNTS_PAYABLE',
  'PURCHASE_INVOICE_PAYMENT',
  'CASH_BANK_TRANSFER',
  'MANUAL_JOURNAL',
  'OPENING_BALANCE',
];
const VALID_ACCOUNT_TYPES: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'CONTRA_REVENUE', 'EXPENSE'];
const POSTGRES_JOURNAL_ENTRY_REFRESH_LIMIT = 200;

let isRefreshingJournalEntriesFromPostgres = false;

const optionalString = (value: string | null | undefined) => value ?? undefined;
const optionalNumber = (value: number | null | undefined) => (
  typeof value === 'number' && Number.isFinite(value) ? value : 0
);

const isJournalEntryStatus = (status: string): status is JournalEntryStatus => (
  VALID_JOURNAL_STATUSES.includes(status as JournalEntryStatus)
);

const isJournalSourceType = (sourceType: string): sourceType is JournalSourceType => (
  VALID_JOURNAL_SOURCE_TYPES.includes(sourceType as JournalSourceType)
);

const isAccountType = (type: string): type is AccountType => (
  VALID_ACCOUNT_TYPES.includes(type as AccountType)
);

const toPositiveVersion = (version: number | null | undefined) => (
  typeof version === 'number' && Number.isFinite(version) && version > 0 ? version : 1
);

const mapRemoteJournalEntryToLocal = (
  remoteEntry: RemoteJournalEntryDto,
  syncedAt: string,
): JournalEntry => ({
  id: remoteEntry.id,
  entry_number: remoteEntry.entry_number,
  entry_date: remoteEntry.entry_date,
  status: isJournalEntryStatus(remoteEntry.status) ? remoteEntry.status : 'POSTED',
  source_type: isJournalSourceType(remoteEntry.source_type) ? remoteEntry.source_type : 'MANUAL_JOURNAL',
  source_id: optionalString(remoteEntry.source_id),
  source_number: optionalString(remoteEntry.source_number),
  source_event: optionalString(remoteEntry.source_event),
  description: remoteEntry.description,
  total_debit: optionalNumber(remoteEntry.total_debit),
  total_credit: optionalNumber(remoteEntry.total_credit),
  posted_at: optionalString(remoteEntry.posted_at),
  voided_at: optionalString(remoteEntry.voided_at),
  reversed_entry_id: optionalString(remoteEntry.reversed_entry_id),
  version: toPositiveVersion(remoteEntry.version),
  created_by: optionalString(remoteEntry.created_by),
  created_by_name: optionalString(remoteEntry.created_by_name),
  updated_by: optionalString(remoteEntry.updated_by),
  updated_by_name: optionalString(remoteEntry.updated_by_name),
  created_at: remoteEntry.created_at,
  updated_at: remoteEntry.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteEntry.updated_at,
});

const mapRemoteJournalEntryLineToLocal = (
  remoteLine: RemoteJournalEntryLineDto,
): JournalEntryLine => ({
  id: remoteLine.id,
  journal_entry_id: remoteLine.journal_entry_id,
  account_id: remoteLine.account_id,
  account_code: remoteLine.account_code,
  account_name: remoteLine.account_name,
  account_type: isAccountType(remoteLine.account_type) ? remoteLine.account_type : 'ASSET',
  debit: optionalNumber(remoteLine.debit),
  credit: optionalNumber(remoteLine.credit),
  description: optionalString(remoteLine.description),
  department_id: optionalString(remoteLine.department_id),
  project_id: optionalString(remoteLine.project_id),
  created_at: remoteLine.created_at,
});

const hasLocalUnsyncedChanges = (entry: JournalEntry) => (
  entry.sync_status === 'pending' || entry.sync_status === 'failed'
);

const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const getLaterUpdatedAt = (current: string | undefined, candidate: string | undefined) => {
  if (!candidate) return current;
  if (!current) return candidate;

  const currentTimestamp = toTimestamp(current);
  const candidateTimestamp = toTimestamp(candidate);

  if (currentTimestamp !== null && candidateTimestamp !== null) {
    return candidateTimestamp > currentTimestamp ? candidate : current;
  }

  return candidate > current ? candidate : current;
};

const getLatestLocalRemoteUpdatedAt = async () => {
  const entries = await db.journalEntries.toArray();

  return entries.reduce<string | undefined>((latest, entry) => {
    const remoteUpdatedAt = entry.remote_updated_at
      ?? (entry.sync_status === 'synced' ? entry.updated_at : undefined);
    return getLaterUpdatedAt(latest, remoteUpdatedAt);
  }, undefined);
};

const getLatestRemoteBundleUpdatedAt = (remoteBundles: RemoteJournalEntryBundleDto[]) => (
  remoteBundles.reduce<string | undefined>(
    (latest, bundle) => getLaterUpdatedAt(latest, bundle.entry.updated_at),
    undefined,
  )
);

const addJournalEntryReadSyncResult = (
  aggregate: JournalEntryReadSyncResult,
  next: JournalEntryReadSyncResult,
) => {
  aggregate.fetched += next.fetched;
  aggregate.inserted += next.inserted;
  aggregate.updated += next.updated;
  aggregate.deleted += next.deleted;
  aggregate.skipped += next.skipped;
};

const shouldApplyRemoteJournalEntry = (
  localEntry: JournalEntry | undefined,
  remoteEntry: RemoteJournalEntryDto,
) => {
  if (!localEntry) return true;
  if (hasLocalUnsyncedChanges(localEntry)) return false;

  const localVersion = toPositiveVersion(localEntry.version);
  const remoteVersion = toPositiveVersion(remoteEntry.version);
  if (remoteVersion !== localVersion) {
    return remoteVersion > localVersion;
  }

  const localRemoteUpdatedAt = localEntry.remote_updated_at ?? localEntry.updated_at;
  const remoteTimestamp = toTimestamp(remoteEntry.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteEntry.updated_at >= localRemoteUpdatedAt;
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

export const mergeRemoteJournalEntryBundlesIntoDexie = async (
  remoteBundles: RemoteJournalEntryBundleDto[],
  syncedAt = new Date().toISOString(),
): Promise<JournalEntryReadSyncResult> => {
  const result: JournalEntryReadSyncResult = {
    ...EMPTY_JOURNAL_ENTRY_READ_SYNC_RESULT,
    fetched: remoteBundles.length,
  };
  if (remoteBundles.length === 0) return result;

  await db.transaction('rw', db.journalEntries, db.journalEntryLines, async () => {
    for (const remoteBundle of remoteBundles) {
      const localEntry = await db.journalEntries.get(remoteBundle.entry.id);
      if (!shouldApplyRemoteJournalEntry(localEntry, remoteBundle.entry)) {
        result.skipped += 1;
        continue;
      }

      if (remoteBundle.entry.deleted_at) {
        if (localEntry) {
          await db.journalEntries.delete(remoteBundle.entry.id);
          await db.journalEntryLines.where('journal_entry_id').equals(remoteBundle.entry.id).delete();
          result.deleted += 1;
        } else {
          result.skipped += 1;
        }
        continue;
      }

      await db.journalEntries.put(mapRemoteJournalEntryToLocal(remoteBundle.entry, syncedAt));
      await db.journalEntryLines.where('journal_entry_id').equals(remoteBundle.entry.id).delete();
      const localLines = remoteBundle.lines.map(mapRemoteJournalEntryLineToLocal);
      if (localLines.length > 0) {
        await db.journalEntryLines.bulkPut(localLines);
      }

      if (localEntry) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }
  });

  return result;
};

export const refreshJournalEntriesFromPostgres = async (): Promise<JournalEntryReadSyncResult> => {
  if (isRefreshingJournalEntriesFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_JOURNAL_ENTRY_READ_SYNC_RESULT };
  }

  isRefreshingJournalEntriesFromPostgres = true;
  try {
    const aggregate = { ...EMPTY_JOURNAL_ENTRY_READ_SYNC_RESULT };
    let updatedAfter = await getLatestLocalRemoteUpdatedAt();

    while (true) {
      const remoteBundles = await journalEntryPostgresAdapter.list({
        updatedAfter,
        limit: POSTGRES_JOURNAL_ENTRY_REFRESH_LIMIT,
      });
      const result = await mergeRemoteJournalEntryBundlesIntoDexie(remoteBundles);
      addJournalEntryReadSyncResult(aggregate, result);

      if (remoteBundles.length < POSTGRES_JOURNAL_ENTRY_REFRESH_LIMIT) {
        break;
      }

      const nextUpdatedAfter = getLatestRemoteBundleUpdatedAt(remoteBundles);
      if (!nextUpdatedAfter || nextUpdatedAfter === updatedAfter) {
        break;
      }

      updatedAfter = nextUpdatedAfter;
    }

    return aggregate;
  } catch (error) {
    if (isPostgresUnavailableError(error)) {
      return { ...EMPTY_JOURNAL_ENTRY_READ_SYNC_RESULT };
    }

    throw error;
  } finally {
    isRefreshingJournalEntriesFromPostgres = false;
  }
};
