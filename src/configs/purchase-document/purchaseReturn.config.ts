import type { PurchaseDocumentConfig } from '.';
import { baseBehavior, baseHeaderFields, pricedLineColumns, pricedSummaryFields, purchaseTheme } from './shared';

export const purchaseReturnConfig: PurchaseDocumentConfig = {
  type: 'PURCHASE_RETURN',
  title: 'Purchase Return',
  titleKey: 'purchaseDocuments.type.purchaseReturn',
  numberPrefix: 'PRT',
  theme: {
    ...purchaseTheme,
    accent: '#C2410C',
    accentDark: '#9A3412',
    accentSoft: '#FFEDD5',
    accentSubtle: '#FFF7ED',
    accentShadow: 'rgba(194,65,12,.22)',
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
    affectsStock: true,
    hasPricing: true,
    hasTax: true,
  },
};
