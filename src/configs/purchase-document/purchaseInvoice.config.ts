import type { PurchaseDocumentConfig } from '.';
import { baseBehavior, baseHeaderFields, pricedLineColumns, pricedSummaryFields, purchaseTheme } from './shared';

export const purchaseInvoiceConfig: PurchaseDocumentConfig = {
  type: 'PURCHASE_INVOICE',
  title: 'Purchase Invoice',
  titleKey: 'purchaseDocuments.type.purchaseInvoice',
  numberPrefix: 'PI',
  theme: {
    ...purchaseTheme,
    accent: '#BE123C',
    accentDark: '#9F1239',
    accentSoft: '#FFE4E6',
    accentSubtle: '#FFF1F2',
    accentShadow: 'rgba(190,18,60,.22)',
  },
  headerFields: [
    ...baseHeaderFields.slice(0, 2),
    { name: 'due_date', labelKey: 'purchaseDocuments.field.dueDate', type: 'date' },
    { name: 'tax_id', labelKey: 'purchaseDocuments.field.tax', type: 'tax' },
    ...baseHeaderFields.slice(2),
  ],
  lineItemColumns: pricedLineColumns,
  summaryFields: pricedSummaryFields,
  requiredFields: ['document_date'],
  behavior: {
    ...baseBehavior,
    hasPricing: true,
    hasTax: true,
    hasDueDate: true,
    hasPaymentStatus: true,
  },
};
