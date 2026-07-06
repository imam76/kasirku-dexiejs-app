import { db } from '@/lib/db';
import {
  accountingPeriodPostgresAdapter,
  isTauriRuntime,
  type RemoteAccountingPeriodDto,
} from '@/services/postgresAdapter';
import type { AccountingPeriod, AccountingPeriodStatus, AccountingPeriodType } from '@/types';

export interface AccountingPeriodReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  deleted: number;
  skipped: number;
}

const EMPTY_ACCOUNTING_PERIOD_READ_SYNC_RESULT: AccountingPeriodReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  deleted: 0,
  skipped: 0,
};

const VALID_STATUSES: AccountingPeriodStatus[] = ['OPEN', 'LOCKED', 'CLOSED'];
const VALID_TYPES: AccountingPeriodType[] = ['MONTHLY', 'YEARLY'];

let isRefreshingAccountingPeriodsFromPostgres = false;

const optionalString = (value: string | null | undefined) => value ?? undefined;
const toPositiveVersion = (version: number | null | undefined) => (
  typeof version === 'number' && Number.isFinite(version) && version > 0 ? version : 1
);
const isAccountingPeriodStatus = (
  status: string | null | undefined,
): status is AccountingPeriodStatus => (
  Boolean(status) && VALID_STATUSES.includes(status as AccountingPeriodStatus)
);
const isAccountingPeriodType = (
  periodType: string | null | undefined,
): periodType is AccountingPeriodType => (
  Boolean(periodType) && VALID_TYPES.includes(periodType as AccountingPeriodType)
);

const mapRemoteAccountingPeriodToLocal = (
  remotePeriod: RemoteAccountingPeriodDto,
  syncedAt: string,
): AccountingPeriod => ({
  id: remotePeriod.id,
  name: remotePeriod.name,
  period_type: isAccountingPeriodType(remotePeriod.period_type) ? remotePeriod.period_type : 'YEARLY',
  start_date: remotePeriod.start_date,
  end_date: remotePeriod.end_date,
  status: isAccountingPeriodStatus(remotePeriod.status) ? remotePeriod.status : 'OPEN',
  locked_at: optionalString(remotePeriod.locked_at),
  locked_by: optionalString(remotePeriod.locked_by),
  locked_by_name: optionalString(remotePeriod.locked_by_name),
  closed_at: optionalString(remotePeriod.closed_at),
  closed_by: optionalString(remotePeriod.closed_by),
  closed_by_name: optionalString(remotePeriod.closed_by_name),
  closing_journal_entry_id: optionalString(remotePeriod.closing_journal_entry_id),
  reopened_at: optionalString(remotePeriod.reopened_at),
  reopened_by: optionalString(remotePeriod.reopened_by),
  reopened_by_name: optionalString(remotePeriod.reopened_by_name),
  reopen_reason: optionalString(remotePeriod.reopen_reason),
  notes: optionalString(remotePeriod.notes),
  version: toPositiveVersion(remotePeriod.version),
  created_by: optionalString(remotePeriod.created_by),
  created_by_name: optionalString(remotePeriod.created_by_name),
  updated_by: optionalString(remotePeriod.updated_by),
  updated_by_name: optionalString(remotePeriod.updated_by_name),
  created_at: remotePeriod.created_at,
  updated_at: remotePeriod.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remotePeriod.updated_at,
});

const hasLocalUnsyncedChanges = (period: AccountingPeriod) => (
  period.sync_status === 'pending' || period.sync_status === 'failed'
);

const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const shouldApplyRemoteAccountingPeriod = (
  localPeriod: AccountingPeriod | undefined,
  remotePeriod: RemoteAccountingPeriodDto,
) => {
  if (!localPeriod) return true;
  if (hasLocalUnsyncedChanges(localPeriod)) return false;

  const localVersion = toPositiveVersion(localPeriod.version);
  const remoteVersion = toPositiveVersion(remotePeriod.version);
  if (remoteVersion !== localVersion) {
    return remoteVersion > localVersion;
  }

  const localRemoteUpdatedAt = localPeriod.remote_updated_at
    ?? localPeriod.updated_at
    ?? localPeriod.created_at;
  const remoteTimestamp = toTimestamp(remotePeriod.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remotePeriod.updated_at >= localRemoteUpdatedAt;
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

export const mergeRemoteAccountingPeriodsIntoDexie = async (
  remotePeriods: RemoteAccountingPeriodDto[],
  syncedAt = new Date().toISOString(),
): Promise<AccountingPeriodReadSyncResult> => {
  const result: AccountingPeriodReadSyncResult = {
    ...EMPTY_ACCOUNTING_PERIOD_READ_SYNC_RESULT,
    fetched: remotePeriods.length,
  };
  if (remotePeriods.length === 0) return result;

  await db.transaction('rw', db.accountingPeriods, async () => {
    for (const remotePeriod of remotePeriods) {
      const localPeriod = await db.accountingPeriods.get(remotePeriod.id);
      if (!shouldApplyRemoteAccountingPeriod(localPeriod, remotePeriod)) {
        result.skipped += 1;
        continue;
      }

      if (remotePeriod.deleted_at) {
        if (localPeriod) {
          await db.accountingPeriods.delete(remotePeriod.id);
          result.deleted += 1;
        } else {
          result.skipped += 1;
        }
        continue;
      }

      await db.accountingPeriods.put(mapRemoteAccountingPeriodToLocal(remotePeriod, syncedAt));
      if (localPeriod) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }
  });

  return result;
};

export const refreshAccountingPeriodsFromPostgres =
  async (): Promise<AccountingPeriodReadSyncResult> => {
    if (isRefreshingAccountingPeriodsFromPostgres || !canReadFromPostgres()) {
      return { ...EMPTY_ACCOUNTING_PERIOD_READ_SYNC_RESULT };
    }

    isRefreshingAccountingPeriodsFromPostgres = true;
    try {
      const remotePeriods = await accountingPeriodPostgresAdapter.list();
      return mergeRemoteAccountingPeriodsIntoDexie(remotePeriods);
    } finally {
      isRefreshingAccountingPeriodsFromPostgres = false;
    }
  };
