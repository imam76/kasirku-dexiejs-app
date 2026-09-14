// Isolated diagnostic: uses a temporary Chromium profile and synthetic IndexedDB.
// Does not connect to PostgreSQL, read client data, or run a real checkout/print.
// Run: node scripts/diagnostics/pos-checkout-read-benchmark.mjs
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import ts from 'typescript';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const ledgerSource = read('src/services/generalLedgerService.ts');
const journalLookup = ledgerSource.slice(
  ledgerSource.indexOf('const getPostedJournalEntryForSource ='),
  ledgerSource.indexOf('const getJournalSignature ='),
);
const helperCode = ts.transpileModule(
  `${journalLookup}\nwindow.lookupJournal = getPostedJournalEntryForSource;`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;
const modules = Object.fromEntries([
  'utils/productAvailability', 'utils/productSearch', 'lib/database/checkoutReadModels',
  'lib/database/checkoutReadModelsMiddleware', 'lib/database/migrations/versions/v134',
  'services/syncStatusReadService', 'services/pendingSyncQueueReadService',
  'services/posCatalogReadService', 'utils/inventory/readFifoLots',
].map((path) => [path, ts.transpileModule(read(`src/${path}.ts`), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText]));

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  // Fulfilled in-process; this URL never reaches the network.
  await page.route('http://pos-benchmark.local/', (route) => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>Isolated POS query benchmark</title>',
  }));
  await page.goto('http://pos-benchmark.local/');
  await page.addScriptTag({ content: read('node_modules/dexie/dist/dexie.js') });
  await page.addScriptTag({ content: helperCode });
  // Execute installed application helpers, including mutation middleware, without a
  // dev server. Imports resolve solely to these local modules and the synthetic DB.
  await page.evaluate((modules) => {
    const cache = {};
    window.loadPosModule = (id) => {
      if (cache[id]) return cache[id];
      const exports = cache[id] = {};
      const require = (path) => {
        if (path === 'dexie') return window.Dexie;
        if (path === '@/lib/db') return { get db() { return window.db; } };
        const resolved = path.startsWith('@/') ? path.slice(2)
          : new URL(path, `http://local/${id}`).pathname.slice(1);
        return window.loadPosModule(resolved);
      };
      new Function('require', 'exports', modules[id])(require, exports);
      return exports;
    };
  }, modules);
  console.log(JSON.stringify({
    kind: 'environment', browser: browser.version(),
    note: 'Synthetic query timings, median of 3 warm runs. Not end-to-end client checkout latency.',
  }));
  for (const rows of [1_000, 10_000, 50_000]) {
    const result = await page.evaluate(async (rows) => {
      const db = new window.Dexie(`pos-query-benchmark-${rows}`);
      window.db = db;
      db.version(133).stores({
        journalEntries: 'id, entry_number, source_type, source_id',
        products: 'id, name, sku, category',
        syncQueue: 'id, entity, entity_id, status, updated_at, [status+updated_at]',
        inventoryLots: 'id, product_id',
        inventoryLotConsumptions: 'id, lot_id, product_id',
      });
      window.loadPosModule('lib/database/migrations/versions/v134').registerMigrationV134(db);
      window.loadPosModule('lib/database/checkoutReadModelsMiddleware').registerCheckoutReadModels(db);
      await db.open();
      try {
        const date = '2026-09-01T00:00:00.000Z';
        const productId = 'synthetic-product';
        const lotCount = Math.ceil(rows / 100);
        await db.inventoryLots.bulkAdd(Array.from({ length: lotCount }, (_, i) => ({
          id: `lot-${i}`, product_id: productId, quantity_received: i === lotCount - 1 ? 101 : 100,
          quantity_remaining: 100, cost_per_unit: 5000, received_at: date,
        })));
        for (let start = 0; start < rows; start += 1_000) {
          const ids = Array.from({ length: Math.min(1_000, rows - start) }, (_, i) => start + i);
          await db.products.bulkAdd(ids.map((i) => ({
            id: `product-${i}`, name: `Product ${String(i).padStart(6, '0')}`, sku: `SKU-${i}`,
            stock: 10, selling_price: 10000,
          })));
          await db.journalEntries.bulkAdd(ids.map((i) => ({
            id: `journal-${i}`, entry_number: `JRN-20260901-${i}`,
            source_type: 'POS_TRANSACTION', source_id: `transaction-${i}`,
            source_event: 'POS_SALE_POSTED', status: 'POSTED',
            entry_date: date, created_at: date, updated_at: date,
            description: 'Synthetic POS sale', total_debit: 10000, total_credit: 10000,
          })));
          await db.syncQueue.bulkAdd(ids.map((i) => ({
            id: `queue-${i}`, entity: 'transactions', entity_id: `transaction-${i}`,
            status: 'synced', created_at: date, updated_at: date,
            payload: { description: 'x'.repeat(1_024), total_amount: 10000 },
          })));
          await db.inventoryLotConsumptions.bulkAdd(ids.map((i) => ({
            id: `consumption-${i}`, lot_id: `lot-${Math.floor(i / 100)}`,
            product_id: productId, source_id: `transaction-${i}`, quantity: 1,
            created_at: date, cost_per_unit_at_consumption: 5000,
          })));
        }
        await db.syncQueue.bulkAdd(Array.from({ length: 50 }, (_, i) => ({
          id: `pending-${i}`, entity: 'transactions', entity_id: `p-${i}`, status: 'pending',
          created_at: date, updated_at: date, payload: { description: 'x'.repeat(1024) },
        })));
        const measure = async (fn) => {
          await fn();
          const samples = [];
          for (let i = 0; i < 3; i++) {
            const start = performance.now();
            await fn();
            samples.push(performance.now() - start);
          }
          samples.sort((a, b) => a - b);
          return { medianMs: Number(samples[1].toFixed(1)), samplesMs: samples.map((n) => Number(n.toFixed(1))) };
        };
        // Preserve the pre-optimization query as the baseline.
        const journalBefore = await measure(() => db.transaction('rw', db.journalEntries, () => (
          db.journalEntries.where('source_type').equals('POS_TRANSACTION')
            .filter((entry) => entry.status === 'POSTED' && entry.source_id === 'new-transaction'
              && entry.source_event === 'POS_SALE_POSTED').first()
        )));
        const journalCurrent = await measure(() => db.transaction('rw', db.journalEntries, () => (
          window.lookupJournal('POS_TRANSACTION', 'new-transaction', 'POS_SALE_POSTED')
        )));
        // Mirrors the queueSnapshot callback before optimization.
        const syncStatusBefore = await measure(async () => {
          const queueItems = await db.syncQueue.toArray();
          const counts = queueItems.reduce((acc, item) => {
            acc[item.status] += 1;
            return acc;
          }, { pending: 0, processing: 0, synced: 0, failed: 0 });
          const latest = queueItems.filter((item) => item.status === 'synced')
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
          const failed = queueItems.filter((item) => item.status === 'failed')
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 3);
          return { counts, latest, failed };
        });
        const syncStatusCurrent = await measure(() => window.loadPosModule('services/syncStatusReadService').readSyncStatusSnapshot());
        const fifoBefore = await measure(() => db.transaction(
          'rw', [db.inventoryLots, db.inventoryLotConsumptions], async () => {
            const lots = await db.inventoryLots.where('product_id').equals(productId).toArray();
            const history = await db.inventoryLotConsumptions.where('lot_id').anyOf(lots.map((lot) => lot.id)).toArray();
            const consumed = new Map();
            history.forEach((row) => consumed.set(row.lot_id, (consumed.get(row.lot_id) ?? 0) + row.quantity));
            return lots.filter((lot) => lot.quantity_received - (consumed.get(lot.id) ?? 0) > 0)
              .sort((a, b) => a.received_at.localeCompare(b.received_at));
          },
        ));
        const fifoCurrent = await measure(() => db.transaction('rw', db.inventoryLots,
          () => window.loadPosModule('utils/inventory/readFifoLots').readFifoLots(productId, 1)));
        const catalogBefore = await measure(() => db.products.orderBy('name').toArray());
        const catalogCurrent = await measure(async () => {
          const page = await window.loadPosModule('services/posCatalogReadService').readPosCatalogPage(1, 12);
          return db.products.bulkGet(page.ids);
        });
        const batchCurrent = await measure(() => window.loadPosModule('services/pendingSyncQueueReadService').readPendingSyncQueueBatch(20));
        return { rowsPerTable: rows, lotsForOneProduct: lotCount, journalBefore, journalCurrent,
          syncStatusBefore, syncStatusCurrent, fifoBefore, fifoCurrent, catalogBefore, catalogCurrent, batchCurrent };
      } finally {
        await db.delete();
      }
    }, rows);
    console.log(JSON.stringify(result));
  }
} finally {
  await browser.close();
}
