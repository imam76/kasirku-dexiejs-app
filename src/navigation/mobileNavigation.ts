export const OPEN_MOBILE_NAVIGATION_EVENT = 'frayukti:open-mobile-navigation';

export const openMobileNavigation = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OPEN_MOBILE_NAVIGATION_EVENT));
};
