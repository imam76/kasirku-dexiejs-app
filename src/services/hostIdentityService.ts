import { postgresAdapter } from '@/services/postgresAdapter';

export const HOST_IDENTITY_STORAGE_KEY = 'frayukti-host-instance-id';

export const getStoredHostIdentity = (): string | null => (
  localStorage.getItem(HOST_IDENTITY_STORAGE_KEY)
);

export const saveHostIdentity = (instanceId: string): void => {
  localStorage.setItem(HOST_IDENTITY_STORAGE_KEY, instanceId);
};

/**
 * Binds installations that reached a host outside the setup flow (pre-existing
 * DATABASE_URL) so a later host change is still guarded.
 */
export const bindHostIdentityIfUnbound = async (): Promise<void> => {
  if (getStoredHostIdentity()) return;

  try {
    const instanceId = await postgresAdapter.getHostInstanceId();
    if (instanceId) saveHostIdentity(instanceId);
  } catch (error) {
    console.error('Failed to bind host identity', error);
  }
};
