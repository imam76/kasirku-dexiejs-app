import { db } from '@/lib/db';
import type { Product, PurchaseCostEstimateSource, PurchaseDocumentItem } from '@/types';
import { getPurchasePrice, normalisasiHargaProduk } from '@/utils/pricing';

export interface ResolveEstimatedPurchaseCostInput {
  product: Product;
  unit: string;
  sourceDocumentId?: string;
  manualPrice?: number;
}

export interface ResolvedEstimatedPurchaseCost {
  price: number;
  source: PurchaseCostEstimateSource;
}

const normalizeFinitePrice = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
};

const normalizeItemPriceToUnit = (
  item: PurchaseDocumentItem,
  product: Product,
  targetUnit: string,
) => {
  const price = normalizeFinitePrice(item.price);
  if (price === undefined) return undefined;

  return normalisasiHargaProduk(price, product, item.unit, targetUnit);
};

export const resolveEstimatedPurchaseCost = async ({
  product,
  unit,
  sourceDocumentId,
  manualPrice,
}: ResolveEstimatedPurchaseCostInput): Promise<ResolvedEstimatedPurchaseCost> => {
  if (sourceDocumentId) {
    const sourceItem = await db.purchaseDocumentItems
      .where('document_id')
      .equals(sourceDocumentId)
      .filter((item) => item.product_id === product.id)
      .first();
    const sourcePrice = sourceItem
      ? normalizeItemPriceToUnit(sourceItem, product, unit)
      : undefined;

    if (sourcePrice !== undefined) {
      return { price: sourcePrice, source: 'LAST_PURCHASE_PRICE' };
    }
  }

  const finalPurchaseDocuments = await db.purchaseDocuments
    .where('type')
    .anyOf(['PURCHASE_RECEIPT', 'PURCHASE_INVOICE'])
    .filter((document) => document.status === 'ISSUED' && (document.cost_status ?? 'FINAL') === 'FINAL')
    .toArray();
  const finalDocumentIds = new Set(finalPurchaseDocuments.map((document) => document.id));
  const lastFinalItem = (await db.purchaseDocumentItems
    .where('product_id')
    .equals(product.id)
    .filter((item) => finalDocumentIds.has(item.document_id) && Number(item.price || 0) > 0)
    .toArray())
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const lastFinalPrice = lastFinalItem
    ? normalizeItemPriceToUnit(lastFinalItem, product, unit)
    : undefined;

  if (lastFinalPrice !== undefined) {
    return { price: lastFinalPrice, source: 'LAST_PURCHASE_PRICE' };
  }

  const productPrice = normalizeFinitePrice(getPurchasePrice(product, unit));
  if (productPrice !== undefined) {
    return { price: productPrice, source: 'PRODUCT_PURCHASE_PRICE' };
  }

  const manual = normalizeFinitePrice(manualPrice);
  if (manual !== undefined) {
    return { price: manual, source: 'MANUAL' };
  }

  return { price: 0, source: 'UNKNOWN' };
};
