import type { KasirkuDB } from '../../KasirkuDB';
import { emptySyncQueueSummary, getSyncQueuePriority, toPosCatalogProduct, withFifoBalance } from '../../checkoutReadModels';
import type { InventoryLot, InventoryLotConsumption, Product, SyncQueueItem } from '@/types';
import type { PosCatalogProduct } from '../../checkoutReadModels';

export function registerMigrationV134(db: KasirkuDB) {
  db.version(134).stores({
    syncQueue: 'id, entity, entity_id, operation, status, created_at, updated_at, [status+updated_at], [status+queue_priority+created_at+id]',
    syncQueueSummary: 'id',
    inventoryConsumptionTotals: 'lot_id',
    inventoryLots: 'id, product_id, quantity_remaining, cost_status, received_at, source_type, source_id, source_line_id, created_at, updated_at, sync_status, [product_id+fifo_available+received_at+id]',
    posProductCatalog: 'id, name, normalized_sku, category, [category+name]',
    posCatalogCounts: 'category',
    cashierSessions: 'id, session_number, status, cashier_user_id, opened_at, closed_at, balance_status, sync_status, created_at, updated_at, [cashier_user_id+status]',
    restaurantSessions: 'id, &session_number, status, operator_user_id, opened_at, closed_at, balance_status, created_at, updated_at, [operator_user_id+status]',
  }).upgrade(async (tx) => {
    // One-time rebuild in the schema transaction: never expose a partially built balance.
    // Stream history; retained memory is per lot/category, not per transaction or payload.
    const totals = new Map<string, number>();
    await tx.table<InventoryLotConsumption>('inventoryLotConsumptions').each((row) => {
      totals.set(row.lot_id, (totals.get(row.lot_id) ?? 0) + Number(row.quantity || 0));
    });
    const entries = [...totals];
    for (let offset = 0; offset < entries.length; offset += 1000) {
      await tx.table('inventoryConsumptionTotals').bulkPut(entries.slice(offset, offset + 1000)
        .map(([lot_id, quantity]) => ({ lot_id, quantity })));
    }
    await tx.table<InventoryLot>('inventoryLots').toCollection().modify((lot) => {
      Object.assign(lot, withFifoBalance(lot, totals.get(lot.id) ?? 0));
    });
    const summary = emptySyncQueueSummary();
    await tx.table<SyncQueueItem>('syncQueue').toCollection().modify((row) => {
      summary.counts[row.status]++;
      row.queue_priority = getSyncQueuePriority(row);
    });
    await tx.table('syncQueueSummary').put(summary);

    const counts = new Map<string, number>();
    let lastId: string | undefined;
    while (true) {
      const products: Product[] = await (lastId === undefined
        ? tx.table<Product>('products').orderBy('id')
        : tx.table<Product>('products').where('id').above(lastId)).limit(1000).toArray();
      if (!products.length) break;
      const catalog = products.map(toPosCatalogProduct).filter((row): row is PosCatalogProduct => !!row);
      catalog.forEach((row) => counts.set(row.category, (counts.get(row.category) ?? 0) + 1));
      await tx.table('posProductCatalog').bulkPut(catalog);
      lastId = products[products.length - 1].id;
    }
    await tx.table('posCatalogCounts').bulkPut([...counts].map(([category, count]) => ({ category, count })));
  });
}
