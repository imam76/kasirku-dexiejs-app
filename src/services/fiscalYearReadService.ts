import { db } from '@/lib/db';
import {
  accountingFiscalYearPostgresAdapter,
  fiscalYearClosingRunPostgresAdapter,
  isTauriRuntime,
  type RemoteAccountingFiscalYearDto,
  type RemoteFiscalYearClosingRunDto,
} from '@/services/postgresAdapter';
import type {
  AccountingFiscalYear,
  AccountingFiscalYearStatus,
  ClosingRunStatus,
  FiscalYearClosingRun,
} from '@/types';

export interface FiscalYearReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  deleted: number;
  skipped: number;
}

const EMPTY_RESULT: FiscalYearReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  deleted: 0,
  skipped: 0,
};

const VALID_FISCAL_YEAR_STATUSES: AccountingFiscalYearStatus[] = ['OPEN', 'CLOSED'];
const VALID_CLOSING_RUN_STATUSES: ClosingRunStatus[] = ['DRAFT', 'POSTED', 'REVERSED'];

let isRefreshingFiscalYearsFromPostgres = false;
let isRefreshingFiscalYearClosingRunsFromPostgres = false;

const optionalString = (value: string | null | undefined) => value ?? undefined;
const optionalNumber = (value: number | null | undefined) => (
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
);
const toPositiveVersion = (version: number | null | undefined) => (
  typeof version === 'number' && Number.isFinite(version) && version > 0 ? version : 1
);
const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};
const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

const isFiscalYearStatus = (
  status: string | null | undefined,
): status is AccountingFiscalYearStatus => (
  Boolean(status) && VALID_FISCAL_YEAR_STATUSES.includes(status as AccountingFiscalYearStatus)
);

const isClosingRunStatus = (
  status: string | null | undefined,
): status is ClosingRunStatus => (
  Boolean(status) && VALID_CLOSING_RUN_STATUSES.includes(status as ClosingRunStatus)
);

const hasLocalUnsyncedChanges = (
  record: Pick<AccountingFiscalYear | FiscalYearClosingRun, 'sync_status'>,
) => record.sync_status === 'pending' || record.sync_status === 'failed';

const shouldApplyRemote = (
  localRecord: Pick<AccountingFiscalYear | FiscalYearClosingRun, 'version' | 'updated_at' | 'created_at' | 'remote_updated_at' | 'sync_status'> | undefined,
  remoteRecord: Pick<RemoteAccountingFiscalYearDto | RemoteFiscalYearClosingRunDto, 'version' | 'updated_at'>,
) => {
  if (!localRecord) return true;
  if (hasLocalUnsyncedChanges(localRecord)) return false;

  const localVersion = toPositiveVersion(localRecord.version);
  const remoteVersion = toPositiveVersion(remoteRecord.version);
  if (remoteVersion !== localVersion) return remoteVersion > localVersion;

  const localRemoteUpdatedAt = localRecord.remote_updated_at
    ?? localRecord.updated_at
    ?? localRecord.created_at;
  const remoteTimestamp = toTimestamp(remoteRecord.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);
  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteRecord.updated_at >= localRemoteUpdatedAt;
};

const mapRemoteFiscalYearToLocal = (
  remote: RemoteAccountingFiscalYearDto,
  syncedAt: string,
): AccountingFiscalYear => ({
  id: remote.id,
  name: remote.name,
  start_date: remote.start_date,
  end_date: remote.end_date,
  status: isFiscalYearStatus(remote.status) ? remote.status : 'OPEN',
  closed_at: optionalString(remote.closed_at),
  closed_by: optionalString(remote.closed_by),
  closed_by_name: optionalString(remote.closed_by_name),
  closing_journal_entry_id: optionalString(remote.closing_journal_entry_id),
  reopened_at: optionalString(remote.reopened_at),
  reopened_by: optionalString(remote.reopened_by),
  reopened_by_name: optionalString(remote.reopened_by_name),
  reopen_reason: optionalString(remote.reopen_reason),
  notes: optionalString(remote.notes),
  version: toPositiveVersion(remote.version),
  created_by: optionalString(remote.created_by),
  created_by_name: optionalString(remote.created_by_name),
  updated_by: optionalString(remote.updated_by),
  updated_by_name: optionalString(remote.updated_by_name),
  created_at: remote.created_at,
  updated_at: remote.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remote.updated_at,
});

const mapRemoteFiscalYearClosingRunToLocal = (
  remote: RemoteFiscalYearClosingRunDto,
  syncedAt: string,
): FiscalYearClosingRun => ({
  id: remote.id,
  fiscal_year_id: remote.fiscal_year_id,
  fiscal_year_name: remote.fiscal_year_name,
  start_date: remote.start_date,
  end_date: remote.end_date,
  status: isClosingRunStatus(remote.status) ? remote.status : 'DRAFT',
  retained_earning_account_id: remote.retained_earning_account_id,
  retained_earning_account_code: remote.retained_earning_account_code,
  retained_earning_account_name: remote.retained_earning_account_name,
  net_income_amount: optionalNumber(remote.net_income_amount) ?? 0,
  total_revenue_amount: optionalNumber(remote.total_revenue_amount) ?? 0,
  total_contra_revenue_amount: optionalNumber(remote.total_contra_revenue_amount) ?? 0,
  total_expense_amount: optionalNumber(remote.total_expense_amount) ?? 0,
  closing_journal_entry_id: optionalString(remote.closing_journal_entry_id),
  posted_at: optionalString(remote.posted_at),
  reversed_at: optionalString(remote.reversed_at),
  reversed_by: optionalString(remote.reversed_by),
  reversed_by_name: optionalString(remote.reversed_by_name),
  reversal_journal_entry_id: optionalString(remote.reversal_journal_entry_id),
  reversal_reason: optionalString(remote.reversal_reason),
  notes: optionalString(remote.notes),
  version: toPositiveVersion(remote.version),
  created_by: optionalString(remote.created_by),
  created_by_name: optionalString(remote.created_by_name),
  updated_by: optionalString(remote.updated_by),
  updated_by_name: optionalString(remote.updated_by_name),
  created_at: remote.created_at,
  updated_at: remote.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remote.updated_at,
});

export const mergeRemoteAccountingFiscalYearsIntoDexie = async (
  remoteFiscalYears: RemoteAccountingFiscalYearDto[],
  syncedAt = new Date().toISOString(),
): Promise<FiscalYearReadSyncResult> => {
  const result = { ...EMPTY_RESULT, fetched: remoteFiscalYears.length };
  if (remoteFiscalYears.length === 0) return result;

  await db.transaction('rw', db.accountingFiscalYears, async () => {
    for (const remoteFiscalYear of remoteFiscalYears) {
      const localFiscalYear = await db.accountingFiscalYears.get(remoteFiscalYear.id);
      if (!shouldApplyRemote(localFiscalYear, remoteFiscalYear)) {
        result.skipped += 1;
        continue;
      }

      if (remoteFiscalYear.deleted_at) {
        if (localFiscalYear) {
          await db.accountingFiscalYears.delete(remoteFiscalYear.id);
          result.deleted += 1;
        } else {
          result.skipped += 1;
        }
        continue;
      }

      await db.accountingFiscalYears.put(mapRemoteFiscalYearToLocal(remoteFiscalYear, syncedAt));
      if (localFiscalYear) result.updated += 1;
      else result.inserted += 1;
    }
  });

  return result;
};

export const mergeRemoteFiscalYearClosingRunsIntoDexie = async (
  remoteRuns: RemoteFiscalYearClosingRunDto[],
  syncedAt = new Date().toISOString(),
): Promise<FiscalYearReadSyncResult> => {
  const result = { ...EMPTY_RESULT, fetched: remoteRuns.length };
  if (remoteRuns.length === 0) return result;

  await db.transaction('rw', db.fiscalYearClosingRuns, async () => {
    for (const remoteRun of remoteRuns) {
      const localRun = await db.fiscalYearClosingRuns.get(remoteRun.id);
      if (!shouldApplyRemote(localRun, remoteRun)) {
        result.skipped += 1;
        continue;
      }

      if (remoteRun.deleted_at) {
        if (localRun) {
          await db.fiscalYearClosingRuns.delete(remoteRun.id);
          result.deleted += 1;
        } else {
          result.skipped += 1;
        }
        continue;
      }

      await db.fiscalYearClosingRuns.put(mapRemoteFiscalYearClosingRunToLocal(remoteRun, syncedAt));
      if (localRun) result.updated += 1;
      else result.inserted += 1;
    }
  });

  return result;
};

export const refreshAccountingFiscalYearsFromPostgres = async (): Promise<FiscalYearReadSyncResult> => {
  if (isRefreshingFiscalYearsFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_RESULT };
  }

  isRefreshingFiscalYearsFromPostgres = true;
  try {
    return mergeRemoteAccountingFiscalYearsIntoDexie(await accountingFiscalYearPostgresAdapter.list());
  } finally {
    isRefreshingFiscalYearsFromPostgres = false;
  }
};

export const refreshFiscalYearClosingRunsFromPostgres = async (): Promise<FiscalYearReadSyncResult> => {
  if (isRefreshingFiscalYearClosingRunsFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_RESULT };
  }

  isRefreshingFiscalYearClosingRunsFromPostgres = true;
  try {
    return mergeRemoteFiscalYearClosingRunsIntoDexie(await fiscalYearClosingRunPostgresAdapter.list());
  } finally {
    isRefreshingFiscalYearClosingRunsFromPostgres = false;
  }
};
