import { isTauri } from '@tauri-apps/api/core';
import { type as getOsType } from '@tauri-apps/plugin-os';

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
  __TAURI__?: unknown;
};

export const isTauriRuntime = () => {
  if (typeof window === 'undefined') return false;

  try {
    if (isTauri()) return true;
  } catch {
    return false;
  }

  const tauriWindow = window as TauriWindow;
  return Boolean(tauriWindow.__TAURI__ || tauriWindow.__TAURI_INTERNALS__);
};

export const isTauriMobile = () => {
  if (!isTauriRuntime()) return false;

  try {
    const osType = getOsType();
    return osType === 'android' || osType === 'ios';
  } catch (error) {
    console.warn('Unable to detect Tauri OS type:', error);
    return false;
  }
};
