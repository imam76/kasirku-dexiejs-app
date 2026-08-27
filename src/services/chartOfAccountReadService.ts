import { db } from '@/lib/db';
import {
  chartOfAccountPostgresAdapter,
  isPostgresUnavailableError,
  isTauriRuntime,
  type RemoteChartOfAccountDto,
} from '@/services/postgresAdapter';
import { toTimestamp } from '@/services/shared/remoteRefreshCursor';
import { pullStoredUpdatedAtIdPages } from '@/services/shared/syncCursorStore';
import type { AccountNormalBalance, AccountType, ChartOfAccount } from '@/types';
import { toCanonicalIsoTimestamp } from '@/utils/timestamps';

export interface ChartOfAccountReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

const EMPTY_CHART_OF_ACCOUNT_READ_SYNC_RESULT: ChartOfAccountReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
};

const CHART_OF_ACCOUNT_REFRESH_LIMIT = 500;

let isRefreshingChartOfAccountsFromPostgres = false;

const optionalString = (value: string | null | undefined) => value ?? undefined;

const mapRemoteChartOfAccountToLocal = (
  remoteAccount: RemoteChartOfAccountDto,
  syncedAt: string,
): ChartOfAccount => ({
  id: remoteAccount.id,
  code: remoteAccount.code,
  name: remoteAccount.name,
  type: remoteAccount.type as AccountType,
  normal_balance: remoteAccount.normal_balance as AccountNormalBalance,
  parent_id: optionalString(remoteAccount.parent_id),
  parent_code: optionalString(remoteAccount.parent_code),
  parent_name: optionalString(remoteAccount.parent_name),
  is_postable: remoteAccount.is_postable,
  is_system: remoteAccount.is_system,
  is_active: remoteAccount.deleted_at ? false : remoteAccount.is_active,
  description: optionalString(remoteAccount.description),
  created_at: toCanonicalIsoTimestamp(remoteAccount.created_at),
  updated_at: toCanonicalIsoTimestamp(remoteAccount.updated_at),
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: toCanonicalIsoTimestamp(remoteAccount.updated_at),
});

const hasLocalUnsyncedChanges = (account: ChartOfAccount) => (
  account.sync_status === 'pending' || account.sync_status === 'failed'
);

const shouldApplyRemoteChartOfAccount = (
  localAccount: ChartOfAccount | undefined,
  remoteAccount: RemoteChartOfAccountDto,
) => {
  if (!localAccount) return true;
  if (hasLocalUnsyncedChanges(localAccount)) return false;

  const localRemoteUpdatedAt = localAccount.remote_updated_at ?? localAccount.updated_at;
  const remoteTimestamp = toTimestamp(remoteAccount.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteAccount.updated_at >= localRemoteUpdatedAt;
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

export const mergeRemoteChartOfAccountsIntoDexie = async (
  remoteAccounts: RemoteChartOfAccountDto[],
  syncedAt = new Date().toISOString(),
): Promise<ChartOfAccountReadSyncResult> => {
  const result: ChartOfAccountReadSyncResult = {
    ...EMPTY_CHART_OF_ACCOUNT_READ_SYNC_RESULT,
    fetched: remoteAccounts.length,
  };
  if (remoteAccounts.length === 0) return result;

  const accountsToPut: ChartOfAccount[] = [];

  await db.transaction('rw', db.chartOfAccounts, async () => {
    for (const remoteAccount of remoteAccounts) {
      const localAccount = await db.chartOfAccounts.get(remoteAccount.id);
      if (!shouldApplyRemoteChartOfAccount(localAccount, remoteAccount)) {
        result.skipped += 1;
        continue;
      }

      accountsToPut.push(mapRemoteChartOfAccountToLocal(remoteAccount, syncedAt));
      if (localAccount) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }

    if (accountsToPut.length > 0) {
      await db.chartOfAccounts.bulkPut(accountsToPut);
    }
  });

  return result;
};

const addChartOfAccountReadSyncResult = (
  aggregate: ChartOfAccountReadSyncResult,
  next: ChartOfAccountReadSyncResult,
) => {
  aggregate.fetched += next.fetched;
  aggregate.inserted += next.inserted;
  aggregate.updated += next.updated;
  aggregate.skipped += next.skipped;
};

export const refreshChartOfAccountsFromPostgres = async (): Promise<ChartOfAccountReadSyncResult> => {
  if (isRefreshingChartOfAccountsFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_CHART_OF_ACCOUNT_READ_SYNC_RESULT };
  }

  isRefreshingChartOfAccountsFromPostgres = true;
  try {
    const aggregate = { ...EMPTY_CHART_OF_ACCOUNT_READ_SYNC_RESULT };
    await pullStoredUpdatedAtIdPages({
      entity: 'chartOfAccounts',
      pageSize: CHART_OF_ACCOUNT_REFRESH_LIMIT,
      loadPage: (cursor) => chartOfAccountPostgresAdapter.list({
        updatedAfter: cursor?.updatedAt,
        cursorId: cursor?.id,
        limit: CHART_OF_ACCOUNT_REFRESH_LIMIT,
      }),
      mergePage: async (remoteAccounts) => {
        addChartOfAccountReadSyncResult(aggregate, await mergeRemoteChartOfAccountsIntoDexie(remoteAccounts));
      },
      getUpdatedAt: (account) => account.updated_at,
      getId: (account) => account.id,
    });

    return aggregate;
  } catch (error) {
    if (isPostgresUnavailableError(error)) {
      return { ...EMPTY_CHART_OF_ACCOUNT_READ_SYNC_RESULT };
    }

    throw error;
  } finally {
    isRefreshingChartOfAccountsFromPostgres = false;
  }
};
