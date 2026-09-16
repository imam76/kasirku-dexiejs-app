import Dexie, { type DBCore, type DBCoreMutateRequest, type DBCoreTransaction } from 'dexie';
import type { InventoryLot, InventoryLotConsumption, Product, SyncQueueItem } from '@/types';
import {
  emptySyncQueueSummary, getSyncQueuePriority, toPosCatalogProduct,
  toProductListCatalogProduct, toProductSearchCatalogProduct, withFifoBalance,
  type InventoryConsumptionTotal, type PosCatalogCount, type PosCatalogProduct,
  type ProductListCatalogProduct, type ProductSearchCatalogProduct, type SyncQueueSummary,
} from './checkoutReadModels';

type SourceRow = InventoryLot | InventoryLotConsumption | Product | SyncQueueItem;
const dependencies: Record<string, string[]> = {
  syncQueue: ['syncQueueSummary'],
  inventoryLots: ['inventoryConsumptionTotals'],
  inventoryLotConsumptions: ['inventoryConsumptionTotals', 'inventoryLots'],
  products: ['posProductCatalog', 'posCatalogCounts', 'productListCatalog', 'productSearchCatalog'],
};

/**
 * Maintain local read models in the SAME native IndexedDB transaction as their source.
 * Covers checkout, remote merges, bulk restore, modify/delete and metadata updates alike.
 * Extending the native scope here avoids requiring every caller to know derived stores.
 * The migration rebuilds these stores explicitly; versionchange transactions bypass this.
 */
export function registerCheckoutReadModels(db: Dexie) {
  db.use({
    stack: 'dbcore', name: 'checkout-read-models', level: 1.5,
    create(down: DBCore): DBCore {
      if (!down.schema.tables.some((table) => table.name === 'syncQueueSummary')) return down;
      const pending = new WeakMap<DBCoreTransaction, Promise<unknown>>();

      // Use Dexie promise chains here (including implicit single-table transactions).
      // Native async continuations in middleware lose Dexie's transaction zone.
      const put = (name: string, trans: DBCoreTransaction, values: unknown[]) => {
        if (!values.length) return Dexie.Promise.resolve();
        return down.table(name).mutate({ type: 'put', trans, values }).then((result) => {
          if (result.numFailures) throw Object.values(result.failures)[0];
        });
      };
      const remove = (name: string, trans: DBCoreTransaction, keys: string[]) => {
        if (!keys.length) return Dexie.Promise.resolve();
        return down.table(name).mutate({ type: 'delete', trans, keys }).then((result) => {
          if (result.numFailures) throw Object.values(result.failures)[0];
        });
      };

      const refreshLots = (trans: DBCoreTransaction, keys: string[]) => {
        if (!keys.length) return Dexie.Promise.resolve();
        return Dexie.Promise.all([
          down.table('inventoryLots').getMany({ trans, keys }),
          down.table('inventoryConsumptionTotals').getMany({ trans, keys }),
        ]).then(([lots, totals]: [(InventoryLot | undefined)[], (InventoryConsumptionTotal | undefined)[]]) => {
          const changed: InventoryLot[] = [];
          lots.forEach((lot, index) => {
            if (!lot) return;
            const next = withFifoBalance(lot, totals[index]?.quantity ?? 0);
            if (lot.fifo_remaining !== next.fifo_remaining || lot.fifo_available !== next.fifo_available) changed.push(next);
          });
          return put('inventoryLots', trans, changed);
        });
      };

      const applyChanges = (name: string, trans: DBCoreTransaction, keys: string[],
        before: (SourceRow | undefined)[], after: (SourceRow | undefined)[]): Promise<unknown> => {
        if (name === 'syncQueue') {
          const delta = emptySyncQueueSummary().counts;
          before.forEach((row) => { if (row) delta[(row as SyncQueueItem).status]--; });
          after.forEach((row) => { if (row) delta[(row as SyncQueueItem).status]++; });
          const updateSummary = Object.values(delta).some((value) => value !== 0)
            ? down.table('syncQueueSummary').get({ trans, key: 'current' }).then((stored: SyncQueueSummary | undefined) => {
              const summary = stored ?? emptySyncQueueSummary();
              for (const status of Object.keys(delta) as (keyof typeof delta)[]) summary.counts[status] += delta[status];
              return put('syncQueueSummary', trans, [summary]);
            }) : Dexie.Promise.resolve();
          const changed = (after as (SyncQueueItem | undefined)[]).flatMap((row) => (
            row && row.queue_priority !== getSyncQueuePriority(row)
              ? [{ ...row, queue_priority: getSyncQueuePriority(row) }] : []
          ));
          return updateSummary.then(() => put('syncQueue', trans, changed));
        } else if (name === 'inventoryLotConsumptions') {
          const delta = new Map<string, number>();
          const add = (rows: (SourceRow | undefined)[], sign: number) => rows.forEach((row) => {
            if (!row) return;
            const consumption = row as InventoryLotConsumption;
            delta.set(consumption.lot_id, (delta.get(consumption.lot_id) ?? 0) + sign * Number(consumption.quantity || 0));
          });
          add(before, -1);
          add(after, 1);
          const lotIds = [...delta.keys()].filter((id) => delta.get(id) !== 0);
          return down.table('inventoryConsumptionTotals').getMany({ trans, keys: lotIds })
            .then((totals: (InventoryConsumptionTotal | undefined)[]) => put('inventoryConsumptionTotals', trans, lotIds.map((lot_id, index) => ({
              lot_id, quantity: (totals[index]?.quantity ?? 0) + delta.get(lot_id)!,
            })))).then(() => refreshLots(trans, lotIds));
        } else if (name === 'inventoryLots') {
          return refreshLots(trans, keys);
        } else if (name === 'products') {
          const changedPosRows: PosCatalogProduct[] = [];
          const deletedPosRows: string[] = [];
          const changedListRows: ProductListCatalogProduct[] = [];
          const deletedListRows: string[] = [];
          const changedSearchRows: ProductSearchCatalogProduct[] = [];
          const deletedSearchRows: string[] = [];
          const delta = new Map<string, number>();
          keys.forEach((id, index) => {
            const oldProduct = before[index] as Product | undefined;
            const nextProduct = after[index] as Product | undefined;
            const oldPosRow = oldProduct ? toPosCatalogProduct(oldProduct) : undefined;
            const nextPosRow = nextProduct ? toPosCatalogProduct(nextProduct) : undefined;
            const oldListRow = oldProduct ? toProductListCatalogProduct(oldProduct) : undefined;
            const nextListRow = nextProduct ? toProductListCatalogProduct(nextProduct) : undefined;
            const oldSearchRow = oldProduct ? toProductSearchCatalogProduct(oldProduct) : undefined;
            const nextSearchRow = nextProduct ? toProductSearchCatalogProduct(nextProduct) : undefined;

            if (JSON.stringify(oldListRow) !== JSON.stringify(nextListRow)) {
              if (nextListRow) changedListRows.push(nextListRow); else deletedListRows.push(id);
            }
            if (JSON.stringify(oldSearchRow) !== JSON.stringify(nextSearchRow)) {
              if (nextSearchRow) changedSearchRows.push(nextSearchRow); else deletedSearchRows.push(id);
            }
            if (JSON.stringify(oldPosRow) === JSON.stringify(nextPosRow)) return;
            if (nextPosRow) changedPosRows.push(nextPosRow); else deletedPosRows.push(id);
            if (oldPosRow) delta.set(oldPosRow.category, (delta.get(oldPosRow.category) ?? 0) - 1);
            if (nextPosRow) delta.set(nextPosRow.category, (delta.get(nextPosRow.category) ?? 0) + 1);
          });
          const categories = [...delta.keys()].filter((category) => delta.get(category) !== 0);
          return put('productListCatalog', trans, changedListRows)
            .then(() => remove('productListCatalog', trans, deletedListRows))
            .then(() => put('productSearchCatalog', trans, changedSearchRows))
            .then(() => remove('productSearchCatalog', trans, deletedSearchRows))
            .then(() => put('posProductCatalog', trans, changedPosRows))
            .then(() => remove('posProductCatalog', trans, deletedPosRows))
            .then(() => down.table('posCatalogCounts').getMany({ trans, keys: categories }))
            .then((counts: (PosCatalogCount | undefined)[]) => put('posCatalogCounts', trans, categories.map((category, index) => ({
              category, count: (counts[index]?.count ?? 0) + delta.get(category)!,
            })).filter((row) => row.count > 0)).then(() => remove('posCatalogCounts', trans, categories.filter((category, index) => (
              (counts[index]?.count ?? 0) + delta.get(category)! <= 0
            )))));
        }
        return Dexie.Promise.resolve();
      };

      const maintain = (name: string, request: DBCoreMutateRequest) => {
        const table = down.table(name);
        const trans = request.trans;
        let keys: string[];
        let readBefore: Promise<(SourceRow | undefined)[]>;
        if (request.type === 'deleteRange') {
          // Clear/restore is allowed to scan once; normal checkout only visits touched keys.
          readBefore = table.query({ trans, values: true, query: {
            index: table.schema.primaryKey, range: request.range,
          } }).then(({ result }) => { keys = result.map((row: SourceRow) => row.id); return result; });
        } else {
          keys = [...new Set<string>(request.keys ?? (
            request.type === 'delete' ? [] : request.values.map((row: SourceRow) => row.id)
          ))];
          readBefore = table.getMany({ trans, keys });
        }
        return readBefore.then((before) => table.mutate(request).then((result) => (
          // Actual final rows handle duplicate IDs and caught partial bulk failures.
          table.getMany({ trans, keys }).then((after) => applyChanges(name, trans, keys, before, after))
            .then(() => result)
        )));
      };

      return {
        ...down,
        transaction(stores, mode, options) {
          const expanded = mode === 'readwrite'
            ? [...new Set(stores.flatMap((name) => [name, ...(dependencies[name] ?? [])]))] : stores;
          return down.transaction(expanded, mode, options);
        },
        table(name) {
          const table = down.table(name);
          if (!dependencies[name]) return table;
          return {
            ...table,
            mutate(request) {
              if ((request.trans as IDBTransaction).mode === 'versionchange') return table.mutate(request);
              // Serialize source writes within each native transaction so concurrent
              // bulk operations cannot overwrite another operation's summary delta.
              const previous = pending.get(request.trans);
              const operation = previous
                ? previous.then(() => maintain(name, request)) : maintain(name, request);
              pending.set(request.trans, operation);
              return operation.catch((error) => {
                request.trans.abort();
                throw error;
              });
            },
          };
        },
      };
    },
  });
}
