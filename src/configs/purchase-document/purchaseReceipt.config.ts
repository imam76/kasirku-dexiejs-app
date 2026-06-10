import type { PurchaseDocumentConfig } from '.';
import { baseBehavior, baseHeaderFields, pricedLineColumns, pricedSummaryFields, purchaseTheme } from './shared';

export const purchaseReceiptConfig: PurchaseDocumentConfig = {
  type: 'PURCHASE_RECEIPT',
  title: 'Purchase Receipt',
  titleKey: 'purchaseDocuments.type.purchaseReceipt',
  numberPrefix: 'GR',
  theme: {
    ...purchaseTheme,
    accent: '#D97706',
    accentDark: '#B45309',
    accentSoft: '#FEF3C7',
    accentSubtle: '#FFFBEB',
    accentShadow: 'rgba(217,119,6,.22)',
  },
  headerFields: [
    ...baseHeaderFields.slice(0, 3),
    { name: 'delivery_note_number', labelKey: 'purchaseDocuments.field.deliveryNoteNumber', type: 'text' },
    { name: 'delivery_note_date', labelKey: 'purchaseDocuments.field.deliveryNoteDate', type: 'date' },
    { name: 'cost_status', labelKey: 'purchaseDocuments.field.costStatus', type: 'costStatus' },
    { name: 'tax_id', labelKey: 'purchaseDocuments.field.tax', type: 'tax' },
    ...baseHeaderFields.slice(3),
  ],
  lineItemColumns: [
    ...pricedLineColumns.slice(0, 2),
    { name: 'received_quantity', labelKey: 'purchaseDocuments.field.receivedQuantity', editable: true },
    ...pricedLineColumns.slice(2),
  ],
  summaryFields: pricedSummaryFields,
  requiredFields: ['document_date'],
  behavior: {
    ...baseBehavior,
    affectsStock: true,
    hasPricing: true,
    hasTax: true,
  },
};
