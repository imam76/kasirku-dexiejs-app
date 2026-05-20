import type { ReactNode } from 'react';
import type { Permission } from '@/types';
import { useAuth } from './useAuth';

interface RequirePermissionProps {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}

export const RequirePermission = ({ permission, children, fallback = null }: RequirePermissionProps) => {
  const { can } = useAuth();

  if (!can(permission)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};
