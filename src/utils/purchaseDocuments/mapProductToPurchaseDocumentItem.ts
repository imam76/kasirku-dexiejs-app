import type { Product, PurchaseDocumentItem } from '@/types';
import { getPurchasePrice } from '@/utils/pricing';

export const mapProductToPurchaseDocumentItem = (
  product: Product,
  documentId: string,
): PurchaseDocumentItem => {
  const unit = product.purchase_unit || 'pcs';

  return {
    id: crypto.randomUUID(),
    document_id: documentId,
    product_id: product.id,
    product_name: product.name,
    sku: product.sku,
    unit,
    quantity: 1,
    price: getPurchasePrice(product, unit),
    discount_type: 'fixed',
    discount_value: 0,
    discount_amount: 0,
    created_at: new Date().toISOString(),
  };
};
