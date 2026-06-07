import type { Product, PurchaseDocumentItem } from '@/types';
import { konversiSatuanProduk } from '@/utils/pricing';

export const getPurchaseReceiptStockQuantity = (
  item: PurchaseDocumentItem,
  product: Product,
) => {
  const quantity = Number(item.received_quantity ?? item.quantity ?? 0);
  return konversiSatuanProduk(quantity, product, item.unit, product.purchase_unit);
};
