import type { SetupConfig } from '@/types/setup';
import type { AuthUser, Role } from '@/types';
import { SETUP_CONFIG_STORAGE_KEY } from '@/constants/setupModules';
import { isTauriRuntime } from '@/utils/export/platform';

export const SETUP_CONFIG_CHANGED_EVENT = 'kasirku-setup-config-changed';

/**
 * The expected hash of the license key (SHA-256, base64-encoded).
 * Sourced from SETUP_HASH_KEY in src-tauri/.env.
 * In a production build this would be injected via Vite define or Tauri invoke.
 * For now, we use the VITE_ env variable so the frontend can access it.
 */
const getSetupHashKey = (): string => {
  // Try Vite env first, fallback to hardcoded value from src-tauri/.env
  const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
  return (
    meta.env?.VITE_SETUP_HASH_KEY ??
    'AbFTxLSC6IgAi6Gd+UphtlqRenrgc/+YYAi7VTabeDo='
  );
};

/**
 * Hash a string with SHA-256 and return base64-encoded digest.
 */
const sha256Base64 = async (input: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  let binary = '';
  for (const byte of hashArray) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

/**
 * Verify a license key against the stored hash.
 * @returns true if the license key matches
 */
export const verifyLicenseKey = async (licenseKey: string): Promise<boolean> => {
  const expectedHash = getSetupHashKey();
  const inputHash = await sha256Base64(licenseKey.trim());
  return inputHash === expectedHash;
};

/**
 * Get the fingerprint of a license key (first 8 chars of base64 hash).
 */
export const getLicenseFingerprint = async (licenseKey: string): Promise<string> => {
  const hash = await sha256Base64(licenseKey.trim());
  return hash.slice(0, 8);
};

/**
 * Read setup config from localStorage.
 */
export const getSetupConfig = (): SetupConfig | null => {
  try {
    const raw = localStorage.getItem(SETUP_CONFIG_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SetupConfig;
  } catch {
    return null;
  }
};

/**
 * Save setup config to localStorage.
 */
export const saveSetupConfig = (config: SetupConfig): void => {
  localStorage.setItem(SETUP_CONFIG_STORAGE_KEY, JSON.stringify(config));
  window.dispatchEvent(new Event(SETUP_CONFIG_CHANGED_EVENT));
};

/**
 * Check if setup has been configured before.
 */
export const isSetupConfigured = (): boolean => {
  return getSetupConfig() !== null;
};

/**
 * Web builds can be used as a trial/demo surface. This only detects whether the
 * web trial bypass is available; callers still decide whether the current user
 * is allowed to use it.
 */
export const shouldBypassSetupModuleLock = (): boolean => {
  if (typeof window === 'undefined') return false;

  const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
  const webTrialBypassEnabled = meta.env?.VITE_WEB_TRIAL_MODULE_BYPASS !== 'false';

  return webTrialBypassEnabled && !isTauriRuntime();
};

export const isOwnerAccessContext = (
  user: Pick<AuthUser, 'role'> | null | undefined,
  role: Pick<Role, 'is_owner'> | null | undefined,
): boolean => {
  return Boolean(role?.is_owner || user?.role === 'OWNER');
};

export const canBypassSetupModuleLockForUser = (
  user: Pick<AuthUser, 'role'> | null | undefined,
  role: Pick<Role, 'is_owner'> | null | undefined,
): boolean => {
  return isOwnerAccessContext(user, role) && shouldBypassSetupModuleLock();
};
