import { db } from '@/lib/db';
import { isTauriRuntime, budgetCommitmentPostgresAdapter, type RemoteBudgetCommitmentDto } from '@/services/postgresAdapter';
import type { BudgetCommitment, BudgetCommitmentStatus } from '@/types';
import { toCanonicalIsoTimestamp, toCanonicalOptionalIsoTimestamp } from '@/utils/timestamps';

export interface BudgetCommitmentReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  deleted: number;
}

const EMPTY_BUDGET_COMMITMENT_READ_SYNC_RESULT: BudgetCommitmentReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
  deleted: 0,
};

let isRefreshingBudgetCommitmentsFromPostgres = false;

const isBudgetCommitmentStatus = (value: string): value is BudgetCommitmentStatus => (
  value === 'PLANNED' || value === 'REALIZED' || value === 'CANCELLED'
);

const mapRemoteBudgetCommitmentToLocal = (
  remoteBudgetCommitment: RemoteBudgetCommitmentDto,
  syncedAt: string,
): BudgetCommitment => ({
  id: remoteBudgetCommitment.id,
  budget_id: remoteBudgetCommitment.budget_id,
  description: remoteBudgetCommitment.description,
  amount: remoteBudgetCommitment.amount,
  status: isBudgetCommitmentStatus(remoteBudgetCommitment.status) ? remoteBudgetCommitment.status : 'PLANNED',
  notes: remoteBudgetCommitment.notes ?? undefined,
  resolved_at: toCanonicalOptionalIsoTimestamp(remoteBudgetCommitment.resolved_at),
  created_at: toCanonicalIsoTimestamp(remoteBudgetCommitment.created_at),
  updated_at: toCanonicalIsoTimestamp(remoteBudgetCommitment.updated_at),
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: toCanonicalIsoTimestamp(remoteBudgetCommitment.updated_at),
});

const hasLocalUnsyncedChanges = (commitment: BudgetCommitment) => (
  commitment.sync_status === 'pending' || commitment.sync_status === 'failed'
);

const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const shouldApplyRemoteBudgetCommitment = (
  localCommitment: BudgetCommitment | undefined,
  remoteCommitment: RemoteBudgetCommitmentDto,
) => {
  if (!localCommitment) return true;
  if (hasLocalUnsyncedChanges(localCommitment)) return false;

  const localRemoteUpdatedAt = localCommitment.remote_updated_at ?? localCommitment.updated_at;
  const remoteTimestamp = toTimestamp(remoteCommitment.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteCommitment.updated_at >= localRemoteUpdatedAt;
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

/**
 * Prunes local commitments that no longer exist remotely. Only safe to call with a full,
 * unfiltered snapshot of the remote table (which is what budgetCommitmentPostgresAdapter.list()
 * always returns - no pagination/date filtering) - a partial/incremental payload would make
 * "absent from this batch" meaningless as a deletion signal.
 *
 * budget_commitments is hard-deleted server-side (no deleted_at tombstone, see
 * 0091_budget_commitments.sql), so a row removed by another device would otherwise never
 * disappear from this device's Dexie copy: the upsert-only merge below has no other way to learn
 * a row is gone. Only rows already confirmed synced are eligible - a local 'pending'/'failed'
 * commitment is either not pushed yet or has local edits in flight, so its absence from the
 * remote snapshot says nothing about deletion.
 */
const pruneLocalBudgetCommitmentsDeletedRemotely = async (
  remoteBudgetCommitments: RemoteBudgetCommitmentDto[],
): Promise<number> => {
  const remoteIds = new Set(remoteBudgetCommitments.map((commitment) => commitment.id));
  const localCommitments = await db.budgetCommitments.toArray();
  const idsToRemove = localCommitments
    .filter((commitment) => commitment.sync_status === 'synced' && !remoteIds.has(commitment.id))
    .map((commitment) => commitment.id);

  if (idsToRemove.length > 0) {
    await db.budgetCommitments.bulkDelete(idsToRemove);
  }

  return idsToRemove.length;
};

export const mergeRemoteBudgetCommitmentsIntoDexie = async (
  remoteBudgetCommitments: RemoteBudgetCommitmentDto[],
  syncedAt = new Date().toISOString(),
  options: { isFullSnapshot?: boolean } = {},
): Promise<BudgetCommitmentReadSyncResult> => {
  const result: BudgetCommitmentReadSyncResult = {
    ...EMPTY_BUDGET_COMMITMENT_READ_SYNC_RESULT,
    fetched: remoteBudgetCommitments.length,
  };
  if (remoteBudgetCommitments.length === 0 && !options.isFullSnapshot) return result;

  const commitmentsToPut: BudgetCommitment[] = [];

  await db.transaction('rw', db.budgetCommitments, async () => {
    for (const remoteCommitment of remoteBudgetCommitments) {
      const localCommitment = await db.budgetCommitments.get(remoteCommitment.id);
      if (!shouldApplyRemoteBudgetCommitment(localCommitment, remoteCommitment)) {
        result.skipped += 1;
        continue;
      }

      commitmentsToPut.push(mapRemoteBudgetCommitmentToLocal(remoteCommitment, syncedAt));
      if (localCommitment) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }

    if (commitmentsToPut.length > 0) {
      await db.budgetCommitments.bulkPut(commitmentsToPut);
    }

    if (options.isFullSnapshot) {
      result.deleted = await pruneLocalBudgetCommitmentsDeletedRemotely(remoteBudgetCommitments);
    }
  });

  return result;
};

export const refreshBudgetCommitmentsFromPostgres = async (): Promise<BudgetCommitmentReadSyncResult> => {
  if (isRefreshingBudgetCommitmentsFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_BUDGET_COMMITMENT_READ_SYNC_RESULT };
  }

  isRefreshingBudgetCommitmentsFromPostgres = true;
  try {
    const remoteBudgetCommitments = await budgetCommitmentPostgresAdapter.list();
    return mergeRemoteBudgetCommitmentsIntoDexie(remoteBudgetCommitments, undefined, { isFullSnapshot: true });
  } finally {
    isRefreshingBudgetCommitmentsFromPostgres = false;
  }
};
