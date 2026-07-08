import type { TranslationKey } from '@/i18n/messages';
import type { TaxCalculationMode, TaxFlow } from '@/types';

export const taxCalculationModeOptions: Array<{ value: TaxCalculationMode; labelKey: TranslationKey; color: string }> = [
  { value: 'EXCLUSIVE', labelKey: 'taxes.mode.exclusive', color: 'blue' },
  { value: 'INCLUSIVE', labelKey: 'taxes.mode.inclusive', color: 'purple' },
];

export const taxFlowOptions: Array<{ value: TaxFlow; labelKey: TranslationKey; color: string }> = [
  { value: 'ADDITIVE', labelKey: 'taxes.flow.additive', color: 'green' },
  { value: 'WITHHOLDING', labelKey: 'taxes.flow.withholding', color: 'red' },
];
