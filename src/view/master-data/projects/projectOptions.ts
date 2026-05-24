import type { TranslationKey } from '@/i18n/messages';
import type { ProjectStatus } from '@/types';

export const projectStatusOptions: Array<{ value: ProjectStatus; labelKey: TranslationKey; color: string }> = [
  { value: 'PLANNED', labelKey: 'projects.status.planned', color: 'default' },
  { value: 'ACTIVE', labelKey: 'projects.status.active', color: 'green' },
  { value: 'ON_HOLD', labelKey: 'projects.status.onHold', color: 'orange' },
  { value: 'COMPLETED', labelKey: 'projects.status.completed', color: 'blue' },
  { value: 'CANCELLED', labelKey: 'projects.status.cancelled', color: 'red' },
];
