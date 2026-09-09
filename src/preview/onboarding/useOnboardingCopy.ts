import { useI18n } from '@/hooks/useI18n';
import type { OnboardingCopyKey } from '@/i18n/onboardingMessages';
import type { TranslationParams } from '@/i18n/messages';

export function useOnboardingCopy() {
  const { t, locale } = useI18n();
  return {
    copy: (key: OnboardingCopyKey, params?: TranslationParams) => t(`onboarding.${key}`, params),
    money: (amount: number) => new Intl.NumberFormat(locale === 'id' ? 'id-ID' : 'en-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount),
    date: (value: string) => new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)),
  };
}
