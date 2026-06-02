import { invoke } from '@tauri-apps/api/core';

const isTauriRuntime = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const postgresAdapter = {
  async healthCheck() {
    if (!isTauriRuntime()) return false;
    return invoke<boolean>('postgres_health_check');
  },
};
