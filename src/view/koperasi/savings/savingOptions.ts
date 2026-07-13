import type { CooperativeSavingTransactionStatus, CooperativeSavingTransactionType, CooperativeSavingType } from '@/types';
import type { TranslationKey } from '@/i18n/messages';

export const cooperativeSavingTypeOptions: Array<{
  value: CooperativeSavingType;
  labelKey: TranslationKey;
  color: string;
}> = [
  { value: 'POKOK', labelKey: 'cooperative.savings.type.pokok', color: 'blue' },
  { value: 'WAJIB', labelKey: 'cooperative.savings.type.wajib', color: 'purple' },
  { value: 'SUKARELA', labelKey: 'cooperative.savings.type.sukarela', color: 'green' },
];

export const cooperativeSavingTransactionTypeOptions: Array<{
  value: Exclude<CooperativeSavingTransactionType, 'REVERSAL'>;
  labelKey: TranslationKey;
  color: string;
}> = [
  { value: 'DEPOSIT', labelKey: 'cooperative.savings.transactionType.deposit', color: 'green' },
  { value: 'WITHDRAWAL', labelKey: 'cooperative.savings.transactionType.withdrawal', color: 'red' },
  { value: 'OPENING_BALANCE', labelKey: 'cooperative.savings.transactionType.openingBalance', color: 'blue' },
];

export const cooperativeSavingStatusOptions: Array<{
  value: CooperativeSavingTransactionStatus;
  labelKey: TranslationKey;
  color: string;
}> = [
  { value: 'POSTED', labelKey: 'cooperative.savings.status.posted', color: 'green' },
  { value: 'REVERSED', labelKey: 'cooperative.savings.status.reversed', color: 'red' },
];
