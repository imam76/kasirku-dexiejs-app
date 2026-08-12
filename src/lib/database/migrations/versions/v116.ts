import type { PurchaseCostReconciliation, PurchaseCostReconciliationItem } from '@/types';
import type { KasirkuDB } from '../../KasirkuDB';

/**
 * purchaseCostReconciliations/purchaseCostReconciliationItems had no cross-device sync before
 * (see purchase_cost_reconciliation_repository.rs - new this migration). Mark every existing row
 * pending so the next Sync DB run uploads reconciliation history that until now only lived in
 * this device's Dexie, same precedent as v115 for inventoryLots/inventoryLotConsumptions.
 */
export function registerMigrationV116(db: KasirkuDB) {
  db.version(116).stores({
    purchaseCostReconciliations: 'id, purchase_document_id, supplier_invoice_number, created_at, sync_status',
    purchaseCostReconciliationItems: 'id, reconciliation_id, purchase_document_item_id, product_id, sync_status',
  }).upgrade(async (tx) => {
    const reconciliationTable = tx.table<PurchaseCostReconciliation, string>('purchaseCostReconciliations');
    const reconciliations = await reconciliationTable.toArray();
    const reconciliationsToMark = reconciliations
      .filter((reconciliation) => !reconciliation.sync_status)
      .map((reconciliation) => ({ ...reconciliation, sync_status: 'pending' as const, sync_error: undefined }));
    if (reconciliationsToMark.length > 0) {
      await reconciliationTable.bulkPut(reconciliationsToMark);
    }

    const itemTable = tx.table<PurchaseCostReconciliationItem, string>('purchaseCostReconciliationItems');
    const items = await itemTable.toArray();
    const itemsToMark = items
      .filter((item) => !item.sync_status)
      .map((item) => ({ ...item, sync_status: 'pending' as const, sync_error: undefined }));
    if (itemsToMark.length > 0) {
      await itemTable.bulkPut(itemsToMark);
    }
  });
}
