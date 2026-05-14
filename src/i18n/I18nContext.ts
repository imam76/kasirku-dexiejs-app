import { createContext } from 'react';
import { defaultLocale, translate, type Locale, type TranslationKey, type TranslationParams } from '@/i18n/messages';

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

export const I18nContext = createContext<I18nContextValue>({
  locale: defaultLocale,
  setLocale: () => { },
  toggleLocale: () => { },
  t: (key, params) => translate(defaultLocale, key, params),
});
