import type { SalesDocumentConfig } from './index';

export const salesDeliveryConfig: SalesDocumentConfig = {
  type: 'SALES_DELIVERY',
  title: 'Sales Delivery',
  titleKey: 'salesDocuments.type.salesDelivery',
  numberPrefix: 'SD',
  theme: {
    accent: '#059669',
    accentDark: '#047857',
    accentSoft: '#D1FAE5',
    accentSubtle: '#ECFDF5',
    accentShadow: 'rgba(5, 150, 105, .28)',
  },
  headerFields: [
    { name: 'contact_id', labelKey: 'salesDocuments.field.customer', type: 'contact' },
    { name: 'customer_name', labelKey: 'salesDocuments.field.customerName', type: 'text', required: true },
    { name: 'document_date', labelKey: 'salesDocuments.field.documentDate', type: 'date', required: true },
    { name: 'warehouse_name', labelKey: 'salesDocuments.field.warehouse', type: 'text' },
    { name: 'department_id', labelKey: 'salesDocuments.field.department', type: 'department' },
    { name: 'project_id', labelKey: 'salesDocuments.field.project', type: 'project' },
    { name: 'notes', labelKey: 'salesDocuments.field.notes', type: 'textarea' },
  ],
  lineItemColumns: [
    { name: 'product_id', labelKey: 'salesDocuments.field.product' },
    { name: 'ordered_quantity', labelKey: 'salesDocuments.field.orderedQuantity', editable: true },
    { name: 'delivered_quantity', labelKey: 'salesDocuments.field.deliveredQuantity', editable: true },
    { name: 'unit', labelKey: 'salesDocuments.field.unit', editable: true },
  ],
  summaryFields: [],
  requiredFields: ['customer_name', 'document_date'],
  behavior: {
    affectsStock: true,
    hasPricing: false,
    hasTax: false,
    hasDueDate: false,
    hasPaymentStatus: false,
    validateStock: true,
    allowContactPicker: true,
    allowDepartmentPicker: true,
    allowProjectPicker: true,
  },
};
