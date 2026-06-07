import type { TranslationKey } from '@/i18n/messages';
import type {
  SalesDocumentStatus,
  SalesDocumentType,
  SalesInvoicePaymentStatus,
  TaxCalculationMode,
} from '@/types';

export const salesDocumentTypeLabelKeys = {
  SALES_QUOTATION: 'salesDocuments.type.salesQuotation',
  SALES_ORDER: 'salesDocuments.type.salesOrder',
  SALES_DELIVERY: 'salesDocuments.type.salesDelivery',
  SALES_INVOICE: 'salesDocuments.type.salesInvoice',
} satisfies Record<SalesDocumentType, TranslationKey>;

export const salesDocumentStatusLabelKeys = {
  DRAFT: 'salesDocuments.status.draft',
  ISSUED: 'salesDocuments.status.issued',
  CONVERTED: 'salesDocuments.status.converted',
  VOIDED: 'salesDocuments.status.voided',
} satisfies Record<SalesDocumentStatus, TranslationKey>;

export const salesInvoicePaymentStatusLabelKeys = {
  UNPAID: 'salesDocuments.paymentStatus.unpaid',
  PARTIAL: 'salesDocuments.paymentStatus.partial',
  PAID: 'salesDocuments.paymentStatus.paid',
} satisfies Record<SalesInvoicePaymentStatus, TranslationKey>;

export const taxCalculationModeLabelKeys = {
  EXCLUSIVE: 'taxes.mode.exclusive',
  INCLUSIVE: 'taxes.mode.inclusive',
} satisfies Record<TaxCalculationMode, TranslationKey>;
