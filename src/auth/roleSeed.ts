import type { AuthUser, Role, RolePermission, UserRole } from '@/types';
import { ROLE_LABEL, ROLE_PERMISSIONS } from './permissions';

export const SYSTEM_ROLE_IDS: Record<UserRole, string> = {
  OWNER: 'system-role-owner',
  ADMIN: 'system-role-admin',
  KASIR: 'system-role-kasir',
  GUDANG: 'system-role-gudang',
};

const SYSTEM_ROLES = Object.keys(SYSTEM_ROLE_IDS) as UserRole[];

export const buildSystemRoles = (now: string): Role[] => SYSTEM_ROLES.map((role) => ({
  id: SYSTEM_ROLE_IDS[role],
  name: ROLE_LABEL[role],
  code: role,
  description: `Role system ${ROLE_LABEL[role]}.`,
  is_system: true,
  is_owner: role === 'OWNER',
  is_active: true,
  created_at: now,
  updated_at: now,
  sync_status: 'pending',
}));

export const buildSystemRolePermissions = (now: string): RolePermission[] => (
  SYSTEM_ROLES.flatMap((role) => ROLE_PERMISSIONS[role].map((permission) => ({
    id: `${SYSTEM_ROLE_IDS[role]}:${permission}`,
    role_id: SYSTEM_ROLE_IDS[role],
    permission_code: permission,
    created_at: now,
    updated_at: now,
    sync_status: 'pending' as const,
  })))
);

export const resolveLegacyRoleId = (role: UserRole | undefined) => (
  role ? SYSTEM_ROLE_IDS[role] : undefined
);

export const resolveLegacyRoleName = (role: UserRole | undefined) => (
  role ? ROLE_LABEL[role] : undefined
);

interface RoleSeedDatabase {
  roles: {
    toArray: () => Promise<Role[]>;
    bulkPut: (items: Role[]) => Promise<unknown>;
  };
  rolePermissions: {
    toArray: () => Promise<RolePermission[]>;
    bulkPut: (items: RolePermission[]) => Promise<unknown>;
  };
  authUsers: {
    toArray: () => Promise<AuthUser[]>;
    bulkPut: (items: AuthUser[]) => Promise<unknown>;
  };
  transaction: (...args: any[]) => Promise<unknown>;
}

export const seedSystemRoles = async (database: RoleSeedDatabase): Promise<void> => {
  const now = new Date().toISOString();
  const existingRoles = await database.roles.toArray();
  const existingRoleIds = new Set(existingRoles.map((role) => role.id));
  const roles = buildSystemRoles(now).filter((role) => !existingRoleIds.has(role.id));

  const existingRolePermissions = await database.rolePermissions.toArray();
  const existingRolePermissionIds = new Set(existingRolePermissions.map((permission) => permission.id));
  const rolePermissions = buildSystemRolePermissions(now)
    .filter((permission) => !existingRolePermissionIds.has(permission.id));

  const authUsers = await database.authUsers.toArray();
  const usersWithRoleLink = authUsers
    .filter((user) => !user.role_id && resolveLegacyRoleId(user.role))
    .map((user): AuthUser => ({
      ...user,
      role_id: resolveLegacyRoleId(user.role),
      role_name: resolveLegacyRoleName(user.role),
      updated_at: user.updated_at,
    }));

  await database.transaction('rw', [database.roles, database.rolePermissions, database.authUsers], async () => {
    if (roles.length > 0) {
      await database.roles.bulkPut(roles);
    }
    if (rolePermissions.length > 0) {
      await database.rolePermissions.bulkPut(rolePermissions);
    }
    if (usersWithRoleLink.length > 0) {
      await database.authUsers.bulkPut(usersWithRoleLink);
    }
  });
};
