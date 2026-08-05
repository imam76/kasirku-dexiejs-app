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

export const isTauriDesktop = () => {
  if (!isTauriRuntime()) return false;

  try {
    const osType = getOsType();
    return osType === 'linux' || osType === 'macos' || osType === 'windows';
  } catch (error) {
    console.warn('Unable to detect Tauri OS type:', error);
    return false;
  }
};

/**
 * Sistem operasi yang sedang menjalankan aplikasi. Di luar Tauri, jatuh ke
 * penebakan dari user agent supaya panduan di UI tetap relevan saat dibuka lewat
 * browser.
 */
export type HostPlatform = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'unknown';

export const getHostPlatform = (): HostPlatform => {
  if (isTauriRuntime()) {
    try {
      const osType = getOsType();
      if (
        osType === 'windows' ||
        osType === 'macos' ||
        osType === 'linux' ||
        osType === 'android' ||
        osType === 'ios'
      ) {
        return osType;
      }
    } catch (error) {
      console.warn('Unable to detect Tauri OS type:', error);
    }
  }

  if (typeof navigator === 'undefined') return 'unknown';

  const agent = navigator.userAgent.toLowerCase();
  if (agent.includes('android')) return 'android';
  if (/iphone|ipad|ipod/.test(agent)) return 'ios';
  if (agent.includes('windows')) return 'windows';
  if (agent.includes('mac os')) return 'macos';
  if (agent.includes('linux')) return 'linux';
  return 'unknown';
};
