import { db } from '@/lib/db';
import type { ActivityLog, AuthUser, Permission, UserRole } from '@/types';
import { hasPermission } from './permissions';
import { refreshAuthUsersFromPostgres } from './authReadService';
import { enqueueActivityLogSync, enqueueAuthUserSync } from '@/services/syncQueueService';

const SESSION_STORAGE_KEY = 'kasirku-auth-session-id';
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
  role: UserRole;
  pin: string;
}

interface UpdateAuthUserInput {
  userId: string;
  name: string;
  role: UserRole;
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

const withPendingAuthUserSync = (user: AuthUser): AuthUser => ({
  ...user,
  sync_status: 'pending',
  sync_error: undefined,
});

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
  requireRolePermission(currentUser?.role, 'USER_MANAGE');

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
  requireRolePermission(currentUser?.role, 'ACTIVITY_LOG_VIEW');

  if (!currentUser) {
    throw new Error('Session user tidak ditemukan.');
  }

  return currentUser;
};

export const ensureDefaultOwner = async (): Promise<void> => {
  try {
    await refreshAuthUsersFromPostgres();
  } catch (error) {
    console.error('Failed to refresh auth users from PostgreSQL', error);
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

export const hasActiveOwner = async () => {
  const owner = await db.authUsers
    .where('role')
    .equals('OWNER')
    .and((user) => user.is_active)
    .first();

  return Boolean(owner);
};

export const createOwnerUser = async (input: { name: string; pin: string }): Promise<AuthUser> => {
  const hasOwner = await hasActiveOwner();
  if (hasOwner) {
    throw new Error('Owner aktif sudah ada.');
  }

  const now = new Date().toISOString();
  const { hash, salt } = await createPinHash(input.pin);
  const owner: AuthUser = withPendingAuthUserSync({
    id: crypto.randomUUID(),
    name: input.name,
    role: 'OWNER',
    pin_hash: hash,
    pin_salt: salt,
    is_active: true,
    created_at: now,
    updated_at: now,
  });

  await db.authUsers.add(owner);
  await enqueueAuthUserSync(owner, 'create');
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
  const user: AuthUser = withPendingAuthUserSync({
    id: crypto.randomUUID(),
    name,
    role: input.role,
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
    description: `${actor.name} membuat user ${user.name} dengan role ${user.role}.`,
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

  if (targetUser.is_active && targetUser.role === 'OWNER' && input.role !== 'OWNER') {
    await assertAnotherActiveOwnerExists(targetUser.id);
  }

  const updatedAt = new Date().toISOString();
  await db.authUsers.update(targetUser.id, {
    name,
    role: input.role,
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

export const loginWithPin = async (pin: string): Promise<AuthUser> => {
  const users = (await db.authUsers.toArray()).filter((user) => user.is_active);

  for (const user of users) {
    if (await verifyPin(pin, user.pin_hash, user.pin_salt)) {
      const now = new Date().toISOString();
      const sessionId = crypto.randomUUID();

      await db.authSessions.add({
        id: sessionId,
        user_id: user.id,
        created_at: now,
        last_active_at: now,
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
    }
  }

  throw new Error('PIN tidak valid atau user tidak aktif.');
};

export const logout = async (): Promise<void> => {
  const sessionId = getActiveSessionId();
  const currentUser = await getCurrentSessionUser({
    touchSession: false,
    cleanupInvalidSession: false,
  });

  if (sessionId) {
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

  const user = await db.authUsers.get(session.user_id);
  if (!user || !user.is_active) {
    if (cleanupInvalidSession) {
      await db.authSessions.delete(sessionId);
      clearActiveSessionId();
    }
    return null;
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
