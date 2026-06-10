import type { PurchaseDocumentType } from '@/types';
import type { TranslationKey } from '@/i18n/messages';
import { purchaseInvoiceConfig } from './purchaseInvoice.config';
import { purchaseOrderConfig } from './purchaseOrder.config';
import { purchaseReceiptConfig } from './purchaseReceipt.config';
import { purchaseRequestConfig } from './purchaseRequest.config';
import { purchaseReturnConfig } from './purchaseReturn.config';
import { requestForQuotationConfig } from './requestForQuotation.config';

export type PurchaseDocumentFieldType =
  | 'contact'
  | 'text'
  | 'date'
  | 'textarea'
  | 'tax'
  | 'department'
  | 'project'
  | 'warehouse'
  | 'paymentStatus'
  | 'costStatus';

export interface PurchaseDocumentFieldConfig {
  name: string;
  labelKey: TranslationKey;
  type: PurchaseDocumentFieldType;
  required?: boolean;
}

export interface PurchaseDocumentLineColumnConfig {
  name: string;
  labelKey: TranslationKey;
  editable?: boolean;
}

export interface PurchaseDocumentSummaryFieldConfig {
  name: string;
  labelKey: TranslationKey;
}

export interface PurchaseDocumentThemeConfig {
  accent: string;
  accentDark: string;
  accentSoft: string;
  accentSubtle: string;
  accentShadow: string;
}

export interface PurchaseDocumentConfig {
  type: PurchaseDocumentType;
  title: string;
  titleKey: TranslationKey;
  numberPrefix: string;
  theme: PurchaseDocumentThemeConfig;
  headerFields: PurchaseDocumentFieldConfig[];
  lineItemColumns: PurchaseDocumentLineColumnConfig[];
  summaryFields: PurchaseDocumentSummaryFieldConfig[];
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

export const purchaseDocumentConfigs = {
  PURCHASE_REQUEST: purchaseRequestConfig,
  REQUEST_FOR_QUOTATION: requestForQuotationConfig,
  PURCHASE_ORDER: purchaseOrderConfig,
  PURCHASE_RECEIPT: purchaseReceiptConfig,
  PURCHASE_INVOICE: purchaseInvoiceConfig,
  PURCHASE_RETURN: purchaseReturnConfig,
} satisfies Record<PurchaseDocumentType, PurchaseDocumentConfig>;

export const getPurchaseDocumentConfig = (type: PurchaseDocumentType) => purchaseDocumentConfigs[type];

export const PURCHASE_DOCUMENT_TYPE_OPTIONS = [
  { value: 'PURCHASE_REQUEST', labelKey: 'purchaseDocuments.type.purchaseRequest', slug: 'pr' },
  { value: 'REQUEST_FOR_QUOTATION', labelKey: 'purchaseDocuments.type.requestForQuotation', slug: 'rfq' },
  { value: 'PURCHASE_ORDER', labelKey: 'purchaseDocuments.type.purchaseOrder', slug: 'po' },
  { value: 'PURCHASE_RECEIPT', labelKey: 'purchaseDocuments.type.purchaseReceipt', slug: 'gr' },
  { value: 'PURCHASE_INVOICE', labelKey: 'purchaseDocuments.type.purchaseInvoice', slug: 'pi' },
  { value: 'PURCHASE_RETURN', labelKey: 'purchaseDocuments.type.purchaseReturn', slug: 'pret' },
] satisfies Array<{ value: PurchaseDocumentType; labelKey: TranslationKey; slug: string }>;

export const getPurchaseDocumentTypePathSegment = (type: PurchaseDocumentType) => (
  PURCHASE_DOCUMENT_TYPE_OPTIONS.find((option) => option.value === type)?.slug ?? type
);

export const getPurchaseDocumentTypeFromPathSegment = (pathSegment: string): PurchaseDocumentType | undefined => {
  const normalizedType = pathSegment.trim().toUpperCase();

  if (normalizedType in purchaseDocumentConfigs) {
    return normalizedType as PurchaseDocumentType;
  }

  const normalizedSlug = pathSegment.trim().toLowerCase();
  return PURCHASE_DOCUMENT_TYPE_OPTIONS.find((option) => option.slug === normalizedSlug)?.value;
};
