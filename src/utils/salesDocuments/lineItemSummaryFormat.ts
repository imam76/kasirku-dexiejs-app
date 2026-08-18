import type { SalesDocumentItem } from '@/types';
import {
  formatDocumentCurrencyAmount,
  toDocumentCurrencyAmount,
  type DocumentCurrencySnapshot,
} from '@/utils/documentCurrency';

export type LineItemQuantitySummaryInput = Pick<
  SalesDocumentItem,
  'quantity' | 'unit' | 'ordered_quantity' | 'delivered_quantity' | 'subtotal'
>;

/** "Produk × qty unit → subtotal" — satu baris ringkasan dipakai card composer (editable) dan halaman detail (read-only). */
export const formatLineItemQuantitySummary = (
  item: LineItemQuantitySummaryInput,
  options: { isSalesDelivery: boolean; hasPricing: boolean },
  documentCurrencySnapshot: DocumentCurrencySnapshot,
): string => {
  if (options.isSalesDelivery) {
    return `${item.delivered_quantity ?? 0}/${item.ordered_quantity ?? 0} ${item.unit ?? ''}`.trim();
  }

  if (options.hasPricing) {
    const subtotal = formatDocumentCurrencyAmount(
      toDocumentCurrencyAmount(item.subtotal, documentCurrencySnapshot),
      documentCurrencySnapshot,
    );
    return `${item.quantity ?? 0} ${item.unit ?? ''} → ${subtotal}`;
  }

  return `${item.quantity ?? 0} ${item.unit ?? ''}`.trim();
};
