import { db } from '@/lib/db';
import {
  cashierSessionPostgresAdapter,
  isTauriRuntime,
  type RemoteCashierSessionDto,
} from '@/services/postgresAdapter';
import type { CashierSession } from '@/types';

export interface CashierSessionReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

const EMPTY_CASHIER_SESSION_READ_SYNC_RESULT: CashierSessionReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
};

let isRefreshingCashierSessionsFromPostgres = false;

const optionalString = (value: string | null | undefined) => value ?? undefined;
const optionalNumber = (value: number | null | undefined) => value ?? undefined;

const mapRemoteCashierSessionToLocal = (
  remoteSession: RemoteCashierSessionDto,
  syncedAt: string,
): CashierSession => ({
  id: remoteSession.id,
  session_number: remoteSession.session_number,
  status: remoteSession.status,
  cashier_user_id: optionalString(remoteSession.cashier_user_id),
  cashier_user_name: optionalString(remoteSession.cashier_user_name),
  opened_at: remoteSession.opened_at,
  opening_cash_amount: remoteSession.opening_cash_amount,
  opening_note: optionalString(remoteSession.opening_note),
  closed_at: optionalString(remoteSession.closed_at),
  closed_by_user_id: optionalString(remoteSession.closed_by_user_id),
  closed_by_user_name: optionalString(remoteSession.closed_by_user_name),
  closing_cash_amount: optionalNumber(remoteSession.closing_cash_amount),
  closing_note: optionalString(remoteSession.closing_note),
  expected_cash_amount: optionalNumber(remoteSession.expected_cash_amount),
  cash_sales_amount: optionalNumber(remoteSession.cash_sales_amount),
  non_cash_sales_amount: optionalNumber(remoteSession.non_cash_sales_amount),
  total_sales_amount: optionalNumber(remoteSession.total_sales_amount),
  voided_sales_amount: optionalNumber(remoteSession.voided_sales_amount),
  transaction_count: optionalNumber(remoteSession.transaction_count),
  voided_transaction_count: optionalNumber(remoteSession.voided_transaction_count),
  cash_difference_amount: optionalNumber(remoteSession.cash_difference_amount),
  balance_status: remoteSession.balance_status ?? undefined,
  created_at: remoteSession.created_at,
  updated_at: remoteSession.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteSession.updated_at,
});

const hasLocalUnsyncedChanges = (session: CashierSession) => (
  session.sync_status === 'pending' || session.sync_status === 'failed'
);

const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const shouldApplyRemoteCashierSession = (
  localSession: CashierSession | undefined,
  remoteSession: RemoteCashierSessionDto,
) => {
  if (!localSession) return true;
  if (hasLocalUnsyncedChanges(localSession)) return false;

  const localRemoteUpdatedAt = localSession.remote_updated_at ?? localSession.updated_at;
  const remoteTimestamp = toTimestamp(remoteSession.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteSession.updated_at >= localRemoteUpdatedAt;
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

export const mergeRemoteCashierSessionsIntoDexie = async (
  remoteSessions: RemoteCashierSessionDto[],
  syncedAt = new Date().toISOString(),
): Promise<CashierSessionReadSyncResult> => {
  const result: CashierSessionReadSyncResult = {
    ...EMPTY_CASHIER_SESSION_READ_SYNC_RESULT,
    fetched: remoteSessions.length,
  };
  if (remoteSessions.length === 0) return result;

  const sessionsToPut: CashierSession[] = [];

  await db.transaction('rw', db.cashierSessions, async () => {
    for (const remoteSession of remoteSessions) {
      const localSession = await db.cashierSessions.get(remoteSession.id);
      if (!shouldApplyRemoteCashierSession(localSession, remoteSession)) {
        result.skipped += 1;
        continue;
      }

      sessionsToPut.push(mapRemoteCashierSessionToLocal(remoteSession, syncedAt));
      if (localSession) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }

    if (sessionsToPut.length > 0) {
      await db.cashierSessions.bulkPut(sessionsToPut);
    }
  });

  return result;
};

export const refreshCashierSessionsFromPostgres = async (): Promise<CashierSessionReadSyncResult> => {
  if (isRefreshingCashierSessionsFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_CASHIER_SESSION_READ_SYNC_RESULT };
  }

  isRefreshingCashierSessionsFromPostgres = true;
  try {
    const remoteSessions = await cashierSessionPostgresAdapter.list();
    return mergeRemoteCashierSessionsIntoDexie(remoteSessions);
  } finally {
    isRefreshingCashierSessionsFromPostgres = false;
  }
};
