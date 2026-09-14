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
    const page2 = await readPosCatalogPage(2, 12);
    const food = await readPosCatalogPage(99, 12, '', 'food');
    const search = await readPosCatalogPage(1, 12, 'product 1');
    const broadSearch = await readPosCatalogPage(2, 12, 'product');
    const hidden = await findPosProductBySku('SKU-0');
    let catalogRuns = 0;
    const subscription = liveQuery(() => { catalogRuns++; return readPosCatalogPage(1, 12); }).subscribe(() => {});
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
  expect(result.page2.total).toBe(39);
  expect(result.page2.ids).toHaveLength(12);
  expect(result.page2.ids[0]).toBe('p-13');
  expect(result.food).toMatchObject({ total: 19, currentPage: 2 });
  expect(result.food.ids).toHaveLength(7);
  expect(result.search.total).toBe(10);
  expect(result.broadSearch).toEqual(result.page2);
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
        after: await upgraded.table('syncQueueSummary').get('current') };
    } finally { await upgraded.delete(); }
  });
  expect(result.lot.fifo_remaining).toBe(7);
  expect(result.queue).toMatchObject({ queue_priority: 0, payload: { preserved: true } });
  expect(result.catalog).toEqual([{ id: 'p', name: 'Product', sku: ' ABC ', normalized_sku: 'abc', category: 'non_consumable' }]);
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
