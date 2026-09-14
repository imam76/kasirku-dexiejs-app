import type { InventoryLot, Product, SyncQueueItem, SyncQueueStatus } from '@/types';
import { isProductVisibleInPos } from '@/utils/productAvailability';

export interface SyncQueueSummary {
  id: 'current';
  counts: Record<SyncQueueStatus, number>;
}

export const emptySyncQueueSummary = (): SyncQueueSummary => ({
  id: 'current', counts: { pending: 0, processing: 0, synced: 0, failed: 0 },
});

export interface InventoryConsumptionTotal {
  lot_id: string;
  quantity: number;
}

// Only catalog fields: stock, prices and sync metadata must not invalidate catalog searches.
export interface PosCatalogProduct {
  id: string;
  name: string;
  sku: string;
  normalized_sku: string;
  category: string;
}

export interface PosCatalogCount {
  category: string;
  count: number;
}

export const toPosCatalogProduct = (product: Product): PosCatalogProduct | undefined => (
  isProductVisibleInPos(product) ? {
    id: product.id, name: product.name, sku: product.sku || '',
    normalized_sku: (product.sku || '').trim().toLowerCase(),
    category: product.category || 'non_consumable',
  } : undefined
);

export const getSyncQueuePriority = (item: Pick<SyncQueueItem, 'entity'>): number => {
  switch (item.entity) {
    case 'products': return 0;
    case 'inventoryOpeningBalancePostings': return 2;
    case 'generalLedgerSetting': return 3;
    case 'inventoryLotConsumptions': return 4;
    default: return 1;
  }
};

export const withFifoBalance = (lot: InventoryLot, consumed: number): InventoryLot => {
  const remaining = lot.fifo_excluded ? 0
    : Number(lot.quantity_received) - consumed - (lot.fifo_untracked_consumed ?? 0);
  return { ...lot, fifo_remaining: remaining, fifo_available: remaining > 0 ? 1 : 0 };
};
