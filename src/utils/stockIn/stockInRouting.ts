import type { OpeningBalanceBatch } from '@/types';
import type { StockInMode } from '@/utils/stockIn/stockInCsv';

/**
 * Why the opening-balance route is unavailable for a date. The screen turns
 * these into plain sentences; nothing here is shown to the user verbatim.
 */
export type StockInOpeningBlocker =
  | 'NO_CUTOFF'
  | 'BATCH_POSTED'
  | 'BATCH_LOCKED';

export interface StockInRoutingInput {
  /** Document date the user typed, `YYYY-MM-DD`. */
  documentDate: string;
  /** Cutoff from the accounting setup, or undefined when setup is unfinished. */
  cutoffDate?: string;
  /** Existing INVENTORY batch for that cutoff, if any. */
  openingBatch?: Pick<OpeningBalanceBatch, 'status'>;
  /** True when the user knows the final price for every line. */
  hasFinalPrice: boolean;
}

export interface StockInRouting {
  mode: StockInMode;
  /** Document the purchase route will produce. Undefined on the opening route. */
  purchaseDocumentType?: 'PURCHASE_INVOICE' | 'PURCHASE_RECEIPT';
  /** Set when the date points at the opening route but it cannot be used. */
  openingBlocker?: StockInOpeningBlocker;
  /** True when the date fell before the cutoff but had to be routed forward. */
  redirectedFromOpening: boolean;
}

const toDateOnly = (value: string) => value.slice(0, 10);

/**
 * Decides which route a stock-in document takes. The user never picks this: the
 * date decides the side of the cutoff, and whether the price is known decides
 * whether the purchase side can post its journal straight away.
 *
 * When the date belongs to the opening side but that route is closed, the
 * document is routed forward to a purchase rather than silently failing. The
 * screen must say so, because the accounting result differs: a purchase credits
 * Hutang Usaha where an opening balance credits Ekuitas Saldo Awal.
 */
export const resolveStockInRouting = ({
  documentDate,
  cutoffDate,
  openingBatch,
  hasFinalPrice,
}: StockInRoutingInput): StockInRouting => {
  const purchaseRouting = (openingBlocker?: StockInOpeningBlocker, redirected = false): StockInRouting => ({
    mode: 'PURCHASE',
    purchaseDocumentType: hasFinalPrice ? 'PURCHASE_INVOICE' : 'PURCHASE_RECEIPT',
    openingBlocker,
    redirectedFromOpening: redirected,
  });

  if (!cutoffDate) {
    // No accounting baseline yet, so there is no opening side to fall on.
    return purchaseRouting('NO_CUTOFF');
  }

  const isOnOrBeforeCutoff = toDateOnly(documentDate) <= toDateOnly(cutoffDate);
  if (!isOnOrBeforeCutoff) {
    return purchaseRouting();
  }

  if (openingBatch?.status === 'POSTED') {
    return purchaseRouting('BATCH_POSTED', true);
  }
  if (
    openingBatch
    && openingBatch.status !== 'DRAFT'
    && openingBatch.status !== 'VALIDATED'
  ) {
    return purchaseRouting('BATCH_LOCKED', true);
  }

  return {
    mode: 'OPENING',
    redirectedFromOpening: false,
  };
};
