import type { SalesDocumentConfig } from './index';

export const salesDeliveryConfig: SalesDocumentConfig = {
  type: 'SALES_DELIVERY',
  title: 'Sales Delivery',
  numberPrefix: 'SD',
  headerFields: [
    { name: 'contact_id', label: 'Customer', type: 'contact' },
    { name: 'customer_name', label: 'Nama Customer', type: 'text', required: true },
    { name: 'document_date', label: 'Tanggal Dokumen', type: 'date', required: true },
    { name: 'warehouse_name', label: 'Gudang', type: 'text' },
    { name: 'department_id', label: 'Department', type: 'department' },
    { name: 'project_id', label: 'Project', type: 'project' },
    { name: 'notes', label: 'Catatan', type: 'textarea' },
  ],
  lineItemColumns: [
    { name: 'product_id', label: 'Produk' },
    { name: 'ordered_quantity', label: 'Qty Order', editable: true },
    { name: 'delivered_quantity', label: 'Qty Kirim', editable: true },
    { name: 'unit', label: 'Unit', editable: true },
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
