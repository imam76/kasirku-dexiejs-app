import type { CooperativeLoanInstallmentStatus, CooperativeLoanStatus } from '@/types';
import type { TranslationKey } from '@/i18n/messages';

export const cooperativeLoanStatusOptions: Array<{
  value: CooperativeLoanStatus;
  labelKey: TranslationKey;
  color: string;
}> = [
  { value: 'DRAFT', labelKey: 'cooperative.loans.status.draft', color: 'default' },
  { value: 'SUBMITTED', labelKey: 'cooperative.loans.status.submitted', color: 'blue' },
  { value: 'APPROVED', labelKey: 'cooperative.loans.status.approved', color: 'green' },
  { value: 'REJECTED', labelKey: 'cooperative.loans.status.rejected', color: 'red' },
  { value: 'DISBURSED', labelKey: 'cooperative.loans.status.disbursed', color: 'purple' },
  { value: 'PAID_OFF', labelKey: 'cooperative.loans.status.paidOff', color: 'cyan' },
  { value: 'REVERSED', labelKey: 'cooperative.loans.status.reversed', color: 'orange' },
];

export const cooperativeLoanInstallmentStatusOptions: Array<{
  value: CooperativeLoanInstallmentStatus;
  labelKey: TranslationKey;
  color: string;
}> = [
  { value: 'UNPAID', labelKey: 'cooperative.loans.installmentStatus.unpaid', color: 'default' },
  { value: 'PARTIAL', labelKey: 'cooperative.loans.installmentStatus.partial', color: 'blue' },
  { value: 'PAID', labelKey: 'cooperative.loans.installmentStatus.paid', color: 'green' },
  { value: 'OVERDUE', labelKey: 'cooperative.loans.installmentStatus.overdue', color: 'red' },
];
