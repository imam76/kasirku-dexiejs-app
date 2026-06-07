import { db } from '@/lib/db';
import type { InventoryLot, InventoryLotSourceType } from '@/types';

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
    received_at: input.receivedAt,
    created_at: now,
    updated_at: now,
  };

  await db.inventoryLots.add(lot);
  return lot;
};
