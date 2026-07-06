import { useCallback, useEffect, useMemo, useState } from 'react';
import { isRouteEnabledForModules } from '@/auth/moduleAccess';
import { SETUP_CONFIG_STORAGE_KEY } from '@/constants/setupModules';
import { SETUP_CONFIG_CHANGED_EVENT, canBypassSetupModuleLockForUser, getSetupConfig } from '@/services/setupKeyService';
import type { AuthUser, Role } from '@/types';
import type { SetupConfig } from '@/types/setup';

/**
 * Hook to check if a given setup module is enabled.
 *
 * Returns:
 * - `isModuleEnabled(code)` — check single module
 * - `isRouteEnabled(path)` — check if a route's module(s) are enabled
 * - `enabledModules` — the raw list of enabled module codes
 * - `isConfigured` — whether setup config exists at all
 *
 * If no setup config exists (fresh install without developer setup),
 * everything is enabled by default.
 */
export const useEnabledModules = (options: {
  currentUser?: Pick<AuthUser, 'role'> | null;
  currentRole?: Pick<Role, 'is_owner'> | null;
} = {}) => {
  const [config, setConfig] = useState<SetupConfig | null>(() => getSetupConfig());
  const bypassSetupModuleLock = canBypassSetupModuleLockForUser(
    options.currentUser,
    options.currentRole,
  );

  useEffect(() => {
    const refreshConfig = () => setConfig(getSetupConfig());
    const handleStorage = (event: StorageEvent) => {
      if (event.key === SETUP_CONFIG_STORAGE_KEY) {
        refreshConfig();
      }
    };

    window.addEventListener(SETUP_CONFIG_CHANGED_EVENT, refreshConfig);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(SETUP_CONFIG_CHANGED_EVENT, refreshConfig);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const enabledSet = useMemo(
    () => (config && !bypassSetupModuleLock ? new Set(config.enabledModules) : null),
    [bypassSetupModuleLock, config],
  );

  const isModuleEnabled = useCallback((code: string) => {
    if (!enabledSet) return true; // no config = all enabled
    return enabledSet.has(code);
  }, [enabledSet]);

  const isRouteEnabled = useCallback((path: string) => {
    if (!enabledSet) return true;
    return isRouteEnabledForModules(path, enabledSet);
  }, [enabledSet]);

  return {
    isModuleEnabled,
    isRouteEnabled,
    enabledModules: config?.enabledModules ?? [],
    isConfigured: config !== null,
    bypassSetupModuleLock,
  };
};
