import type { SalesDocumentFieldConfig } from '@/configs/sales-document';

export const splitHeaderFieldsByGroup = (fields: SalesDocumentFieldConfig[]) => ({
  core: fields.filter((field) => (field.group ?? 'core') === 'core'),
  advanced: fields.filter((field) => field.group === 'advanced'),
});
