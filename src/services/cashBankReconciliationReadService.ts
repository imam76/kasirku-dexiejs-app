import { db } from '@/lib/db';
import {
  cashBankReconciliationPostgresAdapter,
  isTauriRuntime,
  type RemoteCashBankReconciliationDto,
} from '@/services/postgresAdapter';
import type { CashBankReconciliation, CashBankReconciliationStatus } from '@/types';

export interface CashBankReconciliationReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  deleted: number;
  skipped: number;
}

const EMPTY_CASH_BANK_RECONCILIATION_READ_SYNC_RESULT: CashBankReconciliationReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  deleted: 0,
  skipped: 0,
};

const VALID_STATUSES: CashBankReconciliationStatus[] = ['BALANCED', 'DIFFERENCE', 'VOIDED'];

let isRefreshingCashBankReconciliationsFromPostgres = false;

const optionalString = (value: string | null | undefined) => value ?? undefined;
const optionalNumber = (value: number | null | undefined) => (
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
);
const toPositiveVersion = (version: number | null | undefined) => (
  typeof version === 'number' && Number.isFinite(version) && version > 0 ? version : 1
);
const isCashBankReconciliationStatus = (
  status: string | null | undefined,
): status is CashBankReconciliationStatus => (
  Boolean(status) && VALID_STATUSES.includes(status as CashBankReconciliationStatus)
);

const mapRemoteCashBankReconciliationToLocal = (
  remoteReconciliation: RemoteCashBankReconciliationDto,
  syncedAt: string,
): CashBankReconciliation => ({
  id: remoteReconciliation.id,
  reconciliation_number: remoteReconciliation.reconciliation_number,
  cash_account_id: remoteReconciliation.cash_account_id,
  cash_account_code: optionalString(remoteReconciliation.cash_account_code),
  cash_account_name: remoteReconciliation.cash_account_name,
  statement_date: remoteReconciliation.statement_date,
  statement_reference: optionalString(remoteReconciliation.statement_reference),
  statement_ending_balance: optionalNumber(remoteReconciliation.statement_ending_balance) ?? 0,
  book_balance_amount: optionalNumber(remoteReconciliation.book_balance_amount) ?? 0,
  cleared_balance_amount: optionalNumber(remoteReconciliation.cleared_balance_amount) ?? 0,
  selected_transaction_total_amount: optionalNumber(remoteReconciliation.selected_transaction_total_amount) ?? 0,
  selected_transaction_count: optionalNumber(remoteReconciliation.selected_transaction_count) ?? 0,
  selected_transaction_ids: Array.isArray(remoteReconciliation.selected_transaction_ids)
    ? remoteReconciliation.selected_transaction_ids
    : [],
  difference_amount: optionalNumber(remoteReconciliation.difference_amount) ?? 0,
  status: isCashBankReconciliationStatus(remoteReconciliation.status)
    ? remoteReconciliation.status
    : 'DIFFERENCE',
  notes: optionalString(remoteReconciliation.notes),
  voided_at: optionalString(remoteReconciliation.voided_at),
  void_reason: optionalString(remoteReconciliation.void_reason),
  version: toPositiveVersion(remoteReconciliation.version),
  created_by: optionalString(remoteReconciliation.created_by),
  created_by_name: optionalString(remoteReconciliation.created_by_name),
  updated_by: optionalString(remoteReconciliation.updated_by),
  updated_by_name: optionalString(remoteReconciliation.updated_by_name),
  created_at: remoteReconciliation.created_at,
  updated_at: remoteReconciliation.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteReconciliation.updated_at,
});

const hasLocalUnsyncedChanges = (reconciliation: CashBankReconciliation) => (
  reconciliation.sync_status === 'pending' || reconciliation.sync_status === 'failed'
);

const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const shouldApplyRemoteCashBankReconciliation = (
  localReconciliation: CashBankReconciliation | undefined,
  remoteReconciliation: RemoteCashBankReconciliationDto,
) => {
  if (!localReconciliation) return true;
  if (hasLocalUnsyncedChanges(localReconciliation)) return false;

  const localVersion = toPositiveVersion(localReconciliation.version);
  const remoteVersion = toPositiveVersion(remoteReconciliation.version);
  if (remoteVersion !== localVersion) {
    return remoteVersion > localVersion;
  }

  const localRemoteUpdatedAt = localReconciliation.remote_updated_at
    ?? localReconciliation.updated_at
    ?? localReconciliation.created_at;
  const remoteTimestamp = toTimestamp(remoteReconciliation.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteReconciliation.updated_at >= localRemoteUpdatedAt;
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

export const mergeRemoteCashBankReconciliationsIntoDexie = async (
  remoteReconciliations: RemoteCashBankReconciliationDto[],
  syncedAt = new Date().toISOString(),
): Promise<CashBankReconciliationReadSyncResult> => {
  const result: CashBankReconciliationReadSyncResult = {
    ...EMPTY_CASH_BANK_RECONCILIATION_READ_SYNC_RESULT,
    fetched: remoteReconciliations.length,
  };
  if (remoteReconciliations.length === 0) return result;

  await db.transaction('rw', db.cashBankReconciliations, async () => {
    for (const remoteReconciliation of remoteReconciliations) {
      const localReconciliation = await db.cashBankReconciliations.get(remoteReconciliation.id);
      if (!shouldApplyRemoteCashBankReconciliation(localReconciliation, remoteReconciliation)) {
        result.skipped += 1;
        continue;
      }

      if (remoteReconciliation.deleted_at) {
        if (localReconciliation) {
          await db.cashBankReconciliations.delete(remoteReconciliation.id);
          result.deleted += 1;
        } else {
          result.skipped += 1;
        }
        continue;
      }

      await db.cashBankReconciliations.put(mapRemoteCashBankReconciliationToLocal(remoteReconciliation, syncedAt));
      if (localReconciliation) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }
  });

  return result;
};

export const refreshCashBankReconciliationsFromPostgres =
  async (): Promise<CashBankReconciliationReadSyncResult> => {
    if (isRefreshingCashBankReconciliationsFromPostgres || !canReadFromPostgres()) {
      return { ...EMPTY_CASH_BANK_RECONCILIATION_READ_SYNC_RESULT };
    }

    isRefreshingCashBankReconciliationsFromPostgres = true;
    try {
      const remoteReconciliations = await cashBankReconciliationPostgresAdapter.list();
      return mergeRemoteCashBankReconciliationsIntoDexie(remoteReconciliations);
    } finally {
      isRefreshingCashBankReconciliationsFromPostgres = false;
    }
  };
