import { db } from '@/lib/db';
import {
  activityLogPostgresAdapter,
  authUserPostgresAdapter,
  isTauriRuntime,
  type RemoteActivityLogDto,
  type RemoteAuthUserDto,
} from '@/services/postgresAdapter';
import type { ActivityLog, AuthUser, UserRole } from '@/types';

export interface AuthUserReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

export interface ActivityLogReadSyncResult {
  fetched: number;
  inserted: number;
  skipped: number;
}

const EMPTY_AUTH_USER_READ_SYNC_RESULT: AuthUserReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
};

const EMPTY_ACTIVITY_LOG_READ_SYNC_RESULT: ActivityLogReadSyncResult = {
  fetched: 0,
  inserted: 0,
  skipped: 0,
};

const VALID_ROLES: UserRole[] = ['OWNER', 'ADMIN', 'KASIR', 'GUDANG'];

let isRefreshingAuthUsersFromPostgres = false;
let isRefreshingActivityLogsFromPostgres = false;

const isUserRole = (role: string): role is UserRole => (
  VALID_ROLES.includes(role as UserRole)
);

const mapRemoteAuthUserToLocal = (
  remoteUser: RemoteAuthUserDto,
  syncedAt: string,
): AuthUser => ({
  id: remoteUser.id,
  name: remoteUser.name,
  role: isUserRole(remoteUser.role) ? remoteUser.role : 'KASIR',
  role_id: remoteUser.role_id ?? undefined,
  role_name: remoteUser.role_name ?? undefined,
  employee_id: remoteUser.employee_id ?? undefined,
  pin_hash: remoteUser.pin_hash,
  pin_salt: remoteUser.pin_salt,
  is_active: remoteUser.deleted_at ? false : remoteUser.is_active,
  created_at: remoteUser.created_at,
  updated_at: remoteUser.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteUser.updated_at,
});

const mapRemoteActivityLogToLocal = (remoteLog: RemoteActivityLogDto): ActivityLog => ({
  id: remoteLog.id,
  user_id: remoteLog.user_id ?? undefined,
  user_name: remoteLog.user_name ?? undefined,
  role: remoteLog.role && isUserRole(remoteLog.role) ? remoteLog.role : undefined,
  action: remoteLog.action,
  entity: remoteLog.entity,
  entity_id: remoteLog.entity_id ?? undefined,
  description: remoteLog.description,
  created_at: remoteLog.created_at,
});

const hasLocalUnsyncedChanges = (user: AuthUser) => (
  user.sync_status === 'pending' || user.sync_status === 'failed'
);

const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const shouldApplyRemoteAuthUser = (
  localUser: AuthUser | undefined,
  remoteUser: RemoteAuthUserDto,
) => {
  if (!localUser) return true;
  if (hasLocalUnsyncedChanges(localUser)) return false;

  const localRemoteUpdatedAt = localUser.remote_updated_at ?? localUser.updated_at;
  const remoteTimestamp = toTimestamp(remoteUser.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteUser.updated_at >= localRemoteUpdatedAt;
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

export const mergeRemoteAuthUsersIntoDexie = async (
  remoteUsers: RemoteAuthUserDto[],
  syncedAt = new Date().toISOString(),
): Promise<AuthUserReadSyncResult> => {
  const result: AuthUserReadSyncResult = {
    ...EMPTY_AUTH_USER_READ_SYNC_RESULT,
    fetched: remoteUsers.length,
  };
  if (remoteUsers.length === 0) return result;

  const usersToPut: AuthUser[] = [];

  await db.transaction('rw', db.authUsers, async () => {
    for (const remoteUser of remoteUsers) {
      const localUser = await db.authUsers.get(remoteUser.id);
      if (!shouldApplyRemoteAuthUser(localUser, remoteUser)) {
        result.skipped += 1;
        continue;
      }

      usersToPut.push(mapRemoteAuthUserToLocal(remoteUser, syncedAt));
      if (localUser) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }

    if (usersToPut.length > 0) {
      await db.authUsers.bulkPut(usersToPut);
    }
  });

  return result;
};

export const refreshAuthUsersFromPostgres = async (): Promise<AuthUserReadSyncResult> => {
  if (isRefreshingAuthUsersFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_AUTH_USER_READ_SYNC_RESULT };
  }

  isRefreshingAuthUsersFromPostgres = true;
  try {
    const remoteUsers = await authUserPostgresAdapter.list();
    return mergeRemoteAuthUsersIntoDexie(remoteUsers);
  } finally {
    isRefreshingAuthUsersFromPostgres = false;
  }
};

export const mergeRemoteActivityLogsIntoDexie = async (
  remoteLogs: RemoteActivityLogDto[],
): Promise<ActivityLogReadSyncResult> => {
  const result: ActivityLogReadSyncResult = {
    ...EMPTY_ACTIVITY_LOG_READ_SYNC_RESULT,
    fetched: remoteLogs.length,
  };
  if (remoteLogs.length === 0) return result;

  const logsToAdd: ActivityLog[] = [];

  await db.transaction('rw', db.activityLogs, async () => {
    for (const remoteLog of remoteLogs) {
      const existingLog = await db.activityLogs.get(remoteLog.id);
      if (existingLog) {
        result.skipped += 1;
        continue;
      }

      logsToAdd.push(mapRemoteActivityLogToLocal(remoteLog));
      result.inserted += 1;
    }

    if (logsToAdd.length > 0) {
      await db.activityLogs.bulkAdd(logsToAdd);
    }
  });

  return result;
};

export const refreshActivityLogsFromPostgres = async (
  limit = 200,
): Promise<ActivityLogReadSyncResult> => {
  if (isRefreshingActivityLogsFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_ACTIVITY_LOG_READ_SYNC_RESULT };
  }

  isRefreshingActivityLogsFromPostgres = true;
  try {
    const remoteLogs = await activityLogPostgresAdapter.list(limit);
    return mergeRemoteActivityLogsIntoDexie(remoteLogs);
  } finally {
    isRefreshingActivityLogsFromPostgres = false;
  }
};
