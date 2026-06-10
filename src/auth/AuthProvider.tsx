import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthUser, Permission, Role } from '@/types';
import { hasPermission } from './permissions';
import { ensureDefaultOwner, getCurrentSessionUser, loginWithEmailAndPin, logout as logoutSession } from './authService';
import { AuthContext, type AuthContextValue } from './AuthContext';
import { db } from '@/lib/db';
import { isPermissionEnabledBySetup } from './permissionCatalog';
import { canBypassSetupModuleLockForUser } from '@/services/setupKeyService';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [currentRole, setCurrentRole] = useState<Role | null>(null);
  const [permissionSet, setPermissionSet] = useState<Set<Permission>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isPermissionLoading, setIsPermissionLoading] = useState(false);

  const loadPermissions = useCallback(async (user: AuthUser | null) => {
    setIsPermissionLoading(true);
    try {
      if (!user) {
        setCurrentRole(null);
        setPermissionSet(new Set());
        return;
      }

      const role = user.role_id ? await db.roles.get(user.role_id) : undefined;
      setCurrentRole(role ?? null);

      if (role?.is_owner || user.role === 'OWNER') {
        setPermissionSet(new Set());
        return;
      }

      if (user.role_id) {
        const rolePermissions = await db.rolePermissions
          .where('role_id')
          .equals(user.role_id)
          .toArray();
        setPermissionSet(new Set(rolePermissions.map((item) => item.permission_code)));
        return;
      }

      setPermissionSet(new Set());
    } finally {
      setIsPermissionLoading(false);
    }
  }, []);

  const refreshCurrentUser = useCallback(async () => {
    const user = await getCurrentSessionUser();
    setCurrentUser(user);
    await loadPermissions(user);
    return user;
  }, [loadPermissions]);

  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      try {
        await ensureDefaultOwner();
        const user = await getCurrentSessionUser();
        if (isMounted) {
          setCurrentUser(user);
          await loadPermissions(user);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadSession();

    return () => {
      isMounted = false;
    };
  }, [loadPermissions]);

  const login = useCallback(async (email: string, pin: string) => {
    const user = await loginWithEmailAndPin(email, pin);
    setCurrentUser(user);
    await loadPermissions(user);
    return user;
  }, [loadPermissions]);

  const logout = useCallback(async () => {
    await logoutSession();
    setCurrentUser(null);
    await loadPermissions(null);
  }, [loadPermissions]);

  const can = useCallback((permission: Permission) => {
    if (!currentUser) return false;
    const bypassSetupModuleLock = canBypassSetupModuleLockForUser(currentUser, currentRole);
    if (!isPermissionEnabledBySetup(permission, { bypassSetupModuleLock })) return false;
    if (currentRole?.is_owner || currentUser.role === 'OWNER') return true;
    if (currentUser.role_id) return permissionSet.has(permission);
    return hasPermission(currentUser.role, permission, { bypassSetupModuleLock });
  }, [currentRole?.is_owner, currentUser, permissionSet]);

  const requirePermission = useCallback((permission: Permission) => {
    if (!can(permission)) {
      throw new Error('Anda tidak memiliki akses untuk aksi ini.');
    }
  }, [can]);

  const value = useMemo<AuthContextValue>(() => ({
    currentUser,
    currentRole,
    permissionSet,
    isLoading,
    isPermissionLoading,
    login,
    logout,
    refreshCurrentUser,
    can,
    requirePermission,
  }), [can, currentRole, currentUser, isLoading, isPermissionLoading, login, logout, permissionSet, refreshCurrentUser, requirePermission]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
