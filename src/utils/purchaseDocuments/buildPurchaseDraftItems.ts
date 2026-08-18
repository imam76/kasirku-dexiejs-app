import type { PurchaseDocumentConfig } from '@/configs/purchase-document';
import type { PurchaseDraftLine } from '@/store/purchaseDraftStore';
import type { Product, PurchaseDocumentItem } from '@/types';
import {
  applyCurrencySnapshotToLineItem,
  type DocumentCurrencySnapshot,
} from '@/utils/documentCurrency';
import { resolveProductMinStock } from '@/utils/stockStatus';
import { mapProductToPurchaseDocumentItem } from './mapProductToPurchaseDocumentItem';

/**
 * Kekurangan sampai ambang stok menipis, karena itulah angka yang sedang
 * dilihat user saat memilih. Produk yang stoknya masih aman jatuh ke 1.
 */
export const resolveRestockQuantity = (product: Pick<Product, 'stock' | 'min_stock'>): number => (
  Math.max(Math.ceil(resolveProductMinStock(product) - product.stock), 1)
);

export const buildPurchaseDraftLines = (products: Product[]): PurchaseDraftLine[] => (
  products.map((product) => ({
    product_id: product.id,
    quantity: resolveRestockQuantity(product),
  }))
);

/**
 * Baris hasil prefill harus identik dengan baris yang dipilih manual di form,
 * jadi pemetaan produk dan snapshot mata uangnya memakai helper yang sama.
 */
export const buildPurchaseDraftItems = (
  lines: PurchaseDraftLine[],
  productsById: Map<string, Product>,
  documentId: string,
  config: PurchaseDocumentConfig,
  currencySnapshot: DocumentCurrencySnapshot,
): PurchaseDocumentItem[] => lines.flatMap((line) => {
  const product = productsById.get(line.product_id);
  if (!product) return [];

  const item = mapProductToPurchaseDocumentItem(product, documentId);
  const quantity = line.quantity > 0 ? line.quantity : 1;
  const isReceipt = config.type === 'PURCHASE_RECEIPT';

  return [applyCurrencySnapshotToLineItem({
    ...item,
    quantity,
    ordered_quantity: isReceipt ? quantity : undefined,
    received_quantity: isReceipt ? quantity : undefined,
    price: config.behavior.hasPricing ? item.price : undefined,
  }, currencySnapshot)];
});
