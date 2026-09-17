import { expect, test } from '@playwright/test';
import { registerFirstOwner } from './helpers/auth';

// Real IndexedDB and application services, without unrelated startup workers.
test.beforeEach(async ({ page }) => {
  await page.route('**/sync-test-harness', (route) => route.fulfill({ contentType: 'text/html', body: '<html><body>Sync integration test</body></html>' }));
  await page.goto('/sync-test-harness');
});

test('reconciles late sales/purchase uploads, missing lines and discrepancies without moving delta cursors', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    const { reconcileSalesPurchaseDocuments, reconcileSalesPurchaseDocumentsIfDue } = await import('/src/services/documentSyncReconciliationService.ts');
    const { mergeRemotePurchaseDocumentBundlesIntoDexie } = await import('/src/services/purchaseDocumentReadService.ts');
    const stamp = '2026-09-16T03:00:00.000Z';
    const doc = (id: string, type = 'PURCHASE_INVOICE') => ({
      id, document_number: id, type, status: 'ISSUED', version: 1,
      document_date: '2026-09-16', created_at: stamp, updated_at: stamp,
    });
    const bundle = (id: string, type = 'PURCHASE_INVOICE') => ({
      document: doc(id, type),
      items: [{ id: `${id}-item`, document_id: id, product_id: 'product', product_name: 'Product', unit: 'pcs', quantity: 2, price: 100, created_at: stamp }],
    });
    const remote = Array.from({ length: 105 }, (_, i) => bundle(`invoice-${String(i).padStart(3, '0')}`));
    const protectedBundle = bundle('local-pending');
    const conflict = bundle('same-revision-conflict');
    remote.push(protectedBundle, conflict);
    const sales = [bundle('sales-late', 'SALES_INVOICE')];
    const cursor = { entity: 'purchaseDocuments', cursor_value: '2026-09-16T04:00:00.000Z', cursor_id: 'future' };
    await db.syncCursors.put(cursor);
    await db.purchaseDocuments.bulkPut([
      { ...remote[0].document, sync_status: 'synced' }, // missing line
      { ...protectedBundle.document, sync_status: 'pending', notes: 'offline edit' },
      { ...conflict.document, sync_status: 'synced', notes: 'preserve this' },
      { ...doc('missing-server'), sync_status: 'synced' },
    ]);
    await db.purchaseDocumentItems.add({ ...protectedBundle.items[0], quantity: 7 });
    let listCalls = 0;
    let writes = 0;
    window.__TAURI_INTERNALS__ = { invoke: async (command: string, args: Record<string, unknown> = {}) => {
      if (command === 'postgres_health_check') return { available: true, status: 'available' };
      if (command === 'postgres_get_host_instance_id') return 'test-host';
      if (command.startsWith('postgres_upsert')) { writes += 1; throw new Error('Unexpected upload'); }
      if (command.startsWith('postgres_list_')) {
        listCalls += 1;
        const rows = command.includes('purchase') ? remote : sales;
        return rows.filter((row) => !args.updatedAfter || row.document.updated_at > String(args.updatedAfter)
          || (row.document.updated_at === args.updatedAfter && row.document.id > String(args.cursorId)))
          .slice(0, Number(args.limit));
      }
      if (command.startsWith('postgres_get_')) return remote.find((row) => row.document.id === args.id) ?? null;
      throw new Error(`Unexpected command ${command}`);
    } };
    try {
      const firstPromise = reconcileSalesPurchaseDocuments();
      const joined = reconcileSalesPurchaseDocuments();
      const deduplicated = firstPromise === joined;
      const first = await firstPromise;
      const second = await reconcileSalesPurchaseDocuments();
      const beforeDue = listCalls;
      await reconcileSalesPurchaseDocumentsIfDue();
      const dueSkipped = listCalls === beforeDue;
      // A later ordinary realtime/delta refresh cannot erase the recorded conflict.
      const merge = await mergeRemotePurchaseDocumentBundlesIntoDexie([conflict]);
      db.close();
      await db.open();
      return {
        first, second, deduplicated, dueSkipped, writes, conflictSkipped: merge.skipped,
        purchaseCount: await db.purchaseDocuments.count(), salesCount: await db.salesDocuments.count(),
        restoredItems: await db.purchaseDocumentItems.where('document_id').equals(remote[0].document.id).count(),
        pending: await db.purchaseDocuments.get(protectedBundle.document.id),
        pendingItem: await db.purchaseDocumentItems.get(protectedBundle.items[0].id),
        conflict: await db.purchaseDocuments.get(conflict.document.id),
        issues: (await db.documentSyncIssues.where('state').equals('open').toArray()).map((issue) => issue.kind).sort(),
        cursor: await db.syncCursors.get('purchaseDocuments'), savedCheck: await db.documentSyncChecks.get('sales-purchase'),
      };
    } finally { delete window.__TAURI_INTERNALS__; }
  });
  expect(result.first).toMatchObject({ status: 'completed', checked: 109, repaired: 106, issues: 3 });
  expect(result.second).toMatchObject({ status: 'completed', repaired: 0, issues: 3 });
  expect(result).toMatchObject({ deduplicated: true, dueSkipped: true, writes: 0, conflictSkipped: 1, purchaseCount: 108, salesCount: 1, restoredItems: 1 });
  expect(result.pending).toMatchObject({ sync_status: 'pending', notes: 'offline edit' });
  expect(result.pendingItem.quantity).toBe(7);
  expect(result.conflict.notes).toBe('preserve this');
  expect(result.issues).toEqual(['content_mismatch', 'local_pending', 'missing_remote']);
  expect(result.cursor).toMatchObject({ cursor_value: '2026-09-16T04:00:00.000Z', cursor_id: 'future' });
  expect(result.savedCheck.status).toBe('completed');
});

test('interrupted scan keeps repaired pages, retries safely, and rejects a different database', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    const { reconcileSalesPurchaseDocuments } = await import('/src/services/documentSyncReconciliationService.ts');
    const stamp = '2026-09-16T03:00:00Z';
    const rows = Array.from({ length: 101 }, (_, index) => ({ document: {
      id: `row-${String(index).padStart(3, '0')}`, document_number: `PI-${index}`, type: 'PURCHASE_INVOICE', status: 'ISSUED',
      document_date: '2026-09-16', version: 1, created_at: stamp, updated_at: stamp,
    }, items: [] }));
    let disconnect = true;
    let host = 'first-host';
    let reads = 0;
    window.__TAURI_INTERNALS__ = { invoke: async (command: string, args: Record<string, unknown> = {}) => {
      if (command === 'postgres_health_check') return { available: true, status: 'available' };
      if (command === 'postgres_get_host_instance_id') return host;
      if (command === 'postgres_list_sales_document_bundles') return [];
      if (command === 'postgres_list_purchase_document_bundles') {
        reads += 1;
        if (args.cursorId && disconnect) throw new Error('simulated disconnect');
        return rows.filter((row) => !args.cursorId || row.document.id > String(args.cursorId)).slice(0, Number(args.limit));
      }
      throw new Error(`Unexpected command ${command}`);
    } };
    try {
      await reconcileSalesPurchaseDocuments().catch(() => {});
      const failed = await db.documentSyncChecks.get('sales-purchase');
      const afterFailure = await db.purchaseDocuments.count();
      disconnect = false;
      const completed = await reconcileSalesPurchaseDocuments();
      host = 'different-host';
      const beforeMismatch = reads;
      const mismatch = await reconcileSalesPurchaseDocuments().then(() => '', (error) => error.message);
      return { failed, afterFailure, completed, mismatch, extraReads: reads - beforeMismatch, count: await db.purchaseDocuments.count() };
    } finally { delete window.__TAURI_INTERNALS__; }
  });
  expect(result.failed).toMatchObject({ status: 'failed', error: 'simulated disconnect', repaired: 100 });
  expect(result.afterFailure).toBe(100);
  expect(result.completed).toMatchObject({ status: 'completed', repaired: 1 });
  expect(result.count).toBe(101);
  expect(result.mismatch).toContain('Identitas database berubah');
  expect(result.extraReads).toBe(0);
});

test('a rejected purchase revision stays failed and preserves the local document', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    const { mapPurchaseDocumentBundleToRemoteDto, processPendingSyncQueue } = await import('/src/services/syncQueueService.ts');
    const stamp = '2026-09-16T03:00:00.000Z';
    const document = { id: 'conflict', document_number: 'PI-CONFLICT', type: 'PURCHASE_INVOICE', status: 'ISSUED', version: 1,
      document_date: '2026-09-16', created_at: stamp, updated_at: stamp, sync_status: 'pending' };
    const payload = mapPurchaseDocumentBundleToRemoteDto(document, []);
    await db.purchaseDocuments.put(document);
    await db.syncQueue.add({ id: 'queue-conflict', entity: 'purchaseDocuments', entity_id: document.id,
      operation: 'update', status: 'pending', attempts: 0, payload, created_at: stamp, updated_at: stamp });
    window.__TAURI_INTERNALS__ = { invoke: async (command: string) => {
      if (command === 'postgres_health_check') return { available: true, status: 'available' };
      if (command === 'postgres_get_host_instance_id') return 'host';
      if (command === 'postgres_upsert_purchase_document_bundle') return { ...payload, document: { ...payload.document, version: 2 } };
      throw new Error(`Unexpected command ${command}`);
    } };
    try {
      await processPendingSyncQueue();
      return { document: await db.purchaseDocuments.get(document.id), queue: await db.syncQueue.get('queue-conflict') };
    } finally { delete window.__TAURI_INTERNALS__; }
  });
  expect(result.document).toMatchObject({ version: 1, status: 'ISSUED', sync_status: 'failed' });
  expect(result.queue.status).toBe('failed');
  expect(result.queue.error_message).toContain('CONFLICT');
});

test('host changes during a request and local edits in flight are protected', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    const { reconcileSalesPurchaseDocuments } = await import('/src/services/documentSyncReconciliationService.ts');
    const stamp = '2026-09-16T03:00:00.000Z';
    const document = { id: 'in-flight', document_number: 'PI-IN-FLIGHT', type: 'PURCHASE_INVOICE', status: 'ISSUED', version: 1,
      document_date: '2026-09-16', created_at: stamp, updated_at: stamp };
    let host = 'host-a';
    let changeHost = true;
    window.__TAURI_INTERNALS__ = { invoke: async (command: string) => {
      if (command === 'postgres_health_check') return { available: true, status: 'available' };
      if (command === 'postgres_get_host_instance_id') return host;
      if (command === 'postgres_list_sales_document_bundles') return [];
      if (command === 'postgres_list_purchase_document_bundles') {
        if (changeHost) host = 'host-b';
        else await db.purchaseDocuments.put({ ...document, sync_status: 'pending', notes: 'edited during request' });
        return [{ document, items: [] }];
      }
      throw new Error(`Unexpected command ${command}`);
    } };
    try {
      const error = await reconcileSalesPurchaseDocuments().then(() => '', (cause) => cause.message);
      const afterSwitch = await db.purchaseDocuments.count();
      changeHost = false;
      host = 'host-a';
      const check = await reconcileSalesPurchaseDocuments();
      return { error, afterSwitch, check, document: await db.purchaseDocuments.get(document.id) };
    } finally { delete window.__TAURI_INTERNALS__; }
  });
  expect(result.error).toContain('Identitas database berubah');
  expect(result.afterSwitch).toBe(0);
  expect(result.check).toMatchObject({ repaired: 0, issues: 1, status: 'completed' });
  expect(result.document).toMatchObject({ sync_status: 'pending', notes: 'edited during request' });
});

test('Sync DB exposes the manual recovery and a persisted result', async ({ page }) => {
  await registerFirstOwner(page);
  await page.goto('/sync-db');
  const button = page.getByRole('button', { name: 'Periksa & perbaiki dokumen' });
  await expect(button).toBeDisabled();
  await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    const stamp = '2026-09-16T03:00:00.000Z';
    window.__TAURI_INTERNALS__ = { invoke: async (command: string) => {
      if (command === 'postgres_health_check') return { available: true, status: 'available' };
      if (command === 'postgres_get_host_instance_id') return 'ui-host';
      if (command === 'postgres_list_sales_document_bundles') return [];
      if (command === 'postgres_list_purchase_document_bundles') return [{ document: {
        id: 'ui-missing', document_number: 'PI-UI', type: 'PURCHASE_INVOICE', status: 'ISSUED', version: 1,
        document_date: '2026-09-16', created_at: stamp, updated_at: stamp,
      }, items: [] }];
      throw new Error(`Unexpected command ${command}`);
    } };
    await db.documentSyncChecks.put({ id: 'sales-purchase', host_id: 'ui-host', run_id: 'previous',
      status: 'completed', started_at: stamp, completed_at: stamp, checked: 0, repaired: 0, issues: 0 });
  });
  await expect(button).toBeEnabled();
  await button.click();
  const panel = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Kelengkapan dokumen sales & purchase' }) });
  await expect(panel.getByText('1 diperiksa · 1 dipulihkan · 0 perlu ditinjau')).toBeVisible();
  await expect(panel.getByText('Pemeriksaan dokumen selesai', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ekspor hasil pemeriksaan' })).toBeEnabled();
  await page.evaluate(() => { delete window.__TAURI_INTERNALS__; });
  await page.reload();
  await expect(panel.getByText('1 diperiksa · 1 dipulihkan · 0 perlu ditinjau')).toBeVisible();
  await expect(panel.getByText('Pemeriksaan dokumen selesai', { exact: true })).toBeVisible();
  await panel.screenshot({ path: 'test-results/document-sync-panel.png' });
});
