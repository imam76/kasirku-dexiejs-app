import { createContext } from 'react';
import type { AuthUser, Permission, Role } from '@/types';

export interface AuthContextValue {
  currentUser: AuthUser | null;
  currentRole: Role | null;
  permissionSet: Set<Permission>;
  isLoading: boolean;
  isPermissionLoading: boolean;
  login: (email: string, pin: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshCurrentUser: () => Promise<AuthUser | null>;
  can: (permission: Permission) => boolean;
  requirePermission: (permission: Permission) => void;
}

export const AuthContext = createContext<AuthContextValue>({
  currentUser: null,
  currentRole: null,
  permissionSet: new Set(),
  isLoading: true,
  isPermissionLoading: false,
  login: async () => {
    throw new Error('AuthProvider belum siap.');
  },
  logout: async () => { },
  refreshCurrentUser: async () => null,
  can: () => false,
  requirePermission: () => {
    throw new Error('AuthProvider belum siap.');
  },
});
