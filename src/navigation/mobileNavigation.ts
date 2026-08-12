export const OPEN_MOBILE_NAVIGATION_EVENT = 'frayukti:open-mobile-navigation';
export const OPEN_MOBILE_CASHIER_CLOSE_EVENT = 'frayukti:open-mobile-cashier-close';

export const openMobileNavigation = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OPEN_MOBILE_NAVIGATION_EVENT));
};
