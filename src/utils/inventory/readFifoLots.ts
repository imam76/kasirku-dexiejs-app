import Dexie from 'dexie';
import { db } from '@/lib/db';
import type { InventoryLot } from '@/types';

/** Reads only available lots, stopping once the requested quantity is covered. */
export async function readFifoLots(productId: string, quantityNeeded: number): Promise<InventoryLot[]> {
  if (quantityNeeded <= 0) return [];
  const lots: InventoryLot[] = [];
  let remaining = quantityNeeded;
  let cursor: [string, number, string, string] | undefined;
  while (remaining > 0) {
    const batch = await db.inventoryLots.where('[product_id+fifo_available+received_at+id]')
      .between(cursor ?? [productId, 1, Dexie.minKey, Dexie.minKey],
        [productId, 1, Dexie.maxKey, Dexie.maxKey], !cursor, true)
      .limit(32).toArray();
    if (!batch.length) break;
    for (const lot of batch) {
      lots.push(lot);
      remaining -= lot.fifo_remaining ?? 0;
      if (remaining <= 0) break;
    }
    const last = batch[batch.length - 1];
    cursor = [productId, 1, last.received_at, last.id];
  }
  return lots;
}
