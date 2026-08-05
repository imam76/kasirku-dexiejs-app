export type HostSwitchDecision = 'same-host' | 'bind-host' | 'requires-local-reset';

export interface HostSwitchInput {
  storedInstanceId: string | null;
  nextInstanceId: string | null;
  hasLocalData: boolean;
}

/**
 * Local data is only ever valid against the host it was synced with. Pointing an
 * installation at a different host while local data exists would silently merge
 * two datasets, so it requires wiping the local database first.
 */
export const resolveHostSwitchDecision = ({
  storedInstanceId,
  nextInstanceId,
  hasLocalData,
}: HostSwitchInput): HostSwitchDecision => {
  if (!nextInstanceId || !storedInstanceId) return 'bind-host';
  if (storedInstanceId === nextInstanceId) return 'same-host';

  return hasLocalData ? 'requires-local-reset' : 'bind-host';
};
