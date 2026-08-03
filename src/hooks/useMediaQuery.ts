import { useCallback, useSyncExternalStore } from 'react';

const matchesQuery = (query: string) => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia(query).matches
);

export function useMediaQuery(query: string) {
  const subscribe = useCallback((callback: () => void) => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};

    const mediaQuery = window.matchMedia(query);
    mediaQuery.addEventListener('change', callback);
    return () => mediaQuery.removeEventListener('change', callback);
  }, [query]);

  const getSnapshot = useCallback(() => matchesQuery(query), [query]);
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
