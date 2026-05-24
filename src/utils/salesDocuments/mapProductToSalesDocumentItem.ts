import type { Product, SalesDocumentItem } from '@/types';
import { getPrice, normalisasiHargaProduk } from '@/utils/pricing';

export const mapProductToSalesDocumentItem = (
  product: Product,
  documentId: string,
): SalesDocumentItem => {
  const unit = product.selling_unit;
  const price = getPrice(product, 1, unit);

  return {
    id: crypto.randomUUID(),
    document_id: documentId,
    product_id: product.id,
    product_name: product.name,
    sku: product.sku,
    unit,
    quantity: 1,
    ordered_quantity: 1,
    delivered_quantity: 1,
    price,
    discount_type: 'fixed',
    discount_value: 0,
    discount_amount: 0,
    subtotal: price,
    purchase_price: normalisasiHargaProduk(product.purchase_price, product, product.purchase_unit, unit),
    created_at: new Date().toISOString(),
  };
};
