import type { SetupConfig } from '@/types/setup';
import type { AuthUser, Role } from '@/types';
import { SETUP_CONFIG_STORAGE_KEY } from '@/constants/setupModules';
import { isTauriRuntime } from '@/utils/export/platform';

export const SETUP_CONFIG_CHANGED_EVENT = 'frayukti-setup-config-changed';
const CURRENT_MODULE_CATALOG_VERSION = 6;
const LEGACY_SETTINGS_MODULES = ['POS_TRANSACTION', 'PRODUCT', 'CASH_FLOW'];

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
    const config = JSON.parse(raw) as SetupConfig;
    if ((config.moduleCatalogVersion ?? 1) >= CURRENT_MODULE_CATALOG_VERSION) {
      return config;
    }

    const enabledModules = new Set(config.enabledModules);
    if (enabledModules.has('PRODUCT')) {
      enabledModules.add('PRODUCTION');
      enabledModules.add('STOCK_OPNAME');
    }
    if (LEGACY_SETTINGS_MODULES.some((moduleCode) => enabledModules.has(moduleCode))) {
      enabledModules.add('AREA');
      enabledModules.add('EMPLOYEE');
    }
    if (['PURCHASE_ORDER', 'PURCHASE_RECEIPT', 'PURCHASE_INVOICE', 'PURCHASE_RETURN']
      .some((moduleCode) => enabledModules.has(moduleCode))) {
      enabledModules.add('PURCHASE_REQUEST');
      enabledModules.add('PURCHASE_RFQ');
    }
    if (enabledModules.has('REPORT_POS_SALES')) {
      enabledModules.add('REPORT_DEPOSIT');
    }
    if (['CASH_FLOW', 'REPORT_EXPENSE', 'REPORT_PROFIT'].some((moduleCode) => enabledModules.has(moduleCode))) {
      enabledModules.add('REPORT_PAYROLL');
    }
    if (enabledModules.has('KOPERASI_SHU')) {
      [
        'KOPERASI_REPORT_CASH',
        'KOPERASI_REPORT_DAILY_TARGET',
        'KOPERASI_REPORT_DAILY_STORTING',
        'KOPERASI_REPORT_DAILY_DROP',
        'KOPERASI_REPORT_WEEKLY_DROP',
        'KOPERASI_REPORT_IPTW',
        'KOPERASI_REPORT_MEMBER_REGISTER',
        'KOPERASI_REPORT_INSTALLMENT_BOOK',
        'KOPERASI_REPORT_CASH_FLOW',
        'KOPERASI_REPORT_LEDGER',
      ].forEach((moduleCode) => enabledModules.add(moduleCode));
    }

    const migratedConfig: SetupConfig = {
      ...config,
      enabledModules: Array.from(enabledModules),
      moduleCatalogVersion: CURRENT_MODULE_CATALOG_VERSION,
    };
    localStorage.setItem(SETUP_CONFIG_STORAGE_KEY, JSON.stringify(migratedConfig));
    return migratedConfig;
  } catch {
    return null;
  }
};

/**
 * Save setup config to localStorage.
 */
export const saveSetupConfig = (config: SetupConfig): void => {
  localStorage.setItem(SETUP_CONFIG_STORAGE_KEY, JSON.stringify({
    ...config,
    moduleCatalogVersion: CURRENT_MODULE_CATALOG_VERSION,
  }));
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
