import { createContext } from 'react';
import type { AuthUser, Permission } from '@/types';

export interface AuthContextValue {
  currentUser: AuthUser | null;
  isLoading: boolean;
  login: (pin: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshCurrentUser: () => Promise<AuthUser | null>;
  can: (permission: Permission) => boolean;
  requirePermission: (permission: Permission) => void;
}

export const AuthContext = createContext<AuthContextValue>({
  currentUser: null,
  isLoading: true,
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
