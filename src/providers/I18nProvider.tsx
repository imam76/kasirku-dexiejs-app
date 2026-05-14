import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { I18nContext, type I18nContextValue } from '@/i18n/I18nContext';
import { defaultLocale, supportedLocales, translate, type Locale } from '@/i18n/messages';
import dayjs from '@/lib/dayjs';

const STORAGE_KEY = 'kasirku-locale';

const isLocale = (value: string | null): value is Locale => {
  return supportedLocales.includes(value as Locale);
};

interface I18nProviderProps {
  children: ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === 'undefined') {
      dayjs.locale(defaultLocale);
      return defaultLocale;
    }

    const saved = localStorage.getItem(STORAGE_KEY);
    const initialLocale = isLocale(saved) ? saved : defaultLocale;
    dayjs.locale(initialLocale);
    return initialLocale;
  });

  const setLocale = useCallback((nextLocale: Locale) => {
    dayjs.locale(nextLocale);
    setLocaleState(nextLocale);
  }, []);

  const toggleLocale = useCallback(() => {
    setLocaleState((currentLocale) => {
      const nextLocale = currentLocale === 'id' ? 'en' : 'id';
      dayjs.locale(nextLocale);
      return nextLocale;
    });
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale,
    toggleLocale,
    t: (key, params) => translate(locale, key, params),
  }), [locale, setLocale, toggleLocale]);

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}
