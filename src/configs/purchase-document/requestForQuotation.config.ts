import type { PurchaseDocumentConfig } from '.';
import { baseBehavior, baseHeaderFields, purchaseTheme, unpricedLineColumns } from './shared';

export const requestForQuotationConfig: PurchaseDocumentConfig = {
  type: 'REQUEST_FOR_QUOTATION',
  title: 'Request for Quotation',
  titleKey: 'purchaseDocuments.type.requestForQuotation',
  numberPrefix: 'RFQ',
  theme: {
    ...purchaseTheme,
    accent: '#2563EB',
    accentDark: '#1D4ED8',
    accentSoft: '#DBEAFE',
    accentSubtle: '#EFF6FF',
    accentShadow: 'rgba(37,99,235,.22)',
  },
  headerFields: [
    ...baseHeaderFields.slice(0, 2),
    { name: 'quotation_due_date', labelKey: 'purchaseDocuments.field.quotationDueDate', type: 'date' },
    ...baseHeaderFields.slice(2),
  ],
  lineItemColumns: unpricedLineColumns,
  summaryFields: [],
  requiredFields: ['document_date'],
  behavior: { ...baseBehavior },
};
