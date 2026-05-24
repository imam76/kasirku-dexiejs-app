import type { SalesDocumentItem } from '@/types';

export const createEmptySalesDocumentItem = (documentId: string): SalesDocumentItem => ({
  id: crypto.randomUUID(),
  document_id: documentId,
  product_id: '',
  product_name: '',
  unit: '',
  quantity: 1,
  ordered_quantity: 1,
  delivered_quantity: 1,
  price: 0,
  discount_type: 'fixed',
  discount_value: 0,
  discount_amount: 0,
  subtotal: 0,
  created_at: new Date().toISOString(),
});
