import type { SetupConfig } from '@/types/setup';

export interface SetupConfigReconciliationDecision {
  config: SetupConfig | null;
  shouldUploadLocal: boolean;
}

export const resolveSetupConfigReconciliation = (
  remoteConfig: SetupConfig | null,
  localConfig: SetupConfig | null,
): SetupConfigReconciliationDecision => {
  if (remoteConfig) {
    return {
      config: remoteConfig,
      shouldUploadLocal: false,
    };
  }

  return {
    config: localConfig,
    shouldUploadLocal: Boolean(localConfig),
  };
};
