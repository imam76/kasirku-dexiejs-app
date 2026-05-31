import type { Product, PurchaseDocumentItem } from '@/types';

export const mapProductToPurchaseDocumentItem = (
  product: Product,
  documentId: string,
): PurchaseDocumentItem => ({
  id: crypto.randomUUID(),
  document_id: documentId,
  product_id: product.id,
  product_name: product.name,
  sku: product.sku,
  unit: product.purchase_unit || 'pcs',
  quantity: 1,
  price: Number(product.purchase_price || 0),
  discount_type: 'fixed',
  discount_value: 0,
  discount_amount: 0,
  created_at: new Date().toISOString(),
});
