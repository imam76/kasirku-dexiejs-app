import { db } from '@/lib/db';
import type { InventoryLot, InventoryLotSourceType, PurchaseCostEstimateSource, PurchaseCostStatus } from '@/types';

export interface AddInventoryLotInput {
  productId: string;
  productName: string;
  sku?: string;
  sourceType: InventoryLotSourceType;
  sourceId?: string;
  sourceLineId?: string;
  /** Quantity in product's purchase_unit */
  quantityReceived: number;
  /** HPP per purchase_unit */
  costPerUnit: number;
  costStatus?: PurchaseCostStatus;
  estimateSource?: PurchaseCostEstimateSource;
  /** ISO timestamp — determines FIFO order (oldest first) */
  receivedAt: string;
}

/**
 * Creates a new inventory lot when stock is added (purchase, receipt, void restore, restock).
 * Must be called inside a Dexie transaction that includes db.inventoryLots.
 */
export const addInventoryLot = async (input: AddInventoryLotInput): Promise<InventoryLot> => {
  const now = new Date().toISOString();
  const lot: InventoryLot = {
    id: crypto.randomUUID(),
    product_id: input.productId,
    product_name: input.productName,
    sku: input.sku,
    source_type: input.sourceType,
    source_id: input.sourceId,
    source_line_id: input.sourceLineId,
    quantity_received: input.quantityReceived,
    quantity_remaining: input.quantityReceived,
    cost_per_unit: input.costPerUnit,
    cost_status: input.costStatus ?? 'FINAL',
    estimate_source: input.estimateSource,
    estimated_cost_per_unit: input.costStatus === 'ESTIMATED' ? input.costPerUnit : undefined,
    final_cost_per_unit: (input.costStatus ?? 'FINAL') === 'FINAL' ? input.costPerUnit : undefined,
    received_at: input.receivedAt,
    created_at: now,
    updated_at: now,
  };

  await db.inventoryLots.add(lot);
  return lot;
};
