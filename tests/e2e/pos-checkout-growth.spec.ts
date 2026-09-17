import { expect, test, type Page } from '@playwright/test';

async function openDatabase(page: Page) {
  await page.route('**/__pos-growth-test__', (route) => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>POS growth tests</title>',
  }));
  await page.goto('/__pos-growth-test__');
  await page.evaluate(async () => { const { db } = await import('/src/lib/db.ts'); await db.open(); });
}

test('queue summary stays exact across concurrent writes, duplicates, partial failures, deletes and aborts', async ({ page }) => {
  await openDatabase(page);
  const result = await page.evaluate(async () => {
    const { db, KasirkuDB } = await import('/src/lib/db.ts');
    const { readSyncStatusSnapshot } = await import('/src/services/syncStatusReadService.ts');
    const { readPendingSyncQueueBatch } = await import('/src/services/pendingSyncQueueReadService.ts');
    const row = (id, entity = 'transactions', status = 'pending') => ({
      id, entity, entity_id: id, status, payload: {}, operation: 'create', attempts: 0,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    });
    const mismatches = [];
    const check = async (stage) => {
      const counts = { pending: 0, processing: 0, synced: 0, failed: 0 };
      (await db.syncQueue.toArray()).forEach((item) => counts[item.status]++);
      if (JSON.stringify(counts) !== JSON.stringify((await readSyncStatusSnapshot()).counts)) mismatches.push(stage);
    };
    await db.transaction('rw', db.syncQueue, async () => {
      await Promise.all([db.syncQueue.add(row('a')), db.syncQueue.add(row('b'))]);
      await db.syncQueue.bulkPut([row('a', 'products', 'synced'), row('a', 'products', 'failed')]);
      try { await db.syncQueue.bulkAdd([row('b'), row('c')]); } catch { /* commit successful rows */ }
    });
    await check('partial failure');
    const peer = new KasirkuDB();
    await peer.open();
    try { await Promise.all([peer.syncQueue.add(row('peer')), db.syncQueue.add(row('local'))]); }
    finally { peer.close(); }
    await check('second connection');
    const beforeAbort = await readSyncStatusSnapshot();
    try {
      await db.transaction('rw', db.syncQueue, async () => {
        await db.syncQueue.clear();
        await db.syncQueue.add(row('aborted'));
        throw new Error('abort');
      });
    } catch { /* expected */ }
    const afterAbort = await readSyncStatusSnapshot();
    await db.syncQueue.where('status').equals('pending').modify({ status: 'processing' });
    await db.syncQueue.where('status').equals('failed').delete();
    await db.syncQueue.bulkDelete(['c', 'peer', 'missing']);
    await check('modify and delete');
    await db.syncQueue.clear();
    await check('clear');
    await db.syncQueue.bulkPut([
      row('consumption', 'inventoryLotConsumptions'), row('setting', 'generalLedgerSetting'),
      row('opening', 'inventoryOpeningBalancePostings'), row('lot', 'inventoryLots'), row('product', 'products'),
    ]);
    const ordered = (await readPendingSyncQueueBatch(3)).map((item) => item.id);
    await check('priority');
    return { mismatches, beforeAbort, afterAbort, ordered };
  });
  expect(result.mismatches).toEqual([]);
  expect(result.afterAbort).toEqual(result.beforeAbort);
  expect(result.ordered).toEqual(['product', 'lot', 'opening']);
});

test('FIFO balances handle remote replay, out-of-order arrivals, corrections, restore and rollback', async ({ page }) => {
  await openDatabase(page);
  const result = await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    const { consumeFifoLots } = await import('/src/utils/inventory/consumeFifoLots.ts');
    const lot = (id, cost = 100, received = '2026-01-01') => ({
      id, product_id: 'p', product_name: 'Product', source_type: 'PURCHASE_RECEIPT',
      quantity_received: 10, quantity_remaining: 10, cost_per_unit: cost, cost_status: 'FINAL',
      received_at: received, created_at: received, updated_at: received,
    });
    const consumption = (id, lot_id, quantity) => ({ id, lot_id, quantity, product_id: 'p',
      source_type: 'POS_TRANSACTION', source_id: id, source_line_id: id, created_at: '2026-01-01' });
    await db.inventoryLotConsumptions.bulkPut([consumption('remote', 'a', 3)]);
    await db.inventoryLots.bulkPut([lot('a'), lot('b', 200, '2026-01-02')]);
    const values = [];
    const capture = async () => values.push((await db.inventoryLots.bulkGet(['a', 'b'])).map((row) => row.fifo_remaining));
    await capture();
    await db.inventoryLotConsumptions.bulkPut([consumption('remote', 'a', 3), consumption('remote', 'a', 3)]);
    await capture();
    await db.inventoryLotConsumptions.update('remote', { quantity: 4 });
    await capture();
    await db.inventoryLotConsumptions.update('remote', { lot_id: 'b' });
    await capture();
    await db.inventoryLots.delete('b');
    await db.inventoryLots.put(lot('b', 200, '2026-01-02'));
    await capture();
    const options = { sourceType: 'POS_TRANSACTION', sourceId: 'sale', sourceLineId: 'item' };
    const sale = await db.transaction('rw', db.inventoryLots, db.inventoryLotConsumptions,
      () => consumeFifoLots('p', 12, options));
    await capture();
    try {
      await db.transaction('rw', db.inventoryLots, db.inventoryLotConsumptions, async () => {
        await consumeFifoLots('p', 1, options);
        throw new Error('abort');
      });
    } catch { /* expected */ }
    await capture();
    await db.transaction('rw', db.inventoryLots, db.inventoryLotConsumptions, async () => {
      await db.inventoryLots.clear();
      await db.inventoryLotConsumptions.clear();
      // Backup fields are never trusted as the derived balance.
      await db.inventoryLots.put({ ...lot('a'), fifo_remaining: -999, fifo_available: 0 });
      await db.inventoryLotConsumptions.put(consumption('restored', 'a', 2));
    });
    const restored = (await db.inventoryLots.get('a')).fifo_remaining;
    await db.transaction('rw', db.inventoryLots, () => consumeFifoLots('p', 1));
    const untracked = (await db.inventoryLots.get('a')).fifo_remaining;
    await db.inventoryLots.update('a', { quantity_remaining: 0, fifo_excluded: true });
    const excluded = (await db.inventoryLots.get('a')).fifo_remaining;
    return { values, totalCost: sale.totalCost, consumed: sale.consumedLots.map((row) => [row.lotId, row.quantityConsumed]), restored, untracked, excluded };
  });
  expect(result.values).toEqual([[7, 10], [7, 10], [6, 10], [10, 6], [10, 6], [0, 4], [0, 4]]);
  expect(result.totalCost).toBe(1400);
  expect(result.consumed).toEqual([['a', 10], ['b', 2]]);
  expect(result.restored).toBe(8);
  expect(result.untracked).toBe(7);
  expect(result.excluded).toBe(0);
});

test('catalog paging and barcode lookup stay current without rescanning catalog on a stock update', async ({ page }) => {
  await openDatabase(page);
  const result = await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    const { liveQuery } = await import('/node_modules/.vite/deps/dexie.js');
    const { readPosCatalogPage, findPosProductBySku } = await import('/src/services/posCatalogReadService.ts');
    await db.products.bulkPut(Array.from({ length: 40 }, (_, i) => ({
      id: `p-${String(i).padStart(2, '0')}`, name: `Product ${String(i).padStart(2, '0')}`,
      sku: ` SKU-${i} `, stock: 10, category: i < 20 ? 'food' : 'drink', is_visible_in_pos: i !== 0,
    })));
    const page1 = await readPosCatalogPage({ limit: 12 });
    const page2 = await readPosCatalogPage({ cursor: page1.nextCursor, limit: 12 });
    const food1 = await readPosCatalogPage({ limit: 12, category: 'food' });
    const food = await readPosCatalogPage({ cursor: food1.nextCursor, limit: 12, category: 'food' });
    const search = await readPosCatalogPage({ limit: 12, search: 'product 1' });
    const broad1 = await readPosCatalogPage({ limit: 12, search: 'product' });
    const broadSearch = await readPosCatalogPage({ cursor: broad1.nextCursor, limit: 12, search: 'product' });
    const hidden = await findPosProductBySku('SKU-0');
    let catalogRuns = 0;
    const subscription = liveQuery(() => { catalogRuns++; return readPosCatalogPage({ limit: 12 }); }).subscribe(() => {});
    await new Promise((resolve) => setTimeout(resolve, 60));
    const beforeStock = catalogRuns;
    await db.products.update('p-01', { stock: 7, selling_price: 250, sync_status: 'synced' });
    await new Promise((resolve) => setTimeout(resolve, 60));
    const afterStock = catalogRuns;
    const current = await findPosProductBySku('sku-1');
    await db.products.update('p-01', { category: 'drink', is_visible_in_pos: false });
    await new Promise((resolve) => setTimeout(resolve, 60));
    const afterHide = catalogRuns;
    subscription.unsubscribe();
    const hiddenAfter = await findPosProductBySku('sku-1');
    await db.products.where('category').equals('food').delete();
    const counts = await db.posCatalogCounts.toArray();
    return { page2, food, search, broadSearch, hidden: !!hidden, beforeStock, afterStock, afterHide,
      currentStock: current.stock, hiddenAfter: !!hiddenAfter, counts };
  });
  expect(result.page2.ids).toHaveLength(12);
  expect(result.page2.ids[0]).toBe('p-13');
  expect(result.food.ids).toHaveLength(7);
  expect(result.broadSearch.ids).toEqual(result.page2.ids);
  expect(result.search.ids).toHaveLength(10);
  expect(result.hidden).toBe(false);
  expect(result.beforeStock).toBeGreaterThan(0);
  expect(result.afterStock).toBe(result.beforeStock);
  expect(result.afterHide).toBeGreaterThan(result.afterStock);
  expect(result.currentStock).toBe(7);
  expect(result.hiddenAfter).toBe(false);
  expect(result.counts).toEqual([{ category: 'drink', count: 20 }]);
});

test('v134 builds derived data from existing history atomically and maintains it after reopen', async ({ page }) => {
  await openDatabase(page);
  const result = await page.evaluate(async () => {
    const { default: Dexie } = await import('/node_modules/.vite/deps/dexie.js');
    const { registerMigrationV134 } = await import('/src/lib/database/migrations/versions/v134.ts');
    const { registerMigrationV135 } = await import('/src/lib/database/migrations/versions/v135.ts');
    const { buildPosCatalogSearchTokens } = await import('/src/lib/database/checkoutReadModels.ts');
    const { registerCheckoutReadModels } = await import('/src/lib/database/checkoutReadModelsMiddleware.ts');
    const schema = {
      products: 'id, name, sku, category', syncQueue: 'id, status, [status+updated_at]',
      inventoryLots: 'id, product_id', inventoryLotConsumptions: 'id, lot_id',
    };
    const old = new Dexie('pos-v134-upgrade');
    old.version(133).stores(schema);
    await old.table('inventoryLots').put({ id: 'a', product_id: 'p', quantity_received: 10, quantity_remaining: 10, received_at: '2026-01-01' });
    await old.table('inventoryLotConsumptions').bulkPut([{ id: 'c', lot_id: 'a', quantity: 3 }, { id: 'orphan', lot_id: 'late', quantity: 2 }]);
    await old.table('syncQueue').bulkPut([{ id: 'q', entity: 'products', status: 'pending', created_at: '2026-01-01', updated_at: '2026-01-01', payload: { preserved: true } }]);
    await old.table('products').bulkPut([{ id: 'p', name: 'Product', sku: ' ABC ' }, { id: 'hidden', name: 'Hidden', is_visible_in_pos: false }]);
    old.close();
    const upgraded = new Dexie('pos-v134-upgrade');
    upgraded.version(133).stores(schema);
    registerMigrationV134(upgraded);
    registerMigrationV135(upgraded);
    registerCheckoutReadModels(upgraded);
    try {
      await upgraded.open();
      const lot = await upgraded.table('inventoryLots').get('a');
      const queue = await upgraded.table('syncQueue').get('q');
      const catalog = await upgraded.table('posProductCatalog').toArray();
      const summary = await upgraded.table('syncQueueSummary').get('current');
      upgraded.close();
      await upgraded.open();
      await upgraded.table('inventoryLots').put({ id: 'late', product_id: 'p', quantity_received: 5, received_at: '2026-01-01' });
      await upgraded.table('syncQueue').update('q', { status: 'synced' });
      return { lot, queue, catalog, summary, late: await upgraded.table('inventoryLots').get('late'),
        after: await upgraded.table('syncQueueSummary').get('current'),
        expectedTokens: buildPosCatalogSearchTokens('Product', ' ABC ') };
    } finally { await upgraded.delete(); }
  });
  expect(result.lot.fifo_remaining).toBe(7);
  expect(result.queue).toMatchObject({ queue_priority: 0, payload: { preserved: true } });
  expect(result.catalog).toEqual([{
    id: 'p', name: 'Product', sku: ' ABC ', normalized_sku: 'abc', category: 'non_consumable',
    search_tokens: result.expectedTokens,
  }]);
  expect(result.expectedTokens).toEqual(['product', 'roduct', 'oduct', 'duct', 'uct', 'ct', 't', 'abc', 'bc', 'c']);
  expect(result.summary.counts).toEqual({ pending: 1, processing: 0, synced: 0, failed: 0 });
  expect(result.late.fifo_remaining).toBe(3);
  expect(result.after.counts).toEqual({ pending: 0, processing: 0, synced: 1, failed: 0 });
});

test('large history is skipped and FIFO crosses bounded pages in stable order', async ({ page }) => {
  await openDatabase(page);
  const result = await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    const { readFifoLots } = await import('/src/utils/inventory/readFifoLots.ts');
    const { readPendingSyncQueueBatch } = await import('/src/services/pendingSyncQueueReadService.ts');
    const { readSyncStatusSnapshot } = await import('/src/services/syncStatusReadService.ts');
    const date = '2026-01-01';
    for (let start = 0; start < 5000; start += 500) {
      const ids = Array.from({ length: 500 }, (_, i) => `history-${start + i}`);
      await db.inventoryLots.bulkPut(ids.map((id) => ({
        id, product_id: 'p', quantity_received: 1, quantity_remaining: 1, received_at: date,
      })));
      await db.inventoryLotConsumptions.bulkPut(ids.map((id) => ({ id, lot_id: id, quantity: 1 })));
      await db.syncQueue.bulkPut(ids.map((id) => ({ id, entity: 'transactions', status: 'synced',
        created_at: date, updated_at: date, payload: { text: 'x'.repeat(1024) } })));
    }
    await db.inventoryLots.bulkPut(Array.from({ length: 100 }, (_, i) => ({
      id: `live-${String(i).padStart(3, '0')}`, product_id: 'p', quantity_received: 1, quantity_remaining: 1, received_at: '2026-01-02',
    })));
    await db.syncQueue.bulkPut(Array.from({ length: 2000 }, (_, i) => ({
      id: `pending-${i}`, entity: 'transactions', status: 'pending', created_at: date, updated_at: date, payload: {},
    })));
    const reads = { history: 0, lots: 0, queue: 0, counts: 0 };
    db.close();
    db.use({ stack: 'dbcore', level: -2, name: 'growth-read-probe', create: (down) => ({
      ...down, table(name) {
        const table = down.table(name);
        const track = (rows) => {
          rows.forEach((row) => {
            if (row?.id?.startsWith('history')) reads.history++;
            if (row && name === 'inventoryLots') reads.lots++;
            if (row && name === 'syncQueue') reads.queue++;
          });
        };
        return { ...table,
          getMany: (req) => table.getMany(req).then((rows) => { track(rows); return rows; }),
          query: (req) => table.query(req).then((result) => { if (req.values) track(result.result); return result; }),
          count: (req) => { reads.counts++; return table.count(req); },
        };
      },
    }) });
    await db.open();
    const first = await readFifoLots('p', 1);
    const acrossPages = await readFifoLots('p', 40);
    const batch = await readPendingSyncQueueBatch(20);
    const status = await readSyncStatusSnapshot();
    return { first: first.map((row) => row.id), across: acrossPages.map((row) => row.id), batch: batch.length, counts: status.counts, reads };
  });
  expect(result.first).toEqual(['live-000']);
  expect(result.across).toEqual(Array.from({ length: 40 }, (_, i) => `live-${String(i).padStart(3, '0')}`));
  expect(result.batch).toBe(20);
  expect(result.counts).toEqual({ synced: 5000, pending: 2000, processing: 0, failed: 0 });
  expect(result.reads).toEqual({ history: 0, lots: 96, queue: 20, counts: 0 });
});

test('a failed summary write aborts the source even if its error is caught', async ({ page }) => {
  await openDatabase(page);
  const result = await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    let rejectSummary = true;
    db.close();
    db.use({ stack: 'dbcore', level: 1, name: 'summary-failure-probe', create: (down) => ({
      ...down, table(name) {
        const table = down.table(name);
        if (name !== 'syncQueueSummary') return table;
        return { ...table, mutate(req) {
          if (rejectSummary) throw new Error('Injected derived write failure');
          return table.mutate(req);
        } };
      },
    }) });
    await db.open();
    const row = { id: 'q', entity: 'products', status: 'pending', created_at: '2026-01-01', updated_at: '2026-01-01', payload: {} };
    try {
      await db.transaction('rw', db.syncQueue, async () => {
        try { await db.syncQueue.add(row); } catch { /* should still abort */ }
      });
    } catch { /* expected transaction abort */ }
    const countAfterAbort = await db.syncQueue.count();
    rejectSummary = false;
    await db.syncQueue.add(row);
    const summary = await db.syncQueueSummary.get('current');
    return { countAfterAbort, countAfterRetry: await db.syncQueue.count(), summary };
  });
  expect(result.countAfterAbort).toBe(0);
  expect(result.countAfterRetry).toBe(1);
  expect(result.summary.counts).toEqual({ pending: 1, processing: 0, synced: 0, failed: 0 });
});

test('journal numbering continues from the highest number of the day without reading its history', async ({ page }) => {
  await openDatabase(page);
  const result = await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    const { createJournalEntryNumber } = await import('/src/services/generalLedgerService.ts');
    const entry = (number, date) => ({
      id: `entry-${number}`, entry_number: number, entry_date: date, status: 'POSTED',
      source_type: 'POS_TRANSACTION', source_id: `trx-${number}`, source_event: 'POS_SALE_POSTED',
      description: 'seed', total_debit: 1000, total_credit: 1000,
      created_at: date, updated_at: date,
    });
    // A single busy day of history, plus a neighbouring day that must not be counted.
    for (let start = 1; start <= 5000; start += 500) {
      await db.journalEntries.bulkPut(Array.from({ length: 500 }, (_, i) => {
        const sequence = String(start + i).padStart(4, '0');
        return entry(`JRN-20260914-${sequence}`, '2026-09-14T08:00:00.000Z');
      }));
    }
    await db.journalEntries.bulkPut([
      entry('JRN-20260915-0001', '2026-09-15T08:00:00.000Z'),
      entry('JRN-20260915-0003', '2026-09-15T08:00:00.000Z'),
    ]);

    const reads = { entryValues: 0, counts: 0 };
    db.close();
    db.use({ stack: 'dbcore', level: -2, name: 'journal-number-probe', create: (down) => ({
      ...down, table(name) {
        const table = down.table(name);
        if (name !== 'journalEntries') return table;
        return { ...table,
          getMany: (req) => table.getMany(req).then((rows) => { reads.entryValues += rows.length; return rows; }),
          query: (req) => table.query(req).then((result) => {
            if (req.values) reads.entryValues += result.result.length;
            return result;
          }),
          count: (req) => { reads.counts++; return table.count(req); },
        };
      },
    }) });
    await db.open();

    const busyDay = await createJournalEntryNumber('2026-09-14T10:00:00.000Z');
    // A gap must not be reused: counting would hand out 0003 a second time.
    const gapDay = await createJournalEntryNumber('2026-09-15T10:00:00.000Z');
    const freshDay = await createJournalEntryNumber('2026-09-16T10:00:00.000Z');

    const withinOneTransaction = await db.transaction('rw', db.journalEntries, async () => {
      const first = await createJournalEntryNumber('2026-09-14T11:00:00.000Z');
      await db.journalEntries.add(entry(first, '2026-09-14T11:00:00.000Z'));
      const second = await createJournalEntryNumber('2026-09-14T11:00:00.000Z');
      return [first, second];
    });

    return { busyDay, gapDay, freshDay, withinOneTransaction, reads };
  });

  expect(result.busyDay).toBe('JRN-20260914-5001');
  expect(result.gapDay).toBe('JRN-20260915-0004');
  expect(result.freshDay).toBe('JRN-20260916-0001');
  expect(result.withinOneTransaction).toEqual(['JRN-20260914-5001', 'JRN-20260914-5002']);
  expect(result.reads).toEqual({ entryValues: 0, counts: 0 });
});

test('synced queue retention frees history in bounded batches while keeping counts and last-synced exact', async ({ page }) => {
  await openDatabase(page);
  const result = await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    const { pruneSyncedSyncQueueItems, SYNC_QUEUE_SYNCED_RETENTION_MS } = await import('/src/services/syncQueueRetentionService.ts');
    const { readSyncStatusSnapshot } = await import('/src/services/syncStatusReadService.ts');

    const now = Date.parse('2026-09-14T12:00:00.000Z');
    const at = (msAgo) => new Date(now - msAgo).toISOString();
    const day = 24 * 60 * 60 * 1000;
    const row = (id, status, updatedAt) => ({
      id, entity: 'transactions', entity_id: id, operation: 'create', status, attempts: 0,
      payload: { description: 'x'.repeat(1024) }, created_at: updatedAt, updated_at: updatedAt,
    });

    // Two batches worth of expired rows, plus rows that must survive.
    for (let start = 0; start < 1200; start += 400) {
      await db.syncQueue.bulkPut(Array.from({ length: 400 }, (_, i) => (
        row(`old-${start + i}`, 'synced', at(30 * day + start + i))
      )));
    }
    await db.syncQueue.bulkPut([
      row('recent-1', 'synced', at(1 * day)),
      row('recent-2', 'synced', at(2 * day)),
      row('pending-old', 'pending', at(30 * day)),
      row('failed-old', 'failed', at(30 * day)),
      row('processing-old', 'processing', at(30 * day)),
    ]);

    const pruned = await pruneSyncedSyncQueueItems(now);
    const recount = { pending: 0, processing: 0, synced: 0, failed: 0 };
    (await db.syncQueue.toArray()).forEach((item) => recount[item.status]++);
    const snapshot = await readSyncStatusSnapshot();
    const remainingAfterPrune = await db.syncQueue.count();

    // Everything synced is now older than the window: one row must still survive.
    await db.syncQueue.where('status').equals('synced').delete();
    await db.syncQueue.bulkPut([
      row('stale-a', 'synced', at(40 * day)),
      row('stale-b', 'synced', at(35 * day)),
    ]);
    const prunedStale = await pruneSyncedSyncQueueItems(now);
    const survivors = (await db.syncQueue.where('status').equals('synced').toArray()).map((item) => item.id);
    const staleSnapshot = await readSyncStatusSnapshot();

    return {
      retentionDays: SYNC_QUEUE_SYNCED_RETENTION_MS / day,
      pruned: pruned.deleted,
      remaining: remainingAfterPrune,
      recount,
      summary: snapshot.counts,
      lastSyncedAt: snapshot.lastSyncedAt,
      prunedStale: prunedStale.deleted,
      survivors,
      staleLastSyncedAt: staleSnapshot.lastSyncedAt,
    };
  });

  expect(result.retentionDays).toBe(7);
  expect(result.pruned).toBe(1200);
  expect(result.recount).toEqual({ synced: 2, pending: 1, processing: 1, failed: 1 });
  expect(result.summary).toEqual(result.recount);
  expect(result.remaining).toBe(5);
  expect(result.lastSyncedAt).toBe('2026-09-13T12:00:00.000Z');
  // One of two expired rows is kept so the indicator keeps a last-synced time.
  expect(result.prunedStale).toBe(1);
  expect(result.survivors).toEqual(['stale-b']);
  expect(result.staleLastSyncedAt).toBe('2026-08-10T12:00:00.000Z');
});

test('POS member picker reads a bounded page whatever the customer list size', async ({ page }) => {
  await openDatabase(page);
  const result = await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    const {
      POS_MEMBER_OPTION_LIMIT, readPosMember, readPosMemberOptions,
    } = await import('/src/services/posMemberReadService.ts');

    const now = '2026-09-14T00:00:00.000Z';
    // Every tenth member is inactive, so the active page is not simply the first rows.
    const seedMembers = async (count) => {
      await db.memberships.clear();
      for (let start = 0; start < count; start += 500) {
        await db.memberships.bulkPut(Array.from({ length: Math.min(500, count - start) }, (_, i) => {
          const index = start + i;
          return {
            id: `member-${String(index).padStart(5, '0')}`,
            member_number: `M-${String(index).padStart(5, '0')}`,
            name: `Pelanggan ${index}`, phone: `0811${String(index).padStart(6, '0')}`,
            status: index % 10 === 0 ? 'INACTIVE' : 'ACTIVE', is_active: index % 10 !== 0,
            points_balance: 0, joined_at: now, created_at: now, updated_at: now,
          };
        }));
      }
    };

    const reads = { rows: 0 };
    db.close();
    db.use({ stack: 'dbcore', level: -2, name: 'member-read-probe', create: (down) => ({
      ...down, table(name) {
        const table = down.table(name);
        if (name !== 'memberships') return table;
        return { ...table,
          get: (req) => table.get(req).then((row) => { if (row) reads.rows++; return row; }),
          getMany: (req) => table.getMany(req).then((rows) => { reads.rows += rows.filter(Boolean).length; return rows; }),
          query: (req) => table.query(req).then((res) => { if (req.values) reads.rows += res.result.length; return res; }),
        };
      },
    }) });
    await db.open();

    const measure = async (fn) => {
      reads.rows = 0;
      const value = await fn();
      return { value, rows: reads.rows };
    };

    await seedMembers(500);
    const smallPage = await measure(() => readPosMemberOptions(''));

    await seedMembers(5000);
    const largePage = await measure(() => readPosMemberOptions(''));
    const largeSearch = await measure(() => readPosMemberOptions('Pelanggan 4321'));
    const largeNumber = await measure(() => readPosMemberOptions('M-0123'));
    const single = await measure(() => readPosMember('member-04321'));

    return {
      limit: POS_MEMBER_OPTION_LIMIT,
      smallPage: { count: smallPage.value.length, rows: smallPage.rows },
      largePage: { count: largePage.value.length, rows: largePage.rows },
      firstOption: largePage.value[0]?.member_number,
      anyInactive: largePage.value.some((member) => !member.is_active),
      largeSearchNumbers: largeSearch.value.map((member) => member.member_number),
      numberSearch: largeNumber.value.map((member) => member.member_number),
      numberSearchRows: largeNumber.rows,
      single: { id: single.value?.id, rows: single.rows },
      totalMembers: await db.memberships.count(),
    };
  });

  expect(result.limit).toBe(50);
  expect(result.totalMembers).toBe(5000);
  // The page and its cost stay the same whether the shop has 500 or 5000 members.
  expect(result.largePage.count).toBe(50);
  expect(result.largePage.rows).toBe(result.smallPage.rows);
  expect(result.largePage.rows).toBeLessThan(100);
  expect(result.firstOption).toBe('M-00001');
  expect(result.anyInactive).toBe(false);
  // Name search has no index and is the one path that still walks rows on demand.
  expect(result.largeSearchNumbers).toEqual(['M-04321']);
  // Member-number search goes through its index: ten matches, no full walk.
  expect(result.numberSearch).toEqual(['M-01230', 'M-01231', 'M-01232', 'M-01233', 'M-01234',
    'M-01235', 'M-01236', 'M-01237', 'M-01238', 'M-01239'].filter((number) => Number(number.slice(2)) % 10 !== 0));
  expect(result.numberSearchRows).toBeLessThan(20);
  expect(result.single).toEqual({ id: 'member-04321', rows: 1 });
});

test('indexed catalog search returns exactly what a full scan returns, at bounded cost', async ({ page }) => {
  await openDatabase(page);
  const result = await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    const { readPosCatalogPage, findFirstPosProduct } = await import('/src/services/posCatalogReadService.ts');
    const { matchesProductSearch } = await import('/src/utils/productSearch.ts');

    const first = ['Indomie', 'Kopi', 'Teh', 'Sabun', 'Minyak', 'Gula', 'Beras', 'Susu'];
    const second = ['Goreng', 'Kapal Api', 'Botol', 'Mandi', 'Sayur', 'Pasir', 'Premium', 'Kental'];
    const third = ['Spesial', 'Sachet', 'Besar', 'Kecil', '85g', '1kg', 'Refill', ''];
    const build = (index) => ({
      id: `p-${String(index).padStart(5, '0')}`,
      name: `${first[index % first.length]} ${second[(index * 3) % second.length]} ${third[(index * 7) % third.length]}`.trim(),
      sku: `SKU-${String(index).padStart(4, '0')}`,
      category: index % 2 === 0 ? 'food' : 'drink',
      stock: 5, selling_price: 1000, is_visible_in_pos: index % 50 !== 0,
    });

    const seedCatalog = async (count) => {
      await db.products.clear();
      for (let start = 0; start < count; start += 500) {
        await db.products.bulkPut(Array.from({ length: Math.min(500, count - start) }, (_, i) => build(start + i)));
      }
      return Array.from({ length: count }, (_, i) => build(i)).filter((product) => product.is_visible_in_pos);
    };

    const expected = (visible, term, category) => visible
      .filter((product) => matchesProductSearch(product, term))
      .filter((product) => !category || product.category === category)
      .sort((left, right) => (left.name === right.name
        ? (left.id < right.id ? -1 : 1)
        : (left.name < right.name ? -1 : 1)));

    const terms = [
      'indomie',            // whole first word
      'indo',               // word prefix
      'domie',              // inside a word
      'indomie g',          // spans a space
      'kapal api',          // multi word, second word indexed too
      'KOPI',               // upper case
      '5g',                 // digits inside a word
      'sku-0123',           // SKU exact
      'sku-01',             // SKU prefix
      'e',                  // single letter, matches a great many rows
      'tidakadaproduk',     // no match at all
      'x'.repeat(40),       // longer than an indexed token: falls back to scan
      '  teh  ',            // untrimmed
    ];

    const visible = await seedCatalog(3000);
    const mismatches = [];
    for (const term of terms) {
      for (const category of [undefined, 'food']) {
        const actual = await readPosCatalogPage({ limit: 12, search: term, category });
        const want = expected(visible, term, category);
        const sameIds = JSON.stringify(actual.ids) === JSON.stringify(want.slice(0, 12).map((row) => row.id));
        if (!sameIds) {
          mismatches.push({ term, category: category ?? 'all', actual: actual.ids, want: want.slice(0, 12).map((row) => row.id) });
        }
      }
    }

    // Deep cursor traversal of a broad term must still agree with the scan.
    let deep = await readPosCatalogPage({ limit: 12, search: 'indo' });
    for (let pageNumber = 2; pageNumber <= 7; pageNumber++) {
      deep = await readPosCatalogPage({ cursor: deep.nextCursor, limit: 12, search: 'indo' });
    }
    const deepWant = expected(visible, 'indo').slice(72, 84).map((row) => row.id);
    const quick = await findFirstPosProduct('kapal api');
    const quickWant = expected(visible, 'kapal api')[0];

    // Count every catalog row the query actually deserialises, cursors included.
    let rowsRead = 0;
    const countRow = (row) => { rowsRead++; return row; };
    db.posProductCatalog.hook('reading', countRow);

    rowsRead = 0;
    await readPosCatalogPage({ limit: 12, search: 'indomie goreng spesial' });
    const largeReads = rowsRead;

    await seedCatalog(500);
    rowsRead = 0;
    await readPosCatalogPage({ limit: 12, search: 'indomie goreng spesial' });
    const smallReads = rowsRead;
    db.posProductCatalog.hook('reading').unsubscribe(countRow);

    return {
      mismatches,
      deep: { ids: deep.ids, want: deepWant },
      quick: { id: quick?.id, want: quickWant?.id },
      largeReads,
      smallReads,
      visibleInLargeCatalog: visible.length,
    };
  });

  expect(result.mismatches).toEqual([]);
  expect(result.deep.ids).toEqual(result.deep.want);
  expect(result.quick.id).toBe(result.quick.want);
  // A cursor page stays bounded even when the source catalog grows sixfold.
  expect(result.largeReads).toBe(result.smallReads);
  expect(result.largeReads).toBeLessThan(result.visibleInLargeCatalog / 4);
});

test('master product list filters and advances through bounded cursor pages', async ({ page }) => {
  await openDatabase(page);
  const result = await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    const {
      EMPTY_PRODUCT_LIST_FILTERS,
      readProductListPage,
    } = await import('/src/services/productListReadService.ts');

    const products = Array.from({ length: 160 }, (_, index) => ({
      id: `master-${String(index).padStart(3, '0')}`,
      name: `Produk Master ${String(index).padStart(3, '0')}`,
      sku: `MASTER-${String(index).padStart(3, '0')}`,
      category: index % 2 === 0 ? 'food' : 'drink',
      purchase_unit: 'pcs', selling_unit: 'pcs',
      purchase_price: 1_000 + index, selling_price: 2_000 + index,
      stock: index % 11 === 0 ? 0 : index,
      min_stock: 5,
      wholesale_prices: index % 3 === 0 ? [{ min_quantity: 10, price: 1_500 }] : [],
      product_type: index % 4 === 0 ? 'RAW_MATERIAL' : 'FINISHED_GOOD',
      is_visible_in_pos: index % 5 !== 0,
      created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      updated_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    }));
    await db.products.bulkPut(products);

    let listRowsRead = 0;
    let productRowsRead = 0;
    const countListRow = (row) => { listRowsRead++; return row; };
    const countProductRow = (row) => { productRowsRead++; return row; };
    db.productListCatalog.hook('reading', countListRow);
    db.products.hook('reading', countProductRow);
    const first = await readProductListPage({ limit: 20 });
    const firstReads = { listRowsRead, productRowsRead };
    const second = await readProductListPage({ cursor: first.nextCursor, limit: 20 });
    db.productListCatalog.hook('reading').unsubscribe(countListRow);
    db.products.hook('reading').unsubscribe(countProductRow);

    const filtered = await readProductListPage({
      limit: 20,
      filters: {
        ...EMPTY_PRODUCT_LIST_FILTERS,
        search: 'oduk master 0',
        categories: ['food'],
        stockStatus: 'out',
      },
    });

    const searchProjectionBefore = await db.productSearchCatalog.get('master-012');
    await db.products.update('master-012', { stock: 0 });
    const searchProjectionAfter = await db.productSearchCatalog.get('master-012');
    const listProjectionAfter = await db.productListCatalog.get('master-012');

    return {
      firstIds: first.rows.map((row) => row.id),
      secondIds: second.rows.map((row) => row.id),
      firstReads,
      filteredIds: filtered.rows.map((row) => row.id),
      searchProjectionStable: JSON.stringify(searchProjectionBefore) === JSON.stringify(searchProjectionAfter),
      updatedStockStatus: listProjectionAfter.stock_status,
    };
  });

  expect(result.firstIds).toEqual(Array.from({ length: 20 }, (_, index) => `master-${159 - index}`));
  expect(result.secondIds[0]).toBe('master-139');
  expect(result.firstReads.listRowsRead).toBeLessThanOrEqual(21);
  expect(result.firstReads.productRowsRead).toBe(20);
  expect(result.filteredIds).toHaveLength(5);
  expect(result.filteredIds.every((id) => Number(id.slice(-3)) % 22 === 0)).toBe(true);
  expect(result.searchProjectionStable).toBe(true);
  expect(result.updatedStockStatus).toBe('habis');
});

test('v135 backfills search tokens for a catalog built before the index existed', async ({ page }) => {
  await openDatabase(page);
  const result = await page.evaluate(async () => {
    const { default: Dexie } = await import('/node_modules/.vite/deps/dexie.js');
    const { registerMigrationV135 } = await import('/src/lib/database/migrations/versions/v135.ts');
    const { registerCheckoutReadModels } = await import('/src/lib/database/checkoutReadModelsMiddleware.ts');

    // A database already at v134: catalog rows exist but carry no search tokens.
    const v134Schema = {
      products: 'id, name, sku, category',
      posProductCatalog: 'id, name, normalized_sku, category, [category+name]',
      posCatalogCounts: 'category',
      syncQueue: 'id, status, [status+updated_at]',
      inventoryLots: 'id, product_id', inventoryLotConsumptions: 'id, lot_id',
      syncQueueSummary: 'id', inventoryConsumptionTotals: 'lot_id',
    };
    const old = new Dexie('pos-v135-upgrade');
    old.version(134).stores(v134Schema);
    await old.table('posProductCatalog').bulkPut([
      { id: 'p1', name: 'Indomie Goreng Spesial', sku: 'IDM-001', normalized_sku: 'idm-001', category: 'food' },
      { id: 'p2', name: 'Kopi Kapal Api', sku: 'KKA-002', normalized_sku: 'kka-002', category: 'drink' },
    ]);
    await old.table('posCatalogCounts').bulkPut([{ category: 'food', count: 1 }, { category: 'drink', count: 1 }]);
    old.close();

    const upgraded = new Dexie('pos-v135-upgrade');
    upgraded.version(134).stores(v134Schema);
    registerMigrationV135(upgraded);
    registerCheckoutReadModels(upgraded);
    try {
      await upgraded.open();
      const rows = await upgraded.table('posProductCatalog').orderBy('id').toArray();
      // Mid-word and space-spanning probes must both resolve through the new index.
      const insideWord = await upgraded.table('posProductCatalog')
        .where('search_tokens').startsWith('domie').distinct().toArray();
      const acrossWords = await upgraded.table('posProductCatalog')
        .where('search_tokens').startsWith('kapal').distinct().toArray();
      const bySku = await upgraded.table('posProductCatalog')
        .where('search_tokens').startsWith('kka-').distinct().toArray();
      return {
        tokenCounts: rows.map((row) => row.search_tokens.length),
        hasTokens: rows.every((row) => Array.isArray(row.search_tokens) && row.search_tokens.length > 0),
        names: rows.map((row) => row.name),
        insideWord: insideWord.map((row) => row.id),
        acrossWords: acrossWords.map((row) => row.id),
        bySku: bySku.map((row) => row.id),
      };
    } finally { await upgraded.delete(); }
  });

  expect(result.hasTokens).toBe(true);
  expect(result.names).toEqual(['Indomie Goreng Spesial', 'Kopi Kapal Api']);
  expect(result.insideWord).toEqual(['p1']);
  expect(result.acrossWords).toEqual(['p2']);
  expect(result.bySku).toEqual(['p2']);
  // "indomie goreng spesial" + "idm-001": suffix counts of each word.
  expect(result.tokenCounts[0]).toBe(7 + 6 + 7 + 7);
});
