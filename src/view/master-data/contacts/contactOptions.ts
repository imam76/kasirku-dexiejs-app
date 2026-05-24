import type { TranslationKey } from '@/i18n/messages';
import type { ContactType } from '@/types';

export const contactTypeOptions: Array<{ value: ContactType; labelKey: TranslationKey; color: string }> = [
  { value: 'CUSTOMER', labelKey: 'contacts.type.customer', color: 'green' },
  { value: 'SUPPLIER', labelKey: 'contacts.type.supplier', color: 'blue' },
  { value: 'CUSTOMER_SUPPLIER', labelKey: 'contacts.type.customerSupplier', color: 'purple' },
  { value: 'OTHER', labelKey: 'contacts.type.other', color: 'default' },
];
