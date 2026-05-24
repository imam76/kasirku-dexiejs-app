import type { SalesDocumentType } from '@/types';
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
  label: string;
  type: SalesDocumentFieldType;
  required?: boolean;
}

export interface SalesDocumentLineColumnConfig {
  name: string;
  label: string;
  editable?: boolean;
}

export interface SalesDocumentSummaryFieldConfig {
  name: string;
  label: string;
}

export interface SalesDocumentConfig {
  type: SalesDocumentType;
  title: string;
  numberPrefix: string;
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
  { value: 'SALES_QUOTATION', label: 'Quotation' },
  { value: 'SALES_ORDER', label: 'Order' },
  { value: 'SALES_DELIVERY', label: 'Delivery' },
  { value: 'SALES_INVOICE', label: 'Invoice' },
] satisfies Array<{ value: SalesDocumentType; label: string }>;
