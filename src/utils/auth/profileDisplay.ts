import { ROLE_LABEL } from '@/auth/permissions';
import type { AuthUser, Role } from '@/types';

export interface AuthUserProfileSummary {
  displayName: string;
  initials: string;
  roleLabel: string;
  email?: string;
}

export const getAuthUserDisplayName = (
  user: Pick<AuthUser, 'name' | 'email'>,
  fallback: string,
) => user.name.trim() || user.email?.trim() || fallback;

export const getAuthUserInitials = (displayName: string) => {
  const words = displayName.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
};

export const getAuthUserRoleLabel = (
  user: Pick<AuthUser, 'role' | 'role_name'>,
  role?: Pick<Role, 'name'> | null,
) => role?.name.trim() || user.role_name?.trim() || ROLE_LABEL[user.role] || user.role;

export const buildAuthUserProfileSummary = (
  user: AuthUser,
  role: Role | null,
  fallbackName: string,
): AuthUserProfileSummary => {
  const displayName = getAuthUserDisplayName(user, fallbackName);

  return {
    displayName,
    initials: getAuthUserInitials(displayName),
    roleLabel: getAuthUserRoleLabel(user, role),
    email: user.email?.trim() || undefined,
  };
};
