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
  | 'paymentStatus';

export interface SalesDocumentFieldConfig {
  name: string;
  labelKey: TranslationKey;
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
  { value: 'SALES_QUOTATION', labelKey: 'salesDocuments.type.salesQuotation' },
  { value: 'SALES_ORDER', labelKey: 'salesDocuments.type.salesOrder' },
  { value: 'SALES_DELIVERY', labelKey: 'salesDocuments.type.salesDelivery' },
  { value: 'SALES_INVOICE', labelKey: 'salesDocuments.type.salesInvoice' },
] satisfies Array<{ value: SalesDocumentType; labelKey: TranslationKey }>;
