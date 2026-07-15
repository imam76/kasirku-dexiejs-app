import { db } from '@/lib/db';
import {
  isPostgresUnavailableError,
  isTauriRuntime,
  openingBalancePostgresAdapter,
  type RemoteOpeningBalanceBatchDto,
  type RemoteOpeningBalanceBundleDto,
  type RemoteOpeningBalanceLineDto,
} from '@/services/postgresAdapter';
import type {
  OpeningBalanceBatch,
  OpeningBalanceBatchStatus,
  OpeningBalanceLine,
  OpeningBalanceLineSettlementStatus,
  OpeningBalanceModule,
} from '@/types';

export interface OpeningBalanceReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  deleted: number;
  skipped: number;
}

const EMPTY_OPENING_BALANCE_READ_SYNC_RESULT: OpeningBalanceReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  deleted: 0,
  skipped: 0,
};

const VALID_OPENING_BALANCE_MODULES: OpeningBalanceModule[] = [
  'ACCOUNT',
  'RECEIVABLE',
  'PAYABLE',
  'ADVANCE_RECEIVED',
  'ADVANCE_PAID',
];
const VALID_OPENING_BALANCE_BATCH_STATUSES: OpeningBalanceBatchStatus[] = [
  'DRAFT',
  'VALIDATED',
  'POSTED',
  'LOCKED',
  'REVERSED',
  'SKIPPED',
  'VOIDED',
];
const VALID_OPENING_BALANCE_LINE_SETTLEMENT_STATUSES: OpeningBalanceLineSettlementStatus[] = [
  'OPEN',
  'PARTIAL',
  'PAID',
  'VOIDED',
];
const POSTGRES_OPENING_BALANCE_REFRESH_LIMIT = 200;

let isRefreshingOpeningBalancesFromPostgres = false;

const optionalString = (value: string | null | undefined) => value ?? undefined;
const optionalNumber = (value: number | null | undefined) => (
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
);
const numberOrZero = (value: number | null | undefined) => (
  typeof value === 'number' && Number.isFinite(value) ? value : 0
);
const toPositiveVersion = (version: number | null | undefined) => (
  typeof version === 'number' && Number.isFinite(version) && version > 0 ? version : 1
);
const isOpeningBalanceModule = (module: string): module is OpeningBalanceModule => (
  VALID_OPENING_BALANCE_MODULES.includes(module as OpeningBalanceModule)
);
const isOpeningBalanceBatchStatus = (status: string): status is OpeningBalanceBatchStatus => (
  VALID_OPENING_BALANCE_BATCH_STATUSES.includes(status as OpeningBalanceBatchStatus)
);
const isOpeningBalanceLineSettlementStatus = (
  status: string | null | undefined,
): status is OpeningBalanceLineSettlementStatus => (
  Boolean(status && VALID_OPENING_BALANCE_LINE_SETTLEMENT_STATUSES.includes(status as OpeningBalanceLineSettlementStatus))
);

const mapRemoteOpeningBalanceBatchToLocal = (
  remoteBatch: RemoteOpeningBalanceBatchDto,
  syncedAt: string,
): OpeningBalanceBatch => ({
  id: remoteBatch.id,
  batch_number: optionalString(remoteBatch.batch_number),
  company_id: optionalString(remoteBatch.company_id),
  company_name: optionalString(remoteBatch.company_name),
  module: isOpeningBalanceModule(remoteBatch.module) ? remoteBatch.module : 'ACCOUNT',
  cutoff_date: remoteBatch.cutoff_date,
  accounting_start_date: optionalString(remoteBatch.accounting_start_date),
  status: isOpeningBalanceBatchStatus(remoteBatch.status) ? remoteBatch.status : 'DRAFT',
  revision_number: toPositiveVersion(remoteBatch.revision_number),
  previous_batch_id: optionalString(remoteBatch.previous_batch_id),
  total_debit: numberOrZero(remoteBatch.total_debit),
  total_credit: numberOrZero(remoteBatch.total_credit),
  journal_entry_id: optionalString(remoteBatch.journal_entry_id),
  posting_idempotency_key: optionalString(remoteBatch.posting_idempotency_key),
  posted_at: optionalString(remoteBatch.posted_at),
  posted_by: optionalString(remoteBatch.posted_by),
  posted_by_name: optionalString(remoteBatch.posted_by_name),
  locked_at: optionalString(remoteBatch.locked_at),
  reversed_at: optionalString(remoteBatch.reversed_at),
  reversed_by: optionalString(remoteBatch.reversed_by),
  reversed_by_name: optionalString(remoteBatch.reversed_by_name),
  reversal_journal_entry_id: optionalString(remoteBatch.reversal_journal_entry_id),
  skipped_at: optionalString(remoteBatch.skipped_at),
  validated_at: optionalString(remoteBatch.validated_at),
  validated_by: optionalString(remoteBatch.validated_by),
  validated_by_name: optionalString(remoteBatch.validated_by_name),
  notes: optionalString(remoteBatch.notes),
  version: toPositiveVersion(remoteBatch.version),
  created_by: optionalString(remoteBatch.created_by),
  created_by_name: optionalString(remoteBatch.created_by_name),
  updated_by: optionalString(remoteBatch.updated_by),
  updated_by_name: optionalString(remoteBatch.updated_by_name),
  created_at: remoteBatch.created_at,
  updated_at: remoteBatch.updated_at,
  deleted_at: optionalString(remoteBatch.deleted_at),
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteBatch.updated_at,
});

const mapRemoteOpeningBalanceLineToLocal = (
  remoteLine: RemoteOpeningBalanceLineDto,
  syncedAt: string,
): OpeningBalanceLine => ({
  id: remoteLine.id,
  batch_id: remoteLine.batch_id,
  module: isOpeningBalanceModule(remoteLine.module) ? remoteLine.module : 'ACCOUNT',
  line_number: Math.trunc(numberOrZero(remoteLine.line_number)),
  contact_id: optionalString(remoteLine.contact_id),
  party_name: optionalString(remoteLine.party_name),
  document_number: optionalString(remoteLine.document_number),
  document_date: optionalString(remoteLine.document_date),
  due_date: optionalString(remoteLine.due_date),
  currency_code: optionalString(remoteLine.currency_code),
  currency_name: optionalString(remoteLine.currency_name),
  currency_symbol: optionalString(remoteLine.currency_symbol),
  base_currency_code: optionalString(remoteLine.base_currency_code),
  fx_rate: optionalNumber(remoteLine.fx_rate),
  amount: optionalNumber(remoteLine.amount),
  base_amount: numberOrZero(remoteLine.base_amount),
  paid_amount: optionalNumber(remoteLine.paid_amount),
  remaining_amount: optionalNumber(remoteLine.remaining_amount),
  settlement_status: isOpeningBalanceLineSettlementStatus(remoteLine.settlement_status)
    ? remoteLine.settlement_status
    : undefined,
  last_paid_at: optionalString(remoteLine.last_paid_at),
  account_id: optionalString(remoteLine.account_id),
  account_code: optionalString(remoteLine.account_code),
  account_name: optionalString(remoteLine.account_name),
  counter_account_id: optionalString(remoteLine.counter_account_id),
  counter_account_code: optionalString(remoteLine.counter_account_code),
  counter_account_name: optionalString(remoteLine.counter_account_name),
  debit: numberOrZero(remoteLine.debit),
  credit: numberOrZero(remoteLine.credit),
  notes: optionalString(remoteLine.notes),
  created_at: remoteLine.created_at,
  updated_at: remoteLine.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteLine.updated_at,
});

const hasLocalUnsyncedBatchChanges = (batch: OpeningBalanceBatch | undefined) => (
  batch?.sync_status === 'pending' || batch?.sync_status === 'failed'
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
  const batches = await db.openingBalanceBatches.toArray();

  return batches.reduce<string | undefined>((latest, batch) => {
    const remoteUpdatedAt = batch.remote_updated_at
      ?? (batch.sync_status === 'synced' ? batch.updated_at : undefined);
    return getLaterUpdatedAt(latest, remoteUpdatedAt);
  }, undefined);
};

const getLatestRemoteBundleUpdatedAt = (remoteBundles: RemoteOpeningBalanceBundleDto[]) => (
  remoteBundles.reduce<string | undefined>(
    (latest, bundle) => getLaterUpdatedAt(latest, bundle.batch.updated_at),
    undefined,
  )
);

const addOpeningBalanceReadSyncResult = (
  aggregate: OpeningBalanceReadSyncResult,
  next: OpeningBalanceReadSyncResult,
) => {
  aggregate.fetched += next.fetched;
  aggregate.inserted += next.inserted;
  aggregate.updated += next.updated;
  aggregate.deleted += next.deleted;
  aggregate.skipped += next.skipped;
};

const shouldApplyRemoteOpeningBalanceBatch = (
  localBatch: OpeningBalanceBatch | undefined,
  remoteBatch: RemoteOpeningBalanceBatchDto,
) => {
  if (!localBatch) return true;
  if (hasLocalUnsyncedBatchChanges(localBatch)) return false;

  const localVersion = toPositiveVersion(localBatch.version);
  const remoteVersion = toPositiveVersion(remoteBatch.version);
  if (remoteVersion !== localVersion) {
    return remoteVersion > localVersion;
  }

  const localRemoteUpdatedAt = localBatch.remote_updated_at ?? localBatch.updated_at;
  const remoteTimestamp = toTimestamp(remoteBatch.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteBatch.updated_at >= localRemoteUpdatedAt;
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

export const mergeRemoteOpeningBalanceBundlesIntoDexie = async (
  remoteBundles: RemoteOpeningBalanceBundleDto[],
  syncedAt = new Date().toISOString(),
): Promise<OpeningBalanceReadSyncResult> => {
  const result: OpeningBalanceReadSyncResult = {
    ...EMPTY_OPENING_BALANCE_READ_SYNC_RESULT,
    fetched: remoteBundles.length,
  };
  if (remoteBundles.length === 0) return result;

  await db.transaction('rw', db.openingBalanceBatches, db.openingBalanceLines, async () => {
    for (const remoteBundle of remoteBundles) {
      const localBatch = await db.openingBalanceBatches.get(remoteBundle.batch.id);
      if (!shouldApplyRemoteOpeningBalanceBatch(localBatch, remoteBundle.batch)) {
        result.skipped += 1;
        continue;
      }

      if (remoteBundle.batch.deleted_at) {
        if (localBatch) {
          await db.openingBalanceBatches.delete(remoteBundle.batch.id);
          await db.openingBalanceLines.where('batch_id').equals(remoteBundle.batch.id).delete();
          result.deleted += 1;
        } else {
          result.skipped += 1;
        }
        continue;
      }

      await db.openingBalanceBatches.put(mapRemoteOpeningBalanceBatchToLocal(remoteBundle.batch, syncedAt));
      await db.openingBalanceLines.where('batch_id').equals(remoteBundle.batch.id).delete();
      const localLines = remoteBundle.lines.map((line) => mapRemoteOpeningBalanceLineToLocal(line, syncedAt));
      if (localLines.length > 0) {
        await db.openingBalanceLines.bulkPut(localLines);
      }

      if (localBatch) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }
  });

  return result;
};

export const refreshOpeningBalancesFromPostgres = async (): Promise<OpeningBalanceReadSyncResult> => {
  if (isRefreshingOpeningBalancesFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_OPENING_BALANCE_READ_SYNC_RESULT };
  }

  isRefreshingOpeningBalancesFromPostgres = true;
  try {
    const aggregate = { ...EMPTY_OPENING_BALANCE_READ_SYNC_RESULT };
    let updatedAfter = await getLatestLocalRemoteUpdatedAt();

    while (true) {
      const remoteBundles = await openingBalancePostgresAdapter.list({
        updatedAfter,
        limit: POSTGRES_OPENING_BALANCE_REFRESH_LIMIT,
      });
      const result = await mergeRemoteOpeningBalanceBundlesIntoDexie(remoteBundles);
      addOpeningBalanceReadSyncResult(aggregate, result);

      if (remoteBundles.length < POSTGRES_OPENING_BALANCE_REFRESH_LIMIT) {
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
      return { ...EMPTY_OPENING_BALANCE_READ_SYNC_RESULT };
    }

    throw error;
  } finally {
    isRefreshingOpeningBalancesFromPostgres = false;
  }
};
