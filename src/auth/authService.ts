import { db } from '@/lib/db';
import type { ActivityLog, AuthUser, Employee, Permission, Role, RolePermission, UserRole } from '@/types';
import { hasPermission } from './permissions';
import { refreshAuthUsersFromPostgres, refreshRolesFromPostgres } from './authReadService';
import {
  enqueueActivityLogSync,
  enqueueAuthUserSync,
  enqueuePendingRolePermissionsForSync,
  enqueuePendingRolesForSync,
} from '@/services/syncQueueService';
import {
  authUserPostgresAdapter,
  postgresAdapter,
  rolePermissionPostgresAdapter,
  rolePostgresAdapter,
  serverAuthSessionPostgresAdapter,
  type RemoteAuthUserDto,
  type RemoteRoleDto,
  type RemoteRolePermissionDto,
  type RemoteServerAuthSessionDto,
} from '@/services/postgresAdapter';
import { isPermissionEnabledBySetup } from './permissionCatalog';
import { resolveLegacyRoleId, resolveLegacyRoleName, seedSystemRoles } from './roleSeed';
import { canBypassSetupModuleLockForUser } from '@/services/setupKeyService';
import { refreshEmployeesFromPostgres } from '@/services/employeeReadService';

const SESSION_STORAGE_KEY = 'frayukti-auth-session-id';
const PIN_HASH_ALGORITHM = 'SHA-256';

interface ActivityLogInput {
  action: string;
  entity: string;
  entity_id?: string;
  description: string;
  user?: AuthUser | null;
}

interface CreateAuthUserInput {
  name: string;
  email?: string;
  role?: UserRole;
  role_id?: string;
  pin: string;
  employee_id?: string;
}

interface UpdateAuthUserInput {
  userId: string;
  name: string;
  email?: string;
  role?: UserRole;
  role_id?: string;
  employee_id?: string;
}

interface ResetAuthUserPinInput {
  userId: string;
  pin: string;
}

interface ActivityLogQueryInput {
  limit?: number;
}

interface CurrentSessionUserOptions {
  touchSession?: boolean;
  cleanupInvalidSession?: boolean;
}

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const getActiveSessionId = () => localStorage.getItem(SESSION_STORAGE_KEY);
const setActiveSessionId = (sessionId: string) => localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
const clearActiveSessionId = () => localStorage.removeItem(SESSION_STORAGE_KEY);

export const clearAuthSessionState = async (): Promise<void> => {
  await db.authSessions.clear();
  clearActiveSessionId();
};

export const createPinHash = async (pin: string): Promise<{ hash: string; salt: string }> => {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = bytesToHex(saltBytes);
  const encoded = new TextEncoder().encode(`${salt}:${pin}`);
  const hashBuffer = await crypto.subtle.digest(PIN_HASH_ALGORITHM, encoded);

  return {
    hash: bytesToHex(new Uint8Array(hashBuffer)),
    salt,
  };
};

export const verifyPin = async (pin: string, hash: string, salt: string): Promise<boolean> => {
  const encoded = new TextEncoder().encode(`${salt}:${pin}`);
  const hashBuffer = await crypto.subtle.digest(PIN_HASH_ALGORITHM, encoded);
  const nextHash = bytesToHex(new Uint8Array(hashBuffer));

  return nextHash === hash;
};

const normalizeName = (name: string) => name.trim();

export const normalizeAuthEmail = (email: string | undefined) => (
  email?.trim().toLowerCase() || undefined
);

const withPendingAuthUserSync = (user: AuthUser): AuthUser => ({
  ...user,
  sync_status: 'pending',
  sync_error: undefined,
});

const mapAuthUserToRemoteDto = (user: AuthUser): RemoteAuthUserDto => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  role_id: user.role_id,
  role_name: user.role_name,
  employee_id: user.employee_id,
  pin_hash: user.pin_hash,
  pin_salt: user.pin_salt,
  is_active: user.is_active,
  created_at: user.created_at,
  updated_at: user.updated_at,
});

const mapRoleToRemoteDto = (role: Role): RemoteRoleDto => ({
  id: role.id,
  name: role.name,
  code: role.code,
  description: role.description,
  is_system: role.is_system,
  is_owner: role.is_owner,
  is_active: role.is_active,
  created_at: role.created_at,
  updated_at: role.updated_at,
});

const mapRolePermissionToRemoteDto = (permission: RolePermission): RemoteRolePermissionDto => ({
  id: permission.id,
  role_id: permission.role_id,
  permission_code: permission.permission_code,
  created_at: permission.created_at,
  updated_at: permission.updated_at,
});

const syncOwnerBootstrapToPostgres = async (owner: AuthUser): Promise<void> => {
  const postgresHealth = await postgresAdapter.healthCheck();
  if (!postgresHealth.available) return;

  const syncedAt = new Date().toISOString();
  const roles = await db.roles.toArray();
  const rolePermissions = await db.rolePermissions.toArray();

  try {
    for (const role of roles) {
      const remoteRole = await rolePostgresAdapter.upsert(mapRoleToRemoteDto(role));
      if (remoteRole && role.updated_at === remoteRole.updated_at) {
        await db.roles.update(role.id, {
          sync_status: 'synced',
          sync_error: undefined,
          last_synced_at: syncedAt,
          remote_updated_at: remoteRole.updated_at,
        });
      }
    }

    for (const permission of rolePermissions) {
      const remotePermission = await rolePermissionPostgresAdapter.upsert(mapRolePermissionToRemoteDto(permission));
      if (remotePermission && permission.updated_at === remotePermission.updated_at) {
        await db.rolePermissions.update(permission.id, {
          sync_status: 'synced',
          sync_error: undefined,
          last_synced_at: syncedAt,
          remote_updated_at: remotePermission.updated_at,
        });
      }
    }

    const remoteOwner = await authUserPostgresAdapter.upsert(mapAuthUserToRemoteDto(owner));
    if (remoteOwner && owner.updated_at === remoteOwner.updated_at) {
      await db.authUsers.update(owner.id, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteOwner.updated_at,
      });
    }
  } catch (error) {
    console.error('Failed to sync owner bootstrap to PostgreSQL', error);
  }
};

const assertValidName = (name: string) => {
  if (normalizeName(name).length < 2) {
    throw new Error('Nama user minimal 2 karakter.');
  }
};

const assertValidPin = (pin: string) => {
  if (!/^\d{4,}$/.test(pin)) {
    throw new Error('PIN harus berupa angka minimal 4 digit.');
  }
};

const assertPinAvailable = async (pin: string, excludeUserId?: string) => {
  const users = await db.authUsers.toArray();

  for (const user of users) {
    if (user.id === excludeUserId) continue;
    if (await verifyPin(pin, user.pin_hash, user.pin_salt)) {
      throw new Error('PIN sudah digunakan user lain.');
    }
  }

  const employees = await db.employees.toArray();
  for (const employee of employees) {
    if (employee.id === excludeUserId) continue;
    if (employee.pin_hash && employee.pin_salt && await verifyPin(pin, employee.pin_hash, employee.pin_salt)) {
      throw new Error('PIN sudah digunakan karyawan lain.');
    }
  }
};

const getRoleForAuthInput = async (input: { role?: UserRole; role_id?: string }) => {
  const roleId = input.role_id ?? resolveLegacyRoleId(input.role);
  const role = roleId ? await db.roles.get(roleId) : undefined;

  if (!role || !role.is_active) {
    throw new Error('Role tidak ditemukan atau sudah nonaktif.');
  }

  return role;
};

const countOtherActiveOwners = async (userId: string) => {
  return db.authUsers
    .where('role')
    .equals('OWNER')
    .and((user) => user.is_active && user.id !== userId)
    .count();
};

const assertAnotherActiveOwnerExists = async (userId: string) => {
  const otherActiveOwnerCount = await countOtherActiveOwners(userId);
  if (otherActiveOwnerCount < 1) {
    throw new Error('Minimal harus ada satu Owner aktif.');
  }
};

const requireUserManageAccess = async () => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'USER_MANAGE');

  if (!currentUser) {
    throw new Error('Session user tidak ditemukan.');
  }

  return currentUser;
};

const requireActivityLogAccess = async () => {
  const currentUser = await getCurrentSessionUser({
    touchSession: false,
    cleanupInvalidSession: false,
  });
  await requireUserPermission(currentUser, 'ACTIVITY_LOG_VIEW');

  if (!currentUser) {
    throw new Error('Session user tidak ditemukan.');
  }

  return currentUser;
};

export const ensureDefaultOwner = async (): Promise<void> => {
  await seedSystemRoles(db);

  try {
    await refreshRolesFromPostgres();
    await refreshAuthUsersFromPostgres();
  } catch (error) {
    console.error('Failed to refresh auth data from PostgreSQL', error);
  }

  const activeOwner = await db.authUsers
    .where('role')
    .equals('OWNER')
    .and((user) => user.is_active)
    .first();

  if (!activeOwner) {
    clearActiveSessionId();
  }
};

const findLocalActiveOwner = async () => (
  db.authUsers
    .where('role')
    .equals('OWNER')
    .and((user) => user.is_active)
    .first()
);

export const hasActiveOwner = async () => {
  let owner = await findLocalActiveOwner();

  if (!owner) {
    try {
      await refreshAuthUsersFromPostgres();
    } catch (error) {
      console.error('Failed to refresh auth users before owner check', error);
    }
    owner = await findLocalActiveOwner();
  }

  return Boolean(owner);
};

export const createOwnerUser = async (input: { id?: string; name: string; email: string; pin: string }): Promise<AuthUser> => {
  await seedSystemRoles(db);

  const hasOwner = await hasActiveOwner();
  if (hasOwner) {
    throw new Error('Owner aktif sudah ada.');
  }

  const name = normalizeName(input.name);
  assertValidName(name);
  assertValidPin(input.pin);
  await assertPinAvailable(input.pin);

  const now = new Date().toISOString();
  const { hash, salt } = await createPinHash(input.pin);
  const owner: AuthUser = withPendingAuthUserSync({
    id: input.id ?? crypto.randomUUID(),
    name,
    email: normalizeAuthEmail(input.email),
    role: 'OWNER',
    role_id: resolveLegacyRoleId('OWNER'),
    role_name: resolveLegacyRoleName('OWNER'),
    pin_hash: hash,
    pin_salt: salt,
    is_active: true,
    created_at: now,
    updated_at: now,
  });

  await db.authUsers.add(owner);
  await enqueuePendingRolesForSync();
  await enqueuePendingRolePermissionsForSync();
  await enqueueAuthUserSync(owner, 'create');
  await syncOwnerBootstrapToPostgres(owner);
  await writeActivityLog({
    user: owner,
    action: 'AUTH_OWNER_CREATED',
    entity: 'authUsers',
    entity_id: owner.id,
    description: `${owner.name} membuat user Owner pertama.`,
  });

  return owner;
};

export const createAuthUser = async (input: CreateAuthUserInput): Promise<AuthUser> => {
  const actor = await requireUserManageAccess();
  const name = normalizeName(input.name);

  assertValidName(name);
  assertValidPin(input.pin);
  await assertPinAvailable(input.pin);

  const now = new Date().toISOString();
  const { hash, salt } = await createPinHash(input.pin);
  const role = await getRoleForAuthInput(input);
  const user: AuthUser = withPendingAuthUserSync({
    id: crypto.randomUUID(),
    name,
    email: normalizeAuthEmail(input.email),
    role: (role.code as UserRole | undefined) ?? input.role ?? 'KASIR',
    role_id: role.id,
    role_name: role.name,
    employee_id: input.employee_id,
    pin_hash: hash,
    pin_salt: salt,
    is_active: true,
    created_at: now,
    updated_at: now,
  });

  await db.authUsers.add(user);
  await enqueueAuthUserSync(user, 'create');
  await writeActivityLog({
    user: actor,
    action: 'AUTH_USER_CREATED',
    entity: 'authUsers',
    entity_id: user.id,
    description: `${actor.name} membuat user ${user.name} dengan role ${user.role_name ?? user.role}.`,
  });

  return user;
};

export const updateAuthUser = async (input: UpdateAuthUserInput): Promise<AuthUser> => {
  const actor = await requireUserManageAccess();
  const targetUser = await db.authUsers.get(input.userId);

  if (!targetUser) {
    throw new Error('User tidak ditemukan.');
  }

  const name = normalizeName(input.name);
  assertValidName(name);

  const role = await getRoleForAuthInput(input);
  const nextLegacyRole = (role.code as UserRole | undefined) ?? input.role ?? targetUser.role;

  if (targetUser.is_active && targetUser.role === 'OWNER' && nextLegacyRole !== 'OWNER') {
    await assertAnotherActiveOwnerExists(targetUser.id);
  }

  const updatedAt = new Date().toISOString();
  await db.authUsers.update(targetUser.id, {
    name,
    email: normalizeAuthEmail(input.email),
    role: nextLegacyRole,
    role_id: role.id,
    role_name: role.name,
    employee_id: input.employee_id,
    updated_at: updatedAt,
    sync_status: 'pending',
    sync_error: undefined,
  });

  const updatedUser = await db.authUsers.get(targetUser.id);
  if (!updatedUser) {
    throw new Error('User tidak ditemukan setelah diperbarui.');
  }

  await enqueueAuthUserSync(updatedUser, 'update');
  await writeActivityLog({
    user: actor,
    action: 'AUTH_USER_UPDATED',
    entity: 'authUsers',
    entity_id: targetUser.id,
    description: `${actor.name} memperbarui user ${targetUser.name}.`,
  });

  return updatedUser;
};

export const resetAuthUserPin = async (input: ResetAuthUserPinInput): Promise<void> => {
  const actor = await requireUserManageAccess();
  const targetUser = await db.authUsers.get(input.userId);

  if (!targetUser) {
    throw new Error('User tidak ditemukan.');
  }

  assertValidPin(input.pin);
  await assertPinAvailable(input.pin, targetUser.id);

  const { hash, salt } = await createPinHash(input.pin);
  const updatedAt = new Date().toISOString();
  await db.authUsers.update(targetUser.id, {
    pin_hash: hash,
    pin_salt: salt,
    updated_at: updatedAt,
    sync_status: 'pending',
    sync_error: undefined,
  });

  const updatedUser = await db.authUsers.get(targetUser.id);
  if (!updatedUser) {
    throw new Error('User tidak ditemukan setelah PIN diperbarui.');
  }

  await enqueueAuthUserSync(updatedUser, 'update');
  await writeActivityLog({
    user: actor,
    action: 'AUTH_USER_PIN_RESET',
    entity: 'authUsers',
    entity_id: targetUser.id,
    description: `${actor.name} mereset PIN user ${targetUser.name}.`,
  });
};

export const setAuthUserActive = async (userId: string, isActive: boolean): Promise<void> => {
  const actor = await requireUserManageAccess();
  const targetUser = await db.authUsers.get(userId);

  if (!targetUser) {
    throw new Error('User tidak ditemukan.');
  }

  if (!isActive && targetUser.id === actor.id) {
    throw new Error('User yang sedang login tidak bisa dinonaktifkan.');
  }

  if (targetUser.is_active && !isActive && targetUser.role === 'OWNER') {
    await assertAnotherActiveOwnerExists(targetUser.id);
  }

  const updatedAt = new Date().toISOString();
  await db.authUsers.update(targetUser.id, {
    is_active: isActive,
    updated_at: updatedAt,
    sync_status: 'pending',
    sync_error: undefined,
  });

  if (!isActive) {
    await db.authSessions.where('user_id').equals(targetUser.id).delete();
  }

  const updatedUser = await db.authUsers.get(targetUser.id);
  if (!updatedUser) {
    throw new Error('User tidak ditemukan setelah status diperbarui.');
  }

  await enqueueAuthUserSync(updatedUser, 'update');
  await writeActivityLog({
    user: actor,
    action: isActive ? 'AUTH_USER_ENABLED' : 'AUTH_USER_DISABLED',
    entity: 'authUsers',
    entity_id: targetUser.id,
    description: `${actor.name} ${isActive ? 'mengaktifkan' : 'menonaktifkan'} user ${targetUser.name}.`,
  });
};

export const getActivityLogs = async (input: ActivityLogQueryInput = {}): Promise<ActivityLog[]> => {
  await requireActivityLogAccess();

  const limit = input.limit ?? 200;
  return db.activityLogs
    .orderBy('created_at')
    .reverse()
    .limit(limit)
    .toArray();
};

const buildLegacyAuthUserEmail = (name: string) => (
  `${name.trim().toLowerCase().replace(/\s+/g, '')}@frayukti.com`
);

const authUserEmailMatches = (user: AuthUser, email: string) => (
  normalizeAuthEmail(user.email) === email || (!user.email && buildLegacyAuthUserEmail(user.name) === email)
);

const remoteAuthUserEmailMatches = (user: RemoteAuthUserDto, email: string) => (
  normalizeAuthEmail(user.email ?? undefined) === email || (!user.email && buildLegacyAuthUserEmail(user.name) === email)
);

const createLoginSession = async (
  user: AuthUser,
  serverSession?: RemoteServerAuthSessionDto | null,
): Promise<AuthUser> => {
  const now = new Date().toISOString();
  const sessionId = crypto.randomUUID();

  await db.authSessions.add({
    id: sessionId,
    user_id: user.id,
    created_at: now,
    last_active_at: now,
    server_session_token: serverSession?.token,
    server_session_expires_at: serverSession?.expires_at,
  });
  setActiveSessionId(sessionId);

  await writeActivityLog({
    user,
    action: 'AUTH_LOGIN',
    entity: 'authSessions',
    entity_id: sessionId,
    description: `${user.name} login.`,
  });

  return user;
};

const mapRemoteAuthUserForLogin = (remoteUser: RemoteAuthUserDto): AuthUser => ({
  id: remoteUser.id,
  name: remoteUser.name,
  email: normalizeAuthEmail(remoteUser.email ?? undefined),
  role: remoteUser.role,
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
  last_synced_at: new Date().toISOString(),
  remote_updated_at: remoteUser.updated_at,
});

const ensureEmployeeLoginDataAvailable = async (remoteUser: RemoteAuthUserDto) => {
  if (remoteUser.actor_type !== 'EMPLOYEE') return;

  try {
    await refreshEmployeesFromPostgres();
  } catch (error) {
    console.error('Failed to refresh employees for server login', error);
  }

  const existingEmployee = await db.employees.get(remoteUser.id);
  if (existingEmployee) return;

  const fallbackEmployee: Employee = {
    id: remoteUser.id,
    name: remoteUser.name,
    email: normalizeAuthEmail(remoteUser.email ?? undefined),
    login_role_id: remoteUser.role_id ?? undefined,
    pin_hash: remoteUser.pin_hash,
    pin_salt: remoteUser.pin_salt,
    is_active: remoteUser.is_active,
    created_at: remoteUser.created_at,
    updated_at: remoteUser.updated_at,
  };
  await db.employees.put(fallbackEmployee);
};

const tryLoginWithLocalData = async (normalizedEmail: string, pin: string): Promise<AuthUser | null> => {
  const users = (await db.authUsers.toArray()).filter((user) => user.is_active && authUserEmailMatches(user, normalizedEmail));

  for (const user of users) {
    if (await verifyPin(pin, user.pin_hash, user.pin_salt)) {
      if (user.role_id) {
        const role = await db.roles.get(user.role_id);
        if (!role?.is_active) {
          throw new Error('Role user sudah nonaktif.');
        }
      }

      return createLoginSession(user);
    }
  }

  const employees = (await db.employees.toArray()).filter((emp) => emp.is_active && emp.pin_hash && emp.pin_salt && normalizeAuthEmail(emp.email) === normalizedEmail);
  
  for (const employee of employees) {
    if (employee.pin_hash && employee.pin_salt && await verifyPin(pin, employee.pin_hash, employee.pin_salt)) {
      if (employee.login_role_id) {
        const role = await db.roles.get(employee.login_role_id);
        if (!role?.is_active) {
          throw new Error('Role karyawan sudah nonaktif.');
        }
      }

      const now = new Date().toISOString();
      const sessionId = crypto.randomUUID();

      await db.authSessions.add({
        id: sessionId,
        user_id: employee.id, // We use employee id as user_id for the session
        created_at: now,
        last_active_at: now,
      });
      setActiveSessionId(sessionId);

      // Create ephemeral AuthUser for the log
      const role = employee.login_role_id ? await db.roles.get(employee.login_role_id) : undefined;
      const ephemeralUser: AuthUser = {
        id: employee.id,
        name: employee.name,
        role: (role?.code as UserRole) || 'KASIR',
        role_id: employee.login_role_id,
        role_name: role?.name,
        employee_id: employee.id,
        pin_hash: employee.pin_hash,
        pin_salt: employee.pin_salt,
        is_active: employee.is_active,
        created_at: employee.created_at,
        updated_at: employee.updated_at,
      };

      await writeActivityLog({
        user: ephemeralUser,
        action: 'AUTH_LOGIN',
        entity: 'authSessions',
        entity_id: sessionId,
        description: `${employee.name} (Karyawan) login.`,
      });

      return ephemeralUser;
    }
  }

  return null;
};

const tryLoginWithRemoteAuthUsers = async (normalizedEmail: string, pin: string): Promise<AuthUser | null> => {
  const remoteUsers = (await authUserPostgresAdapter.list())
    .filter((user) => !user.deleted_at && user.is_active && remoteAuthUserEmailMatches(user, normalizedEmail));

  for (const remoteUser of remoteUsers) {
    if (!await verifyPin(pin, remoteUser.pin_hash, remoteUser.pin_salt)) continue;

    await refreshRolesFromPostgres();
    if (remoteUser.role_id) {
      const role = await db.roles.get(remoteUser.role_id);
      if (!role?.is_active) {
        throw new Error('Role user sudah nonaktif atau belum tersinkron.');
      }
    }

    const user = mapRemoteAuthUserForLogin(remoteUser);
    await db.authUsers.put(user);
    return createLoginSession(user);
  }

  return null;
};

export const loginWithEmailAndPin = async (email: string, pin: string): Promise<AuthUser> => {
  const normalizedEmail = normalizeAuthEmail(email);
  if (!normalizedEmail) {
    throw new Error('Email wajib diisi.');
  }

  const postgresHealth = await postgresAdapter.healthCheck();
  if (postgresHealth.available) {
    try {
      const serverSession = await serverAuthSessionPostgresAdapter.authenticate(normalizedEmail, pin);
      if (!serverSession) {
        throw new Error('Sesi server gagal dibuat.');
      }

      await refreshRolesFromPostgres();
      const user = mapRemoteAuthUserForLogin(serverSession.user);
      if (serverSession.user.actor_type === 'EMPLOYEE') {
        await ensureEmployeeLoginDataAvailable(serverSession.user);
      } else {
        await db.authUsers.put(user);
      }
      return createLoginSession(user, serverSession);
    } catch (error) {
      const localLogin = await tryLoginWithLocalData(normalizedEmail, pin);
      if (localLogin) {
        console.warn('Server login failed; using local auth data.', error);
        return localLogin;
      }

      if (error instanceof Error) {
        throw error;
      }

      const message = (
        error &&
        typeof error === 'object' &&
        'message' in error &&
        typeof error.message === 'string'
      )
        ? error.message
        : 'Email atau PIN tidak valid atau user tidak aktif.';
      throw new Error(message);
    }
  }

  const localLogin = await tryLoginWithLocalData(normalizedEmail, pin);
  if (localLogin) return localLogin;

  try {
    await refreshAuthUsersFromPostgres();
  } catch (error) {
    console.error('Failed to refresh auth users before login retry', error);
  }

  const refreshedLogin = await tryLoginWithLocalData(normalizedEmail, pin);
  if (refreshedLogin) return refreshedLogin;

  try {
    const remoteLogin = await tryLoginWithRemoteAuthUsers(normalizedEmail, pin);
    if (remoteLogin) return remoteLogin;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Role user')) {
      throw error;
    }
    console.error('Failed to verify login directly against PostgreSQL', error);
  }

  throw new Error('Email atau PIN tidak valid atau user tidak aktif.');
};

export const logout = async (): Promise<void> => {
  const sessionId = getActiveSessionId();
  const session = sessionId ? await db.authSessions.get(sessionId) : undefined;
  const currentUser = await getCurrentSessionUser({
    touchSession: false,
    cleanupInvalidSession: false,
  });

  if (sessionId) {
    if (session?.server_session_token) {
      try {
        await serverAuthSessionPostgresAdapter.revoke(session.server_session_token);
      } catch (error) {
        console.error('Failed to revoke server session', error);
      }
    }
    await db.authSessions.delete(sessionId);
  }
  clearActiveSessionId();

  if (currentUser) {
    await writeActivityLog({
      user: currentUser,
      action: 'AUTH_LOGOUT',
      entity: 'authSessions',
      entity_id: sessionId ?? undefined,
      description: `${currentUser.name} logout.`,
    });
  }
};

export const getCurrentServerSessionToken = async (): Promise<string | undefined> => {
  const sessionId = getActiveSessionId();
  if (!sessionId) return undefined;

  const session = await db.authSessions.get(sessionId);
  if (!session?.server_session_token) return undefined;
  if (
    session.server_session_expires_at &&
    Date.parse(session.server_session_expires_at) <= Date.now()
  ) {
    return undefined;
  }

  return session.server_session_token;
};

export const getCurrentSessionUser = async (options: CurrentSessionUserOptions = {}): Promise<AuthUser | null> => {
  const { touchSession = true, cleanupInvalidSession = true } = options;
  const sessionId = getActiveSessionId();
  if (!sessionId) return null;

  const session = await db.authSessions.get(sessionId);
  if (!session) {
    if (cleanupInvalidSession) {
      clearActiveSessionId();
    }
    return null;
  }

  let user = await db.authUsers.get(session.user_id);
  if (!user || !user.is_active) {
    // Check if it's an employee session
    const employee = await db.employees.get(session.user_id);
    if (!employee || !employee.is_active || !employee.pin_hash) {
      if (cleanupInvalidSession) {
        await db.authSessions.delete(sessionId);
        clearActiveSessionId();
      }
      return null;
    }

    const role = employee.login_role_id ? await db.roles.get(employee.login_role_id) : undefined;
    user = {
      id: employee.id,
      name: employee.name,
      role: (role?.code as UserRole) || 'KASIR',
      role_id: employee.login_role_id,
      role_name: role?.name,
      employee_id: employee.id,
      pin_hash: employee.pin_hash,
      pin_salt: employee.pin_salt!,
      is_active: employee.is_active,
      created_at: employee.created_at,
      updated_at: employee.updated_at,
    };
  }

  if (touchSession) {
    await db.authSessions.update(sessionId, {
      last_active_at: new Date().toISOString(),
    });
  }

  return user;
};

export const writeActivityLog = async (input: ActivityLogInput): Promise<void> => {
  const user = input.user ?? await getCurrentSessionUser();
  const log: ActivityLog = {
    id: crypto.randomUUID(),
    user_id: user?.id,
    user_name: user?.name,
    role: user?.role,
    action: input.action,
    entity: input.entity,
    entity_id: input.entity_id,
    description: input.description,
    created_at: new Date().toISOString(),
  };

  await db.activityLogs.add(log);
  setTimeout(() => {
    void enqueueActivityLogSync(log);
  }, 0);
};

export const requireRolePermission = (role: UserRole | undefined, permission: Permission) => {
  if (!hasPermission(role, permission)) {
    throw new Error('Anda tidak memiliki akses untuk aksi ini.');
  }
};

export const hasUserPermission = async (
  user: AuthUser | null | undefined,
  permission: Permission,
) => {
  if (!user) return false;

  const role = user.role_id ? await db.roles.get(user.role_id) : undefined;
  const bypassSetupModuleLock = canBypassSetupModuleLockForUser(user, role);
  if (!isPermissionEnabledBySetup(permission, { bypassSetupModuleLock })) return false;
  if (role?.is_owner || user.role === 'OWNER') return true;

  if (user.role_id) {
    const rolePermission = await db.rolePermissions
      .where('[role_id+permission_code]')
      .equals([user.role_id, permission])
      .first();

    return Boolean(rolePermission);
  }

  return hasPermission(user.role, permission);
};

export const requireUserPermission = async (
  user: AuthUser | null | undefined,
  permission: Permission,
) => {
  if (!await hasUserPermission(user, permission)) {
    throw new Error('Anda tidak memiliki akses untuk aksi ini.');
  }
};

export const requireAnyUserPermission = async (
  user: AuthUser | null | undefined,
  permissions: Permission[],
) => {
  const permissionResults = await Promise.all(
    permissions.map((permission) => hasUserPermission(user, permission)),
  );
  if (!permissionResults.some(Boolean)) {
    throw new Error('Anda tidak memiliki akses untuk aksi ini.');
  }
};
