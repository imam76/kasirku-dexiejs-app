import type { PurchaseDocumentItem } from '@/types';

export const createEmptyPurchaseDocumentItem = (documentId: string): PurchaseDocumentItem => ({
  id: crypto.randomUUID(),
  document_id: documentId,
  product_id: '',
  product_name: '',
  unit: 'pcs',
  quantity: 1,
  price: 0,
  discount_type: 'fixed',
  discount_value: 0,
  discount_amount: 0,
  created_at: new Date().toISOString(),
});
