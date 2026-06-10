import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { getEnabledPermissionCatalog, PERMISSION_CATALOG } from '@/auth/permissionCatalog';
import { ROLE_LABEL } from '@/auth/permissions';
import { resolveLegacyRoleId } from '@/auth/roleSeed';
import { db } from '@/lib/db';
import { canBypassSetupModuleLockForUser } from '@/services/setupKeyService';
import {
  enqueueRolePermissionDeleteSync,
  enqueueRolePermissionSync,
  enqueueRoleSync,
} from '@/services/syncQueueService';
import type { Permission, Role, RolePermission } from '@/types';

export interface RoleWithPermissions extends Role {
  permissions: Permission[];
}

export interface RoleFormInput {
  name: string;
  description?: string;
}

const normalizeName = (name: string) => name.trim();

const requireRoleActor = async () => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'USER_MANAGE');
  if (!currentUser) {
    throw new Error('Session user tidak ditemukan.');
  }
  return currentUser;
};

const assertValidRoleName = async (name: string, excludeRoleId?: string) => {
  if (name.length < 2) {
    throw new Error('Nama role minimal 2 karakter.');
  }

  const lowerName = name.toLowerCase();
  const duplicate = await db.roles
    .where('name')
    .equalsIgnoreCase(name)
    .and((role) => role.id !== excludeRoleId && role.is_active && role.name.toLowerCase() === lowerName)
    .first();

  if (duplicate) {
    throw new Error('Nama role sudah digunakan.');
  }
};

const getAllowedPermissionSet = (options: { bypassSetupModuleLock?: boolean } = {}) => (
  new Set(getEnabledPermissionCatalog(options).map((item) => item.code))
);

const sanitizePermissions = (
  permissions: Permission[],
  options: { bypassSetupModuleLock?: boolean } = {},
) => {
  const catalogCodes = new Set(PERMISSION_CATALOG.map((item) => item.code));
  const allowedPermissions = getAllowedPermissionSet(options);
  const uniquePermissions = Array.from(new Set(permissions));
  const invalidPermission = uniquePermissions.find((permission) => !catalogCodes.has(permission));
  if (invalidPermission) {
    throw new Error(`Permission ${invalidPermission} tidak ada di catalog.`);
  }

  const disabledPermission = uniquePermissions.find((permission) => !allowedPermissions.has(permission));
  if (disabledPermission) {
    throw new Error(`Permission ${disabledPermission} tidak aktif dari setup module.`);
  }

  return uniquePermissions;
};

export const listRolesWithPermissionCounts = async () => {
  const [roles, rolePermissions] = await Promise.all([
    db.roles.orderBy('name').toArray(),
    db.rolePermissions.toArray(),
  ]);
  const counts = rolePermissions.reduce<Record<string, number>>((acc, permission) => {
    acc[permission.role_id] = (acc[permission.role_id] ?? 0) + 1;
    return acc;
  }, {});

  return roles.map((role) => ({
    ...role,
    permission_count: counts[role.id] ?? 0,
  }));
};

export const getRoleWithPermissions = async (roleId: string): Promise<RoleWithPermissions> => {
  const role = await db.roles.get(roleId);
  if (!role) {
    throw new Error('Role tidak ditemukan.');
  }

  const rolePermissions = await db.rolePermissions
    .where('role_id')
    .equals(roleId)
    .toArray();

  return {
    ...role,
    permissions: rolePermissions.map((permission) => permission.permission_code),
  };
};

export const createRole = async (input: RoleFormInput): Promise<Role> => {
  const actor = await requireRoleActor();
  const name = normalizeName(input.name);
  await assertValidRoleName(name);

  const now = new Date().toISOString();
  const role: Role = {
    id: crypto.randomUUID(),
    name,
    description: input.description?.trim() || undefined,
    is_system: false,
    is_owner: false,
    is_active: true,
    created_at: now,
    updated_at: now,
    sync_status: 'pending',
  };

  await db.roles.add(role);
  await enqueueRoleSync(role, 'create');
  await writeActivityLog({
    user: actor,
    action: 'ROLE_CREATED',
    entity: 'roles',
    entity_id: role.id,
    description: `${actor.name} membuat role ${role.name}.`,
  });

  return role;
};

export const updateRole = async (roleId: string, input: RoleFormInput): Promise<Role> => {
  const actor = await requireRoleActor();
  const role = await db.roles.get(roleId);
  if (!role) {
    throw new Error('Role tidak ditemukan.');
  }
  if (role.is_owner) {
    throw new Error('Role Owner system tidak bisa diubah dari UI.');
  }

  const name = normalizeName(input.name);
  await assertValidRoleName(name, roleId);
  const updatedAt = new Date().toISOString();

  await db.roles.update(roleId, {
    name,
    description: input.description?.trim() || undefined,
    updated_at: updatedAt,
    sync_status: 'pending',
    sync_error: undefined,
  });

  const updatedRole = await db.roles.get(roleId);
  if (!updatedRole) {
    throw new Error('Role tidak ditemukan setelah diperbarui.');
  }

  await writeActivityLog({
    user: actor,
    action: 'ROLE_UPDATED',
    entity: 'roles',
    entity_id: roleId,
    description: `${actor.name} memperbarui role ${role.name}.`,
  });
  await enqueueRoleSync(updatedRole, 'update');

  return updatedRole;
};

export const setRoleActive = async (roleId: string, isActive: boolean): Promise<Role> => {
  const actor = await requireRoleActor();
  const role = await db.roles.get(roleId);
  if (!role) {
    throw new Error('Role tidak ditemukan.');
  }
  if (role.is_system) {
    throw new Error('Role system tidak bisa dinonaktifkan.');
  }

  if (!isActive) {
    const activeUserCount = await db.authUsers
      .where('role_id')
      .equals(roleId)
      .and((user) => user.is_active)
      .count();
    if (activeUserCount > 0) {
      throw new Error('Role masih dipakai user aktif.');
    }
  }

  const updatedAt = new Date().toISOString();
  await db.roles.update(roleId, {
    is_active: isActive,
    updated_at: updatedAt,
    sync_status: 'pending',
    sync_error: undefined,
  });

  const updatedRole = await db.roles.get(roleId);
  if (!updatedRole) {
    throw new Error('Role tidak ditemukan setelah status diperbarui.');
  }

  await writeActivityLog({
    user: actor,
    action: isActive ? 'ROLE_ENABLED' : 'ROLE_DISABLED',
    entity: 'roles',
    entity_id: roleId,
    description: `${actor.name} ${isActive ? 'mengaktifkan' : 'menonaktifkan'} role ${role.name}.`,
  });
  await enqueueRoleSync(updatedRole, 'update');

  return updatedRole;
};

export const updateRolePermissions = async (
  roleId: string,
  permissions: Permission[],
): Promise<void> => {
  const actor = await requireRoleActor();
  const role = await db.roles.get(roleId);
  if (!role) {
    throw new Error('Role tidak ditemukan.');
  }
  if (role.is_owner) {
    throw new Error('Permission Owner system tidak bisa diubah dari UI.');
  }

  const actorRole = actor.role_id ? await db.roles.get(actor.role_id) : undefined;
  const sanitizedPermissions = sanitizePermissions(permissions, {
    bypassSetupModuleLock: canBypassSetupModuleLockForUser(actor, actorRole),
  });
  const now = new Date().toISOString();
  const existingPermissions = await db.rolePermissions
    .where('role_id')
    .equals(roleId)
    .toArray();
  const nextPermissionIds = new Set(sanitizedPermissions.map((permission) => `${roleId}:${permission}`));
  const deletedPermissions = existingPermissions.filter((permission) => !nextPermissionIds.has(permission.id));
  const records: RolePermission[] = sanitizedPermissions.map((permission) => ({
    id: `${roleId}:${permission}`,
    role_id: roleId,
    permission_code: permission,
    created_at: now,
    updated_at: now,
    sync_status: 'pending',
  }));

  await db.transaction('rw', [db.rolePermissions, db.roles], async () => {
    await db.rolePermissions.where('role_id').equals(roleId).delete();
    if (records.length > 0) {
      await db.rolePermissions.bulkPut(records);
    }
    await db.roles.update(roleId, {
      updated_at: now,
      sync_status: 'pending',
      sync_error: undefined,
    });
  });

  await Promise.all([
    ...records.map((record) => enqueueRolePermissionSync(record, 'update')),
    ...deletedPermissions.map((permission) => enqueueRolePermissionDeleteSync(permission, now)),
  ]);
  const updatedRole = await db.roles.get(roleId);
  if (updatedRole) {
    await enqueueRoleSync(updatedRole, 'update');
  }

  await writeActivityLog({
    user: actor,
    action: 'ROLE_PERMISSION_UPDATED',
    entity: 'roles',
    entity_id: roleId,
    description: `${actor.name} memperbarui permission role ${role.name}.`,
  });
};

export const getActiveRoleOptions = async () => {
  const roles = await db.roles
    .filter((role) => role.is_active)
    .toArray();

  return roles
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((role) => ({
      value: role.id,
      label: role.name,
      legacyRole: role.code && role.code in ROLE_LABEL ? role.code : undefined,
    }));
};

export const getFallbackRoleId = (legacyRole = 'KASIR') => resolveLegacyRoleId(legacyRole as keyof typeof ROLE_LABEL);
