import { db } from '@/lib/db';
import type { InventoryLot } from '@/types';

/** Read ledger-derived balances without replaying consumption history. */
export const computeLotRemainingBalances = async (
  lots: Pick<InventoryLot, 'id' | 'quantity_received'>[],
): Promise<Map<string, number>> => {
  const current = await db.inventoryLots.bulkGet(lots.map((lot) => lot.id));
  return new Map(current.flatMap((lot) => lot ? [[lot.id, lot.fifo_remaining ?? 0] as const] : []));
};
