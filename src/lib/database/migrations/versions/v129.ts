import type { InventoryLot, InventoryLotConsumption, SyncQueueItem } from '@/types';
import type { KasirkuDB } from '../../KasirkuDB';

/**
 * Opening-balance and legacy-backup paths could create inventory lot ledger
 * records after v115 without sync metadata. Recover those rows so the normal
 * pending-entity scan uploads every parent lot before its consumptions.
 */
export function registerMigrationV129(db: KasirkuDB) {
  db.version(129).stores({}).upgrade(async (migration) => {
    await migration.table<InventoryLot>('inventoryLots').toCollection().modify((lot) => {
      if (!lot.sync_status) {
        lot.sync_status = 'pending';
        lot.sync_error = undefined;
      }
    });

    await migration
      .table<InventoryLotConsumption>('inventoryLotConsumptions')
      .toCollection()
      .modify((consumption) => {
        if (!consumption.sync_status) {
          consumption.sync_status = 'pending';
          consumption.sync_error = undefined;
        }
      });

    const recoveryAt = new Date().toISOString();
    await migration
      .table<SyncQueueItem>('syncQueue')
      .where('entity')
      .equals('inventoryLotConsumptions')
      .and((queueItem) => queueItem.status === 'failed')
      .modify((queueItem) => {
        queueItem.status = 'pending';
        queueItem.error_message = undefined;
        queueItem.updated_at = recoveryAt;
      });
  });
}
