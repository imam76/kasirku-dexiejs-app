import { db } from '@/lib/db';
import type { InventoryLotConsumptionSourceType, PurchaseCostStatus } from '@/types';

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export interface FifoConsumedLot {
  lotId: string;
  productId?: string;
  productName?: string;
  quantityConsumed: number;
  costPerUnit: number;
  costStatus: PurchaseCostStatus;
}

export interface FifoConsumeResult {
  /** Total HPP cost for all consumed quantity */
  totalCost: number;
  /** Weighted average HPP per unit (totalCost / quantityNeeded).
   *  Use this as purchase_price on TransactionItem. */
  weightedAvgCostPerUnit: number;
  /** Detail of which lots were consumed and by how much */
  consumedLots: FifoConsumedLot[];
}

export interface ConsumeFifoLotsOptions {
  sourceType?: InventoryLotConsumptionSourceType;
  sourceId?: string;
  sourceLineId?: string;
  createdAt?: string;
}

/**
 * Consumes inventory lots for a product using FIFO (oldest lot first).
 * Reduces `quantity_remaining` on consumed lots.
 *
 * Must be called inside a Dexie transaction that includes db.inventoryLots.
 *
 * Fallback: if available lots are insufficient (data inconsistency),
 * the remaining quantity is covered using the last known lot's cost_per_unit
 * to prevent errors without silently zeroing out HPP.
 *
 * @param productId - The product whose lots to consume
 * @param quantityNeeded - Amount to consume, in the product's purchase_unit
 * @returns FifoConsumeResult with totalCost and per-lot breakdown
 */
export const consumeFifoLots = async (
  productId: string,
  quantityNeeded: number,
  options: ConsumeFifoLotsOptions = {},
): Promise<FifoConsumeResult> => {
  if (quantityNeeded <= 0) {
    return { totalCost: 0, weightedAvgCostPerUnit: 0, consumedLots: [] };
  }

  // Fetch all lots with remaining stock for this product, sorted oldest first (FIFO)
  const lots = await db.inventoryLots
    .where('product_id')
    .equals(productId)
    .filter((lot) => lot.quantity_remaining > 0)
    .toArray();

  // Sort by received_at ascending so oldest lot is consumed first
  lots.sort((a, b) => a.received_at.localeCompare(b.received_at));

  let remaining = quantityNeeded;
  let totalCost = 0;
  const consumedLots: FifoConsumedLot[] = [];
  const now = new Date().toISOString();

  for (const lot of lots) {
    if (remaining <= 0) break;

    const costStatus = lot.cost_status ?? 'FINAL';
    if (costStatus === 'PENDING') {
      throw new Error(`Stok ${lot.product_name} belum memiliki harga beli dan tidak boleh dijual.`);
    }

    const consume = Math.min(lot.quantity_remaining, remaining);
    const lotCost = roundCurrency(consume * lot.cost_per_unit);

    totalCost += lotCost;
    remaining -= consume;
    consumedLots.push({
      lotId: lot.id,
      productId: lot.product_id,
      productName: lot.product_name,
      quantityConsumed: consume,
      costPerUnit: lot.cost_per_unit,
      costStatus,
    });

    await db.inventoryLots.update(lot.id, {
      quantity_remaining: lot.quantity_remaining - consume,
      updated_at: now,
    });

    if (options.sourceType && options.sourceId && options.sourceLineId) {
      await db.inventoryLotConsumptions.add({
        id: crypto.randomUUID(),
        lot_id: lot.id,
        product_id: lot.product_id,
        product_name: lot.product_name,
        source_type: options.sourceType,
        source_id: options.sourceId,
        source_line_id: options.sourceLineId,
        quantity: consume,
        cost_per_unit_at_consumption: lot.cost_per_unit,
        cost_status_at_consumption: costStatus,
        created_at: options.createdAt ?? now,
      });
    }
  }

  // Fallback: lots were insufficient (data gap). Use last known cost to cover remainder.
  if (remaining > 0) {
    const fallbackCost = lots.length > 0
      ? lots[lots.length - 1].cost_per_unit
      : 0;
    const fallbackTotal = roundCurrency(remaining * fallbackCost);

    totalCost += fallbackTotal;
    if (fallbackCost > 0) {
      // Record it as if we consumed from the last lot (no lot to update — already exhausted)
      consumedLots.push({
        lotId: 'fallback',
        productId,
        quantityConsumed: remaining,
        costPerUnit: fallbackCost,
        costStatus: 'FINAL',
      });
    }
    // remaining is now 0 conceptually — we accepted the gap
  }

  const totalCostRounded = roundCurrency(totalCost);
  const weightedAvgCostPerUnit = quantityNeeded > 0
    ? roundCurrency(totalCostRounded / quantityNeeded)
    : 0;

  return { totalCost: totalCostRounded, weightedAvgCostPerUnit, consumedLots };
};
