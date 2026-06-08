export interface SetupModuleItem {
  code: string;
  label: string;
  description?: string;
}

export interface SetupModuleGroup {
  key: string;
  label: string;
  iconName: string;
  modules: SetupModuleItem[];
}

export interface SetupConfig {
  enabledModules: string[];
  databaseUrl: string;
  configuredAt: string;
  configuredBy: string; // license fingerprint (first 8 chars of hash)
}
