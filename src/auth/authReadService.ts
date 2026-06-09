import { db } from '@/lib/db';
import {
  activityLogPostgresAdapter,
  authUserPostgresAdapter,
  isTauriRuntime,
  rolePermissionPostgresAdapter,
  rolePostgresAdapter,
  type RemoteActivityLogDto,
  type RemoteAuthUserDto,
  type RemoteRoleDto,
  type RemoteRolePermissionDto,
} from '@/services/postgresAdapter';
import type { ActivityLog, AuthUser, Permission, Role, RolePermission, UserRole } from '@/types';

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

export interface RoleReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
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

const EMPTY_ROLE_READ_SYNC_RESULT: RoleReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
};

const VALID_ROLES: UserRole[] = ['OWNER', 'ADMIN', 'KASIR', 'GUDANG'];

let isRefreshingAuthUsersFromPostgres = false;
let isRefreshingActivityLogsFromPostgres = false;
let isRefreshingRolesFromPostgres = false;

const isUserRole = (role: string): role is UserRole => (
  VALID_ROLES.includes(role as UserRole)
);

const normalizeRemoteEmail = (email: string | null | undefined) => (
  email?.trim().toLowerCase() || undefined
);

const mapRemoteAuthUserToLocal = (
  remoteUser: RemoteAuthUserDto,
  syncedAt: string,
  localUser?: AuthUser,
): AuthUser => ({
  id: remoteUser.id,
  name: remoteUser.name,
  email: normalizeRemoteEmail(remoteUser.email) ?? normalizeRemoteEmail(localUser?.email),
  role: isUserRole(remoteUser.role) ? remoteUser.role : 'KASIR',
  role_id: remoteUser.role_id ?? undefined,
  role_name: remoteUser.role_name ?? undefined,
  employee_id: remoteUser.employee_id ?? undefined,
  pin_hash: remoteUser.pin_hash,
  pin_salt: remoteUser.pin_salt,
  is_active: remoteUser.deleted_at ? false : remoteUser.is_active,
  created_at: remoteUser.created_at,
  updated_at: remoteUser.updated_at,
  sync_status: remoteUser.email || !localUser?.email ? 'synced' : 'pending',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteUser.updated_at,
});

const mapRemoteRoleToLocal = (
  remoteRole: RemoteRoleDto,
  syncedAt: string,
): Role => ({
  id: remoteRole.id,
  name: remoteRole.name,
  code: remoteRole.code ?? undefined,
  description: remoteRole.description ?? undefined,
  is_system: remoteRole.is_system,
  is_owner: remoteRole.is_owner,
  is_active: remoteRole.deleted_at ? false : remoteRole.is_active,
  created_at: remoteRole.created_at,
  updated_at: remoteRole.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteRole.updated_at,
});

const mapRemoteRolePermissionToLocal = (
  remotePermission: RemoteRolePermissionDto,
  syncedAt: string,
): RolePermission => ({
  id: remotePermission.id,
  role_id: remotePermission.role_id,
  permission_code: remotePermission.permission_code as Permission,
  created_at: remotePermission.created_at,
  updated_at: remotePermission.updated_at,
  sync_status: remotePermission.deleted_at ? 'synced' : 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remotePermission.updated_at,
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

const hasLocalUnsyncedRoleChanges = (role: Role | RolePermission) => (
  role.sync_status === 'pending' || role.sync_status === 'failed'
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

const shouldApplyRemoteRole = (
  localRole: Role | undefined,
  remoteRole: RemoteRoleDto,
) => {
  if (!localRole) return true;
  if (hasLocalUnsyncedRoleChanges(localRole)) return false;

  const localRemoteUpdatedAt = localRole.remote_updated_at ?? localRole.updated_at;
  const remoteTimestamp = toTimestamp(remoteRole.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteRole.updated_at >= localRemoteUpdatedAt;
};

const shouldApplyRemoteRolePermission = (
  localPermission: RolePermission | undefined,
  remotePermission: RemoteRolePermissionDto,
) => {
  if (!localPermission) return true;
  if (hasLocalUnsyncedRoleChanges(localPermission)) return false;

  const localRemoteUpdatedAt = localPermission.remote_updated_at ?? localPermission.updated_at;
  const remoteTimestamp = toTimestamp(remotePermission.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remotePermission.updated_at >= localRemoteUpdatedAt;
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

      usersToPut.push(mapRemoteAuthUserToLocal(remoteUser, syncedAt, localUser));
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

export const mergeRemoteRolesIntoDexie = async (
  remoteRoles: RemoteRoleDto[],
  syncedAt = new Date().toISOString(),
): Promise<RoleReadSyncResult> => {
  const result: RoleReadSyncResult = {
    ...EMPTY_ROLE_READ_SYNC_RESULT,
    fetched: remoteRoles.length,
  };
  if (remoteRoles.length === 0) return result;

  const rolesToPut: Role[] = [];

  await db.transaction('rw', db.roles, async () => {
    for (const remoteRole of remoteRoles) {
      const localRole = await db.roles.get(remoteRole.id);
      if (!shouldApplyRemoteRole(localRole, remoteRole)) {
        result.skipped += 1;
        continue;
      }

      rolesToPut.push(mapRemoteRoleToLocal(remoteRole, syncedAt));
      if (localRole) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }

    if (rolesToPut.length > 0) {
      await db.roles.bulkPut(rolesToPut);
    }
  });

  return result;
};

export const mergeRemoteRolePermissionsIntoDexie = async (
  remotePermissions: RemoteRolePermissionDto[],
  syncedAt = new Date().toISOString(),
): Promise<RoleReadSyncResult> => {
  const result: RoleReadSyncResult = {
    ...EMPTY_ROLE_READ_SYNC_RESULT,
    fetched: remotePermissions.length,
  };
  if (remotePermissions.length === 0) return result;

  const permissionsToPut: RolePermission[] = [];
  const permissionIdsToDelete: string[] = [];

  await db.transaction('rw', [db.roles, db.rolePermissions], async () => {
    for (const remotePermission of remotePermissions) {
      const localPermission = await db.rolePermissions.get(remotePermission.id);
      if (!shouldApplyRemoteRolePermission(localPermission, remotePermission)) {
        result.skipped += 1;
        continue;
      }

      if (remotePermission.deleted_at) {
        permissionIdsToDelete.push(remotePermission.id);
        if (localPermission) {
          result.updated += 1;
        } else {
          result.skipped += 1;
        }
        continue;
      }

      const role = await db.roles.get(remotePermission.role_id);
      if (!role) {
        result.skipped += 1;
        continue;
      }

      permissionsToPut.push(mapRemoteRolePermissionToLocal(remotePermission, syncedAt));
      if (localPermission) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }

    if (permissionIdsToDelete.length > 0) {
      await db.rolePermissions.bulkDelete(permissionIdsToDelete);
    }
    if (permissionsToPut.length > 0) {
      await db.rolePermissions.bulkPut(permissionsToPut);
    }
  });

  return result;
};

export const refreshRolesFromPostgres = async (): Promise<{
  roles: RoleReadSyncResult;
  permissions: RoleReadSyncResult;
}> => {
  if (isRefreshingRolesFromPostgres || !canReadFromPostgres()) {
    return {
      roles: { ...EMPTY_ROLE_READ_SYNC_RESULT },
      permissions: { ...EMPTY_ROLE_READ_SYNC_RESULT },
    };
  }

  isRefreshingRolesFromPostgres = true;
  try {
    const syncedAt = new Date().toISOString();
    const remoteRoles = await rolePostgresAdapter.list();
    const roles = await mergeRemoteRolesIntoDexie(remoteRoles, syncedAt);
    const remotePermissions = await rolePermissionPostgresAdapter.list();
    const permissions = await mergeRemoteRolePermissionsIntoDexie(remotePermissions, syncedAt);
    return { roles, permissions };
  } finally {
    isRefreshingRolesFromPostgres = false;
  }
};

export const refreshAuthUsersFromPostgres = async (): Promise<AuthUserReadSyncResult> => {
  if (isRefreshingAuthUsersFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_AUTH_USER_READ_SYNC_RESULT };
  }

  isRefreshingAuthUsersFromPostgres = true;
  try {
    await refreshRolesFromPostgres();
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
