import { db } from '@/lib/db';
import {
  membershipPointTransactionPostgresAdapter,
  membershipPostgresAdapter,
  isPostgresUnavailableError,
  isTauriRuntime,
  type RemoteMembershipDto,
  type RemoteMembershipPointTransactionDto,
} from '@/services/postgresAdapter';
import { toTimestamp } from '@/services/shared/remoteRefreshCursor';
import { pullStoredUpdatedAtIdPages } from '@/services/shared/syncCursorStore';
import type { Membership, MembershipPointTransaction, RetailMembershipStatus } from '@/types';
import { toCanonicalIsoTimestamp } from '@/utils/timestamps';

export interface MembershipReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

const EMPTY_MEMBERSHIP_READ_SYNC_RESULT: MembershipReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
};

const MEMBERSHIP_REFRESH_LIMIT = 500;
const MEMBERSHIP_REPLAY_WINDOW_MS = 5 * 60 * 1000;

let isRefreshingMembershipsFromPostgres = false;
let isRefreshingMembershipPointTransactionsFromPostgres = false;

const isRetailMembershipStatus = (status?: string | null): status is RetailMembershipStatus => (
  status === 'ACTIVE' || status === 'INACTIVE'
);

const mapRemoteMembershipToLocal = (
  remoteMembership: RemoteMembershipDto,
  syncedAt: string,
): Membership => ({
  id: remoteMembership.id,
  contact_id: remoteMembership.contact_id ?? undefined,
  member_number: remoteMembership.member_number,
  name: remoteMembership.name ?? undefined,
  phone: remoteMembership.phone,
  email: remoteMembership.email ?? undefined,
  status: isRetailMembershipStatus(remoteMembership.status) ? remoteMembership.status : 'ACTIVE',
  joined_at: toCanonicalIsoTimestamp(remoteMembership.joined_at),
  points_balance: Number(remoteMembership.points_balance ?? 0),
  is_active: remoteMembership.deleted_at ? false : remoteMembership.is_active,
  created_at: toCanonicalIsoTimestamp(remoteMembership.created_at),
  updated_at: toCanonicalIsoTimestamp(remoteMembership.updated_at),
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: toCanonicalIsoTimestamp(remoteMembership.updated_at),
});

const hasLocalUnsyncedChanges = (membership: Membership) => (
  membership.sync_status === 'pending' || membership.sync_status === 'failed'
);

const shouldApplyRemoteMembership = (
  localMembership: Membership | undefined,
  remoteMembership: RemoteMembershipDto,
) => {
  if (!localMembership) return true;
  if (hasLocalUnsyncedChanges(localMembership)) return false;

  const localRemoteUpdatedAt = localMembership.remote_updated_at ?? localMembership.updated_at;
  const remoteTimestamp = toTimestamp(remoteMembership.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteMembership.updated_at >= localRemoteUpdatedAt;
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

/**
 * Members whose own point events have not reached PostgreSQL yet. The server balance does
 * not include those events, so adopting it would make points the cashier just granted or
 * spent disappear until the events upload.
 */
const readMembershipIdsWithUnsyncedPoints = async (): Promise<Set<string>> => new Set(
  (await db.membershipPointTransactions.where('sync_status').anyOf(['pending', 'failed']).toArray())
    .map((entry) => entry.membership_id),
);

export const mergeRemoteMembershipsIntoDexie = async (
  remoteMemberships: RemoteMembershipDto[],
  syncedAt = new Date().toISOString(),
): Promise<MembershipReadSyncResult> => {
  const result: MembershipReadSyncResult = {
    ...EMPTY_MEMBERSHIP_READ_SYNC_RESULT,
    fetched: remoteMemberships.length,
  };
  if (remoteMemberships.length === 0) return result;

  const membershipsToPut: Membership[] = [];
  const membershipIdsWithUnsyncedPoints = await readMembershipIdsWithUnsyncedPoints();

  await db.transaction('rw', db.memberships, async () => {
    for (const remoteMembership of remoteMemberships) {
      const localMembership = await db.memberships.get(remoteMembership.id);
      if (!shouldApplyRemoteMembership(localMembership, remoteMembership)) {
        result.skipped += 1;
        continue;
      }

      const mappedMembership = mapRemoteMembershipToLocal(remoteMembership, syncedAt);
      membershipsToPut.push(
        localMembership && membershipIdsWithUnsyncedPoints.has(localMembership.id)
          ? { ...mappedMembership, points_balance: localMembership.points_balance }
          : mappedMembership,
      );
      if (localMembership) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }

    if (membershipsToPut.length > 0) {
      await db.memberships.bulkPut(membershipsToPut);
    }
  });

  return result;
};

const addMembershipReadSyncResult = (
  aggregate: MembershipReadSyncResult,
  next: MembershipReadSyncResult,
) => {
  aggregate.fetched += next.fetched;
  aggregate.inserted += next.inserted;
  aggregate.updated += next.updated;
  aggregate.skipped += next.skipped;
};

export const refreshMembershipsFromPostgres = async (): Promise<MembershipReadSyncResult> => {
  if (isRefreshingMembershipsFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_MEMBERSHIP_READ_SYNC_RESULT };
  }

  isRefreshingMembershipsFromPostgres = true;
  try {
    const aggregate = { ...EMPTY_MEMBERSHIP_READ_SYNC_RESULT };
    await pullStoredUpdatedAtIdPages({
      entity: 'memberships',
      pageSize: MEMBERSHIP_REFRESH_LIMIT,
      // Point events stamp updated_at from the server clock inside their transaction, so a
      // slower commit can land behind a newer checkpoint. Merging is idempotent.
      replayWindowMs: MEMBERSHIP_REPLAY_WINDOW_MS,
      loadPage: (cursor) => membershipPostgresAdapter.list({
        updatedAfter: cursor?.updatedAt,
        cursorId: cursor?.id,
        limit: MEMBERSHIP_REFRESH_LIMIT,
      }),
      mergePage: async (remoteMemberships) => {
        addMembershipReadSyncResult(aggregate, await mergeRemoteMembershipsIntoDexie(remoteMemberships));
      },
      getUpdatedAt: (membership) => membership.updated_at,
      getId: (membership) => membership.id,
    });

    return aggregate;
  } catch (error) {
    if (isPostgresUnavailableError(error)) {
      return { ...EMPTY_MEMBERSHIP_READ_SYNC_RESULT };
    }

    throw error;
  } finally {
    isRefreshingMembershipsFromPostgres = false;
  }
};

const optionalString = (value: string | null | undefined) => value ?? undefined;

const mapRemoteMembershipPointTransactionToLocal = (
  remote: RemoteMembershipPointTransactionDto,
  syncedAt: string,
): MembershipPointTransaction => ({
  id: remote.id,
  membership_id: remote.membership_id,
  membership_number: optionalString(remote.membership_number),
  member_name: remote.member_name,
  transaction_id: optionalString(remote.transaction_id),
  transaction_number: optionalString(remote.transaction_number),
  type: remote.type,
  points_delta: Number(remote.points_delta ?? 0),
  amount_value: Number(remote.amount_value ?? 0),
  balance_after: Number(remote.balance_after ?? 0),
  reason: remote.reason,
  created_by: optionalString(remote.created_by),
  created_by_name: optionalString(remote.created_by_name),
  created_at: toCanonicalIsoTimestamp(remote.created_at),
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
});

/**
 * History only. Unlike stock mutations, a pulled point event is never applied to the local
 * balance: the member row pulled from PostgreSQL already carries the summed balance, and
 * applying both would count the event twice.
 */
export const mergeRemoteMembershipPointTransactionsIntoDexie = async (
  remoteEntries: RemoteMembershipPointTransactionDto[],
  syncedAt = new Date().toISOString(),
) => {
  if (remoteEntries.length === 0) return 0;

  await db.membershipPointTransactions.bulkPut(
    remoteEntries.map((entry) => mapRemoteMembershipPointTransactionToLocal(entry, syncedAt)),
  );
  return remoteEntries.length;
};

export const refreshMembershipPointTransactionsFromPostgres = async () => {
  if (isRefreshingMembershipPointTransactionsFromPostgres || !canReadFromPostgres()) {
    return { fetched: 0 };
  }

  isRefreshingMembershipPointTransactionsFromPostgres = true;
  try {
    let fetched = 0;
    await pullStoredUpdatedAtIdPages({
      entity: 'membershipPointTransactions',
      pageSize: MEMBERSHIP_REFRESH_LIMIT,
      // server_created_at is assigned before the transaction commits (see stock mutations).
      replayWindowMs: MEMBERSHIP_REPLAY_WINDOW_MS,
      loadPage: (cursor) => membershipPointTransactionPostgresAdapter.list({
        serverCreatedAfter: cursor?.updatedAt,
        cursorId: cursor?.id,
        limit: MEMBERSHIP_REFRESH_LIMIT,
      }),
      mergePage: async (remoteEntries) => {
        fetched += await mergeRemoteMembershipPointTransactionsIntoDexie(remoteEntries);
      },
      getUpdatedAt: (entry) => entry.server_created_at ?? entry.created_at,
      getId: (entry) => entry.id,
    });

    return { fetched };
  } catch (error) {
    if (isPostgresUnavailableError(error)) {
      return { fetched: 0 };
    }

    throw error;
  } finally {
    isRefreshingMembershipPointTransactionsFromPostgres = false;
  }
};
