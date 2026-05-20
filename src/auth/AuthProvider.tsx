import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthUser, Permission } from '@/types';
import { hasPermission } from './permissions';
import { ensureDefaultOwner, getCurrentSessionUser, loginWithPin, logout as logoutSession, requireRolePermission } from './authService';
import { AuthContext, type AuthContextValue } from './AuthContext';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshCurrentUser = useCallback(async () => {
    const user = await getCurrentSessionUser();
    setCurrentUser(user);
    return user;
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      try {
        await ensureDefaultOwner();
        const user = await getCurrentSessionUser();
        if (isMounted) {
          setCurrentUser(user);
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
  }, []);

  const login = useCallback(async (pin: string) => {
    const user = await loginWithPin(pin);
    setCurrentUser(user);
    return user;
  }, []);

  const logout = useCallback(async () => {
    await logoutSession();
    setCurrentUser(null);
  }, []);

  const can = useCallback((permission: Permission) => {
    return hasPermission(currentUser?.role, permission);
  }, [currentUser?.role]);

  const requirePermission = useCallback((permission: Permission) => {
    requireRolePermission(currentUser?.role, permission);
  }, [currentUser?.role]);

  const value = useMemo<AuthContextValue>(() => ({
    currentUser,
    isLoading,
    login,
    logout,
    refreshCurrentUser,
    can,
    requirePermission,
  }), [can, currentUser, isLoading, login, logout, refreshCurrentUser, requirePermission]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
