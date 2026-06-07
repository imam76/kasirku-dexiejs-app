import type { SalesDocumentType } from '@/types';
import type { TranslationKey } from '@/i18n/messages';
import { salesDeliveryConfig } from './salesDelivery.config';
import { salesInvoiceConfig } from './salesInvoice.config';
import { salesOrderConfig } from './salesOrder.config';
import { salesQuotationConfig } from './salesQuotation.config';

export type SalesDocumentFieldType =
  | 'contact'
  | 'text'
  | 'date'
  | 'textarea'
  | 'tax'
  | 'department'
  | 'project'
  | 'warehouse'
  | 'paymentStatus';

export interface SalesDocumentFieldConfig {
  name: string;
  labelKey: TranslationKey;
  helperKey?: TranslationKey;
  type: SalesDocumentFieldType;
  required?: boolean;
}

export interface SalesDocumentLineColumnConfig {
  name: string;
  labelKey: TranslationKey;
  editable?: boolean;
}

export interface SalesDocumentSummaryFieldConfig {
  name: string;
  labelKey: TranslationKey;
}

export interface SalesDocumentThemeConfig {
  accent: string;
  accentDark: string;
  accentSoft: string;
  accentSubtle: string;
  accentShadow: string;
}

export interface SalesDocumentConfig {
  type: SalesDocumentType;
  title: string;
  titleKey: TranslationKey;
  numberPrefix: string;
  theme: SalesDocumentThemeConfig;
  headerFields: SalesDocumentFieldConfig[];
  lineItemColumns: SalesDocumentLineColumnConfig[];
  summaryFields: SalesDocumentSummaryFieldConfig[];
  requiredFields: string[];
  behavior: {
    affectsStock: boolean;
    hasPricing: boolean;
    hasTax: boolean;
    hasDueDate: boolean;
    hasPaymentStatus: boolean;
    validateStock: boolean;
    allowContactPicker: boolean;
    allowDepartmentPicker: boolean;
    allowProjectPicker: boolean;
  };
}

export const salesDocumentConfigs = {
  SALES_QUOTATION: salesQuotationConfig,
  SALES_ORDER: salesOrderConfig,
  SALES_DELIVERY: salesDeliveryConfig,
  SALES_INVOICE: salesInvoiceConfig,
} satisfies Record<SalesDocumentType, SalesDocumentConfig>;

export const getSalesDocumentConfig = (type: SalesDocumentType) => salesDocumentConfigs[type];

export const SALES_DOCUMENT_TYPE_OPTIONS = [
  { value: 'SALES_QUOTATION', labelKey: 'salesDocuments.type.salesQuotation', slug: 'sq' },
  { value: 'SALES_ORDER', labelKey: 'salesDocuments.type.salesOrder', slug: 'so' },
  { value: 'SALES_DELIVERY', labelKey: 'salesDocuments.type.salesDelivery', slug: 'sd' },
  { value: 'SALES_INVOICE', labelKey: 'salesDocuments.type.salesInvoice', slug: 'si' },
] satisfies Array<{ value: SalesDocumentType; labelKey: TranslationKey; slug: string }>;

export const getSalesDocumentTypePathSegment = (type: SalesDocumentType) => (
  SALES_DOCUMENT_TYPE_OPTIONS.find((option) => option.value === type)?.slug ?? type
);

export const getSalesDocumentTypeFromPathSegment = (pathSegment: string): SalesDocumentType | undefined => {
  const normalizedType = pathSegment.trim().toUpperCase();

  if (normalizedType in salesDocumentConfigs) {
    return normalizedType as SalesDocumentType;
  }

  const normalizedSlug = pathSegment.trim().toLowerCase();
  return SALES_DOCUMENT_TYPE_OPTIONS.find((option) => option.slug === normalizedSlug)?.value;
};
