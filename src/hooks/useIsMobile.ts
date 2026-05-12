import { useSyncExternalStore } from 'react';

const MOBILE_MEDIA_QUERY = '(max-width: 1279.98px)';
const MOBILE_DEVICE_QUERY = '(hover: none) and (pointer: coarse)';
const MOBILE_USER_AGENT_PATTERN =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

const subscribe = (callback: () => void) => {
  if (typeof window === 'undefined') return () => {};

  const viewportQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
  const deviceQuery = window.matchMedia(MOBILE_DEVICE_QUERY);
  viewportQuery.addEventListener('change', callback);
  deviceQuery.addEventListener('change', callback);

  return () => {
    viewportQuery.removeEventListener('change', callback);
    deviceQuery.removeEventListener('change', callback);
  };
};

const getSnapshot = () => {
  if (typeof window === 'undefined') return false;

  const navigatorWithUserAgentData = window.navigator as Navigator & {
    userAgentData?: {
      mobile?: boolean;
    };
  };
  const isMobileViewport = window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  const isCoarseTouchDevice = window.matchMedia(MOBILE_DEVICE_QUERY).matches;
  const isMobileUserAgent = MOBILE_USER_AGENT_PATTERN.test(navigatorWithUserAgentData.userAgent);
  const isMobileUserAgentData = navigatorWithUserAgentData.userAgentData?.mobile === true;
  const isIpadDesktopMode =
    /Macintosh/i.test(navigatorWithUserAgentData.userAgent) && navigatorWithUserAgentData.maxTouchPoints > 1;

  return isMobileViewport || isCoarseTouchDevice || isMobileUserAgent || isMobileUserAgentData || isIpadDesktopMode;
};

export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
