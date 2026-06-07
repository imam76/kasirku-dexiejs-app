import type { PurchaseDocumentStatus, PurchaseInvoicePaymentStatus } from '@/types';
import type { TranslationKey } from '@/i18n/messages';

export const purchaseDocumentStatusLabelKeys: Record<PurchaseDocumentStatus, TranslationKey> = {
  DRAFT: 'purchaseDocuments.status.draft',
  ISSUED: 'purchaseDocuments.status.issued',
  CONVERTED: 'purchaseDocuments.status.converted',
  VOIDED: 'purchaseDocuments.status.voided',
};

export const purchaseInvoicePaymentStatusLabelKeys: Record<PurchaseInvoicePaymentStatus, TranslationKey> = {
  UNPAID: 'purchaseDocuments.paymentStatus.unpaid',
  PARTIAL: 'purchaseDocuments.paymentStatus.partial',
  PAID: 'purchaseDocuments.paymentStatus.paid',
};
