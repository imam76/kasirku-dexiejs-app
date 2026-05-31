import type { PurchaseDocumentConfig } from '.';
import { baseBehavior, baseHeaderFields, pricedLineColumns, pricedSummaryFields, purchaseTheme } from './shared';

export const purchaseOrderConfig: PurchaseDocumentConfig = {
  type: 'PURCHASE_ORDER',
  title: 'Purchase Order',
  titleKey: 'purchaseDocuments.type.purchaseOrder',
  numberPrefix: 'PO',
  theme: {
    ...purchaseTheme,
    accent: '#7C3AED',
    accentDark: '#6D28D9',
    accentSoft: '#EDE9FE',
    accentSubtle: '#F5F3FF',
    accentShadow: 'rgba(124,58,237,.22)',
  },
  headerFields: [
    ...baseHeaderFields.slice(0, 3),
    { name: 'tax_id', labelKey: 'purchaseDocuments.field.tax', type: 'tax' },
    ...baseHeaderFields.slice(3),
  ],
  lineItemColumns: pricedLineColumns,
  summaryFields: pricedSummaryFields,
  requiredFields: ['document_date'],
  behavior: {
    ...baseBehavior,
    hasPricing: true,
    hasTax: true,
  },
};
