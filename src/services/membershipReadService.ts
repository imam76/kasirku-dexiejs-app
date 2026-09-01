import { db } from '@/lib/db';
import {
  membershipPostgresAdapter,
  isPostgresUnavailableError,
  isTauriRuntime,
  type RemoteMembershipDto,
} from '@/services/postgresAdapter';
import { toTimestamp } from '@/services/shared/remoteRefreshCursor';
import { pullStoredUpdatedAtIdPages } from '@/services/shared/syncCursorStore';
import type { Membership, RetailMembershipStatus } from '@/types';
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

let isRefreshingMembershipsFromPostgres = false;

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

  await db.transaction('rw', db.memberships, async () => {
    for (const remoteMembership of remoteMemberships) {
      const localMembership = await db.memberships.get(remoteMembership.id);
      if (!shouldApplyRemoteMembership(localMembership, remoteMembership)) {
        result.skipped += 1;
        continue;
      }

      membershipsToPut.push(mapRemoteMembershipToLocal(remoteMembership, syncedAt));
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
