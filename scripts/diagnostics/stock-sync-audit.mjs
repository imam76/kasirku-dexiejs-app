// Run: bun scripts/diagnostics/stock-sync-audit.mjs
// Executes application read services against synthetic Dexie data in a temporary browser.
// PostgreSQL responses are scheduled fixtures; no application or server data is accessed.
import { readFileSync, existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import ts from 'typescript';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const modules = Object.fromEntries([
  'constants/units', 'utils/productUnits', 'utils/timestamps',
  'services/shared/remoteRefreshCursor', 'services/shared/syncCursorStore',
  'services/shared/stockMutationMaterialization', 'services/productReadService',
  'services/stockMutationReadService', 'services/stockStateReadService',
].map((id) => [id, ts.transpileModule(read(`src/${id}.ts`), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText]));

const executablePath = [
  process.env.STOCK_AUDIT_BROWSER,
  chromium.executablePath(),
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((path) => path && existsSync(path));
console.log('Launching isolated audit browser.');
// Use native WebSocket/CDP: Playwright's pipe and ws transports can fail under Bun on Windows.
let browserProcess;
let profile;
const cleanupProfile = () => {
  if (!profile || !existsSync(profile)) return;
  const resolved = realpathSync(profile);
  if (dirname(resolved) !== realpathSync(tmpdir()) || !basename(resolved).startsWith('stock-sync-audit-')) {
    throw new Error('Refusing to remove an unexpected audit profile path.');
  }
  rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
};
const connectBrowser = async (url) => {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  socket.addEventListener('message', (message) => {
    const data = JSON.parse(message.data);
    if (data.id) {
      const request = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) request.reject(new Error(JSON.stringify(data.error)));
      else request.resolve(data.result);
    } else if (data.method === 'Fetch.requestPaused') {
      void send('Fetch.fulfillRequest', {
        requestId: data.params.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/html' }],
        body: Buffer.from('<!doctype html><title>Stock sync audit</title>').toString('base64'),
      }, data.sessionId);
    } else if (data.method === 'Runtime.consoleAPICalled') {
      console.log(data.params.args.map((arg) => arg.value ?? arg.description).join(' '));
    }
  });
  socket.addEventListener('close', () => {
    for (const request of pending.values()) request.reject(new Error('Audit browser disconnected.'));
    pending.clear();
  });
  return {
    async newPage() {
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      await send('Page.enable', {}, sessionId);
      await send('Runtime.enable', {}, sessionId);
      await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, sessionId);
      const evaluate = async (expression) => {
        const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
        if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
        return response.result.value;
      };
      return {
        goto: (url) => send('Page.navigate', { url }, sessionId),
        addScriptTag: ({ content }) => evaluate(content),
        evaluate: (fn, argument) => evaluate(`(${fn.toString()})(${JSON.stringify(argument)})`),
      };
    },
    close: async () => { socket.close(); browserProcess?.kill(); },
  };
};
const launch = async () => {
  if (!executablePath) throw new Error('Set STOCK_AUDIT_BROWSER to a Chromium executable.');
  profile = mkdtempSync(join(tmpdir(), 'stock-sync-audit-'));
  browserProcess = spawn(executablePath, [
    '--headless=new', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-sync', 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });
  const portFile = join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100; attempt++) {
    if (existsSync(portFile)) {
      const [port, path] = readFileSync(portFile, 'utf8').trim().split('\n').map((part) => part.trim());
      return connectBrowser(`ws://127.0.0.1:${port}${path}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('The isolated browser did not expose its audit CDP endpoint.');
};
let browser;
try {
  browser = await launch();
} catch (error) {
  browserProcess?.kill();
  cleanupProfile();
  throw error;
}
const watchdog = setTimeout(() => { void browser.close(); }, 45_000);
try {
  const page = await browser.newPage();
  await page.goto('http://stock-sync-audit.local/');
  await page.addScriptTag({ content: read('node_modules/dexie/dist/dexie.js') });
  console.log('Running application read services with synthetic IndexedDB.');
  const results = await page.evaluate(async (modules) => {
    const db = new window.Dexie('stock-sync-audit-synthetic');
    db.version(1).stores({ products: 'id', stockMutations: 'id, product_id', syncCursors: 'entity' });
    await db.open();
    const remote = { products: [], mutations: [], beforeProducts: undefined, beforeMutations: undefined };
    const afterCursor = (rows, timestamp, value, id) => rows.filter((row) => (
      !value || row[timestamp] > value || (row[timestamp] === value && row.id > (id ?? ''))
    )).sort((a, b) => a[timestamp] < b[timestamp] ? -1 : a[timestamp] > b[timestamp] ? 1
      : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const adapter = {
      isTauriRuntime: () => true,
      isPostgresUnavailableError: () => false,
      productPostgresAdapter: {
        list: async (options = {}) => {
          await remote.beforeProducts?.();
          return structuredClone(afterCursor(remote.products, 'updated_at', options.updatedAfter, options.cursorId)
            .slice(0, options.limit ?? 500));
        },
        get: async (id) => structuredClone(remote.products.find((product) => product.id === id) ?? null),
      },
      stockMutationPostgresAdapter: {
        list: async (options = {}) => {
          await remote.beforeMutations?.();
          return structuredClone(afterCursor(remote.mutations, 'server_created_at', options.serverCreatedAfter, options.cursorId)
            .slice(0, options.limit ?? 500));
        },
      },
    };
    const cache = {};
    const load = (id) => {
      if (id === 'lib/db') return { db };
      if (id === 'services/postgresAdapter') return adapter;
      if (cache[id]) return cache[id];
      if (!modules[id]) throw new Error(`Missing audit module: ${id}`);
      const exports = cache[id] = {};
      new Function('require', 'exports', modules[id])((path) => load(path.slice(2)), exports);
      return exports;
    };
    const { refreshStockStateFromPostgres: refresh } = load('services/stockStateReadService');
    const { refreshStockMutationsFromPostgres: refreshLedger } = load('services/stockMutationReadService');
    const baselineTime = '2026-09-17T08:00:00.000Z';
    const product = {
      id: 'product-1', name: 'Synthetic product', stock: 10,
      purchase_unit: 'pcs', selling_unit: 'pcs', purchase_price: 1, selling_price: 2,
      created_at: baselineTime, updated_at: baselineTime,
    };
    const sale = {
      id: 'POS_TRANSACTION:sale-a:line-1', product_id: product.id, product_name: product.name,
      source_type: 'POS_TRANSACTION', source_id: 'sale-a', source_line_id: 'line-1',
      quantity_delta: -2, unit: 'pcs', stock_unit: 'pcs',
      occurred_at: '2026-09-17T09:00:00.000Z', created_at: '2026-09-17T09:00:00.000Z',
      server_created_at: '2026-09-17T09:00:01.000Z',
    };
    const commitSale = () => {
      remote.mutations = [sale];
      remote.products = [{ ...product, stock: 8, updated_at: '2026-09-17T09:00:02.000Z' }];
    };
    const reset = async (local = {}) => {
      remote.beforeProducts = undefined;
      remote.beforeMutations = undefined;
      remote.products = [product];
      remote.mutations = [];
      await db.products.clear();
      await db.stockMutations.clear();
      await db.syncCursors.clear();
      await db.products.put({ ...product, sync_status: 'synced', remote_updated_at: baselineTime, ...local });
      await db.syncCursors.put({ entity: 'products', cursor_value: baselineTime, cursor_id: product.id });
    };
    const stock = async () => (await db.products.get(product.id)).stock;
    const results = [];
    const record = (scenario, expected, actual, details = {}) => {
      console.log(`${scenario}: expected=${expected}, actual=${actual}`);
      results.push({ scenario, expected, actual, passed: expected === actual, ...details });
    };
    try {
      await reset();
      commitSale();
      await refresh();
      await refresh();
      record('control: committed sale and sequential replay', 8, await stock());

      await reset();
      // The first ledger query sees no sale; the later product query sees its committed snapshot.
      remote.beforeProducts = async () => { remote.beforeProducts = undefined; commitSale(); };
      await refresh();
      const stockAfterFirstRefresh = await stock();
      await refresh();
      await refresh();
      record('sale commits between ledger and product reads', 8, await stock(), { stockAfterFirstRefresh });

      await reset();
      commitSale();
      // A manual refresh is suspended in its ledger request while a realtime refresh starts.
      let releaseLedger;
      let signalStarted;
      const gate = new Promise((resolve) => { releaseLedger = resolve; });
      const started = new Promise((resolve) => { signalStarted = resolve; });
      remote.beforeMutations = async () => {
        remote.beforeMutations = undefined;
        signalStarted();
        await gate;
      };
      const manualRefresh = refresh();
      await started;
      const realtimeRefresh = refresh();
      releaseLedger();
      await manualRefresh;
      await realtimeRefresh;
      await refresh();
      record('manual and realtime refresh overlap', 8, await stock());

      await reset();
      // T1 starts first, but T2 commits and is pulled before T1 commits.
      const firstStarted = { ...sale, id: 'sale-t1', server_created_at: '2026-09-17T09:00:00.000Z' };
      const secondStarted = { ...sale, id: 'sale-t2', server_created_at: '2026-09-17T09:00:01.000Z' };
      remote.mutations = [secondStarted];
      await refreshLedger();
      remote.mutations = [firstStarted, secondStarted];
      await refreshLedger();
      record('server timestamp order differs from transaction commit order', 2, await db.stockMutations.count(), {
        checkpoint: await db.syncCursors.get('stockMutations'),
      });

      await reset({ stock: 5, sync_status: 'pending' });
      // Upgraded replica already has the old snapshot (8) and a new local sale (-3),
      // but a historical remote ledger row was missed by the old device-time cursor.
      commitSale();
      await db.syncCursors.clear(); // Same targeted cursor reset as migration v136.
      await refresh();
      await refresh();
      record('recovery backfill with pending local product changes', 5, await stock());
    } finally {
      await db.delete();
    }
    return results;
  }, modules);
  console.log(JSON.stringify({ results }, null, 2));
  if (results.some((result) => !result.passed)) process.exitCode = 1;
} finally {
  clearTimeout(watchdog);
  await browser.close();
  if (browserProcess) {
    browserProcess.kill();
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  cleanupProfile();
}
