import type { PurchaseDocumentConfig } from '.';

export const purchaseTheme = {
  accent: '#0F766E',
  accentDark: '#115E59',
  accentSoft: '#CCFBF1',
  accentSubtle: '#F0FDFA',
  accentShadow: 'rgba(15,118,110,.25)',
};

export const baseHeaderFields: PurchaseDocumentConfig['headerFields'] = [
  { name: 'contact_id', labelKey: 'purchaseDocuments.field.supplier', type: 'contact' },
  { name: 'document_date', labelKey: 'purchaseDocuments.field.documentDate', type: 'date', required: true },
  { name: 'warehouse_id', labelKey: 'purchaseDocuments.field.warehouse', type: 'warehouse' },
  { name: 'department_id', labelKey: 'purchaseDocuments.field.department', type: 'department' },
  { name: 'project_id', labelKey: 'purchaseDocuments.field.project', type: 'project' },
  { name: 'notes', labelKey: 'purchaseDocuments.field.notes', type: 'textarea' },
];

export const pricedLineColumns: PurchaseDocumentConfig['lineItemColumns'] = [
  { name: 'product_id', labelKey: 'purchaseDocuments.field.product', editable: true },
  { name: 'quantity', labelKey: 'purchaseDocuments.field.quantity', editable: true },
  { name: 'unit', labelKey: 'purchaseDocuments.field.unit', editable: true },
  { name: 'price', labelKey: 'purchaseDocuments.field.price', editable: true },
  { name: 'discount', labelKey: 'purchaseDocuments.field.discount', editable: true },
  { name: 'subtotal', labelKey: 'purchaseDocuments.field.subtotal' },
];

export const unpricedLineColumns: PurchaseDocumentConfig['lineItemColumns'] = [
  { name: 'product_id', labelKey: 'purchaseDocuments.field.product', editable: true },
  { name: 'quantity', labelKey: 'purchaseDocuments.field.quantity', editable: true },
  { name: 'unit', labelKey: 'purchaseDocuments.field.unit', editable: true },
];

export const pricedSummaryFields: PurchaseDocumentConfig['summaryFields'] = [
  { name: 'subtotal_amount', labelKey: 'purchaseDocuments.field.subtotal' },
  { name: 'discount_amount', labelKey: 'purchaseDocuments.field.documentDiscount' },
  { name: 'tax_amount', labelKey: 'purchaseDocuments.field.tax' },
  { name: 'total_amount', labelKey: 'purchaseDocuments.field.total' },
];

export const baseBehavior = {
  affectsStock: false,
  hasPricing: false,
  hasTax: false,
  hasDueDate: false,
  hasPaymentStatus: false,
  validateStock: false,
  allowContactPicker: true,
  allowDepartmentPicker: true,
  allowProjectPicker: true,
};
