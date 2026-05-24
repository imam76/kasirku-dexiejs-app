import type { SalesDocumentConfig } from './index';

export const salesQuotationConfig: SalesDocumentConfig = {
  type: 'SALES_QUOTATION',
  title: 'Sales Quotation',
  numberPrefix: 'SQ',
  headerFields: [
    { name: 'contact_id', label: 'Customer', type: 'contact' },
    { name: 'customer_name', label: 'Nama Customer', type: 'text', required: true },
    { name: 'document_date', label: 'Tanggal Dokumen', type: 'date', required: true },
    { name: 'expired_at', label: 'Berlaku Sampai', type: 'date' },
    { name: 'tax_id', label: 'Pajak', type: 'tax' },
    { name: 'department_id', label: 'Department', type: 'department' },
    { name: 'project_id', label: 'Project', type: 'project' },
    { name: 'notes', label: 'Catatan', type: 'textarea' },
  ],
  lineItemColumns: [
    { name: 'product_id', label: 'Produk' },
    { name: 'quantity', label: 'Qty', editable: true },
    { name: 'unit', label: 'Unit', editable: true },
    { name: 'price', label: 'Harga', editable: true },
    { name: 'discount_amount', label: 'Diskon', editable: true },
    { name: 'subtotal', label: 'Subtotal' },
  ],
  summaryFields: [
    { name: 'subtotal_amount', label: 'Subtotal' },
    { name: 'discount_amount', label: 'Diskon Dokumen' },
    { name: 'tax_amount', label: 'Pajak' },
    { name: 'total_amount', label: 'Total' },
  ],
  requiredFields: ['customer_name', 'document_date'],
  behavior: {
    affectsStock: false,
    hasPricing: true,
    hasTax: true,
    hasDueDate: false,
    hasPaymentStatus: false,
    validateStock: false,
    allowContactPicker: true,
    allowDepartmentPicker: true,
    allowProjectPicker: true,
  },
};
