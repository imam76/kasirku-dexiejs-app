import type { TranslationKey } from '@/i18n/messages';
import type { TaxCalculationMode } from '@/types';

export const taxCalculationModeOptions: Array<{ value: TaxCalculationMode; labelKey: TranslationKey; color: string }> = [
  { value: 'EXCLUSIVE', labelKey: 'taxes.mode.exclusive', color: 'blue' },
  { value: 'INCLUSIVE', labelKey: 'taxes.mode.inclusive', color: 'purple' },
];
