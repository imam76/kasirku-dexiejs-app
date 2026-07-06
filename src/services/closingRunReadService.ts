import { db } from '@/lib/db';
import {
  closingRunPostgresAdapter,
  isTauriRuntime,
  type RemoteClosingRunDto,
} from '@/services/postgresAdapter';
import type { ClosingRun, ClosingRunStatus } from '@/types';

export interface ClosingRunReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  deleted: number;
  skipped: number;
}

const EMPTY_CLOSING_RUN_READ_SYNC_RESULT: ClosingRunReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  deleted: 0,
  skipped: 0,
};

const VALID_STATUSES: ClosingRunStatus[] = ['DRAFT', 'POSTED', 'REVERSED'];

let isRefreshingClosingRunsFromPostgres = false;

const optionalString = (value: string | null | undefined) => value ?? undefined;
const optionalNumber = (value: number | null | undefined) => (
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
);
const toPositiveVersion = (version: number | null | undefined) => (
  typeof version === 'number' && Number.isFinite(version) && version > 0 ? version : 1
);
const isClosingRunStatus = (
  status: string | null | undefined,
): status is ClosingRunStatus => (
  Boolean(status) && VALID_STATUSES.includes(status as ClosingRunStatus)
);

const mapRemoteClosingRunToLocal = (
  remoteRun: RemoteClosingRunDto,
  syncedAt: string,
): ClosingRun => ({
  id: remoteRun.id,
  period_id: remoteRun.period_id,
  period_name: remoteRun.period_name,
  start_date: remoteRun.start_date,
  end_date: remoteRun.end_date,
  status: isClosingRunStatus(remoteRun.status) ? remoteRun.status : 'DRAFT',
  retained_earning_account_id: remoteRun.retained_earning_account_id,
  retained_earning_account_code: remoteRun.retained_earning_account_code,
  retained_earning_account_name: remoteRun.retained_earning_account_name,
  net_income_amount: optionalNumber(remoteRun.net_income_amount) ?? 0,
  total_revenue_amount: optionalNumber(remoteRun.total_revenue_amount) ?? 0,
  total_contra_revenue_amount: optionalNumber(remoteRun.total_contra_revenue_amount) ?? 0,
  total_expense_amount: optionalNumber(remoteRun.total_expense_amount) ?? 0,
  closing_journal_entry_id: optionalString(remoteRun.closing_journal_entry_id),
  posted_at: optionalString(remoteRun.posted_at),
  reversed_at: optionalString(remoteRun.reversed_at),
  reversed_by: optionalString(remoteRun.reversed_by),
  reversed_by_name: optionalString(remoteRun.reversed_by_name),
  reversal_journal_entry_id: optionalString(remoteRun.reversal_journal_entry_id),
  reversal_reason: optionalString(remoteRun.reversal_reason),
  notes: optionalString(remoteRun.notes),
  version: toPositiveVersion(remoteRun.version),
  created_by: optionalString(remoteRun.created_by),
  created_by_name: optionalString(remoteRun.created_by_name),
  updated_by: optionalString(remoteRun.updated_by),
  updated_by_name: optionalString(remoteRun.updated_by_name),
  created_at: remoteRun.created_at,
  updated_at: remoteRun.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteRun.updated_at,
});

const hasLocalUnsyncedChanges = (run: ClosingRun) => (
  run.sync_status === 'pending' || run.sync_status === 'failed'
);

const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const shouldApplyRemoteClosingRun = (
  localRun: ClosingRun | undefined,
  remoteRun: RemoteClosingRunDto,
) => {
  if (!localRun) return true;
  if (hasLocalUnsyncedChanges(localRun)) return false;

  const localVersion = toPositiveVersion(localRun.version);
  const remoteVersion = toPositiveVersion(remoteRun.version);
  if (remoteVersion !== localVersion) {
    return remoteVersion > localVersion;
  }

  const localRemoteUpdatedAt = localRun.remote_updated_at
    ?? localRun.updated_at
    ?? localRun.created_at;
  const remoteTimestamp = toTimestamp(remoteRun.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteRun.updated_at >= localRemoteUpdatedAt;
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

export const mergeRemoteClosingRunsIntoDexie = async (
  remoteRuns: RemoteClosingRunDto[],
  syncedAt = new Date().toISOString(),
): Promise<ClosingRunReadSyncResult> => {
  const result: ClosingRunReadSyncResult = {
    ...EMPTY_CLOSING_RUN_READ_SYNC_RESULT,
    fetched: remoteRuns.length,
  };
  if (remoteRuns.length === 0) return result;

  await db.transaction('rw', db.closingRuns, async () => {
    for (const remoteRun of remoteRuns) {
      const localRun = await db.closingRuns.get(remoteRun.id);
      if (!shouldApplyRemoteClosingRun(localRun, remoteRun)) {
        result.skipped += 1;
        continue;
      }

      if (remoteRun.deleted_at) {
        if (localRun) {
          await db.closingRuns.delete(remoteRun.id);
          result.deleted += 1;
        } else {
          result.skipped += 1;
        }
        continue;
      }

      await db.closingRuns.put(mapRemoteClosingRunToLocal(remoteRun, syncedAt));
      if (localRun) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }
  });

  return result;
};

export const refreshClosingRunsFromPostgres =
  async (): Promise<ClosingRunReadSyncResult> => {
    if (isRefreshingClosingRunsFromPostgres || !canReadFromPostgres()) {
      return { ...EMPTY_CLOSING_RUN_READ_SYNC_RESULT };
    }

    isRefreshingClosingRunsFromPostgres = true;
    try {
      const remoteRuns = await closingRunPostgresAdapter.list();
      return mergeRemoteClosingRunsIntoDexie(remoteRuns);
    } finally {
      isRefreshingClosingRunsFromPostgres = false;
    }
  };
