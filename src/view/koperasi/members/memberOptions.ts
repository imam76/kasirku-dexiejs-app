import type { CooperativeMemberStatus } from '@/types';
import type { TranslationKey } from '@/i18n/messages';

export const cooperativeMemberStatusOptions: Array<{
  value: CooperativeMemberStatus;
  labelKey: TranslationKey;
  color: string;
}> = [
  { value: 'ACTIVE', labelKey: 'cooperative.members.status.active', color: 'green' },
  { value: 'INACTIVE', labelKey: 'cooperative.members.status.inactive', color: 'default' },
  { value: 'SUSPENDED', labelKey: 'cooperative.members.status.suspended', color: 'orange' },
];
