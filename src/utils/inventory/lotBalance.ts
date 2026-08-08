import { db } from '@/lib/db';
import type { InventoryLot } from '@/types';

/**
 * Derives true remaining stock per lot from the local consumption ledger instead of trusting
 * each lot's stored `quantity_remaining` field. That field is only ever decremented by the
 * device that consumes from it and is never corrected by a pull from another device (see
 * inventoryLotReadService's merge logic), so it goes permanently stale once another device
 * consumes from the same lot. `inventoryLotConsumptions` rows sync down from every device via
 * the regular delta pull, so summing them locally gives an eventually-consistent view.
 *
 * Only valid for lots whose `quantity_remaining` moves purely through FIFO consumption. Do not
 * use this for opening-balance lots, whose remaining quantity is set by an explicit reset that
 * has no corresponding consumption row.
 */
export const computeLotRemainingBalances = async (
  lots: Pick<InventoryLot, 'id' | 'quantity_received'>[],
): Promise<Map<string, number>> => {
  const remainingByLotId = new Map<string, number>();
  if (lots.length === 0) return remainingByLotId;

  const lotIds = lots.map((lot) => lot.id);
  const consumptions = await db.inventoryLotConsumptions.where('lot_id').anyOf(lotIds).toArray();

  const consumedByLotId = new Map<string, number>();
  for (const consumption of consumptions) {
    consumedByLotId.set(
      consumption.lot_id,
      (consumedByLotId.get(consumption.lot_id) ?? 0) + Number(consumption.quantity || 0),
    );
  }

  for (const lot of lots) {
    remainingByLotId.set(lot.id, lot.quantity_received - (consumedByLotId.get(lot.id) ?? 0));
  }

  return remainingByLotId;
};
