import type { PurchaseDocumentConfig } from '.';
import { baseBehavior, baseHeaderFields, purchaseTheme, unpricedLineColumns } from './shared';

export const purchaseRequestConfig: PurchaseDocumentConfig = {
  type: 'PURCHASE_REQUEST',
  title: 'Purchase Request',
  titleKey: 'purchaseDocuments.type.purchaseRequest',
  numberPrefix: 'PR',
  theme: purchaseTheme,
  headerFields: [
    ...baseHeaderFields.slice(0, 2),
    { name: 'required_date', labelKey: 'purchaseDocuments.field.requiredDate', type: 'date' },
    ...baseHeaderFields.slice(2),
  ],
  lineItemColumns: unpricedLineColumns,
  summaryFields: [],
  requiredFields: ['document_date'],
  behavior: { ...baseBehavior },
};
