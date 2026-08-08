import type { InventoryLot, InventoryLotConsumption } from '@/types';
import type { KasirkuDB } from '../../KasirkuDB';

/**
 * inventoryLots/inventoryLotConsumptions had no cross-device sync before (see
 * inventory_lot_repository.rs - new this migration). Mark every existing row pending so the
 * next Sync DB run uploads lots/consumptions that until now only lived in this device's Dexie.
 */
export function registerMigrationV115(db: KasirkuDB) {
  db.version(115).stores({
    inventoryLots: 'id, product_id, quantity_remaining, cost_status, received_at, source_type, source_id, source_line_id, created_at, updated_at, sync_status',
    inventoryLotConsumptions: 'id, lot_id, product_id, source_type, source_id, source_line_id, created_at, sync_status',
  }).upgrade(async (tx) => {
    const lotTable = tx.table<InventoryLot, string>('inventoryLots');
    const lots = await lotTable.toArray();
    const lotsToMark = lots
      .filter((lot) => !lot.sync_status)
      .map((lot) => ({ ...lot, sync_status: 'pending' as const, sync_error: undefined }));
    if (lotsToMark.length > 0) {
      await lotTable.bulkPut(lotsToMark);
    }

    const consumptionTable = tx.table<InventoryLotConsumption, string>('inventoryLotConsumptions');
    const consumptions = await consumptionTable.toArray();
    const consumptionsToMark = consumptions
      .filter((consumption) => !consumption.sync_status)
      .map((consumption) => ({ ...consumption, sync_status: 'pending' as const, sync_error: undefined }));
    if (consumptionsToMark.length > 0) {
      await consumptionTable.bulkPut(consumptionsToMark);
    }
  });
}
