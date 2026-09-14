import { expect, test, type Page } from '@playwright/test';

// Real IndexedDB and application services, in an isolated page without React workers.
// No PostgreSQL connection or physical printer is used.
async function prepareCheckout(page: Page) {
  await page.route('**/__pos-checkout-test__', (route) => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>POS service tests</title>',
  }));
  await page.goto('/__pos-checkout-test__');
  await page.evaluate(async () => {
    try {
    const { db } = await import('/src/lib/db.ts');
    await db.open();
    const now = new Date().toISOString();
    await db.authUsers.put({
      id: 'test-owner', name: 'Test owner', role: 'OWNER', is_active: true,
      pin_hash: 'unused', pin_salt: 'unused', created_at: now, updated_at: now,
    });
    await db.authSessions.put({ id: 'test-session', user_id: 'test-owner', created_at: now, last_active_at: now });
    localStorage.setItem('frayukti-auth-session-id', 'test-session');
    await db.enabledModules.put({ id: 'GENERAL_LEDGER', is_enabled: true, updated_at: now });
    await db.generalLedgerSetting.put({
      id: 'default', is_ready: true, inventory_policy: 'PERPETUAL_INVENTORY',
      cutoff_date: '2020-01-01', created_at: now, updated_at: now,
    });
    await db.chartOfAccounts.bulkPut([
      { id: 'cash', code: '1010', type: 'ASSET', normal_balance: 'DEBIT' },
      { id: 'sales-pos', code: '4010', type: 'REVENUE', normal_balance: 'CREDIT' },
      { id: 'inventory', code: '1200', type: 'ASSET', normal_balance: 'DEBIT' },
      { id: 'cogs', code: '5010', type: 'EXPENSE', normal_balance: 'DEBIT' },
    ].map((account) => ({
      ...account, name: account.id, is_active: true, is_postable: true, created_at: now, updated_at: now,
    })));
    await db.paymentMethods.put({
      id: 'test-cash', code: 'TEST-CASH', name: 'Tunai', category: 'CASH',
      posting_account_id: 'cash', is_active: true, requires_reference: false,
      created_at: now, updated_at: now,
    });
    await db.cashierSessions.put({
      id: 'test-cashier', session_number: 'TEST-CASHIER', status: 'OPEN',
      cashier_user_id: 'test-owner', opened_at: now, opening_cash_amount: 0,
      created_at: now, updated_at: now,
    });
    await db.products.put({
      id: 'test-product', name: 'Test product', sku: 'TEST-PRODUCT',
      purchase_unit: 'pcs', selling_unit: 'pcs', sellable_units: ['pcs'],
      purchase_price: 5000, selling_price: 10000, stock: 10,
      created_at: now, updated_at: now, sync_status: 'synced',
    });
    await db.inventoryLots.put({
      id: 'test-lot', product_id: 'test-product', product_name: 'Test product',
      quantity_received: 10, quantity_remaining: 10, cost_per_unit: 5000,
      cost_status: 'FINAL', source_type: 'PURCHASE', received_at: now,
      created_at: now, updated_at: now, sync_status: 'synced',
    });
    await db.memberships.put({
      id: 'test-member', member_number: 'TEST-MEMBER', phone: '0800000000',
      points_balance: 100, is_active: true, status: 'ACTIVE', joined_at: now,
      created_at: now, updated_at: now, sync_status: 'synced',
    });
    await db.syncQueue.clear();
    } catch (error) {
      throw new Error(`${error.name}: ${error.message}\n${error.stack}`);
    }
  });
}

test('checkout commits all outbox rows together and rolls everything back on enqueue failure', async ({ page }) => {
  await prepareCheckout(page);
  const result = await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    const { checkout } = await import('/src/services/checkoutService.ts');
    const product = await db.products.get('test-product');
    const input = {
      cart: [{ product, quantity: 1, unit: 'pcs' }],
      payments: [{ paymentMethodId: 'test-cash', tenderedAmount: 10000 }],
      memberId: 'test-member', deferSyncProcessing: true,
    };
    const snapshot = async () => ({
      stock: (await db.products.get(product.id)).stock,
      lotRemaining: (await db.inventoryLots.get('test-lot')).quantity_remaining,
      fifoRemaining: (await db.inventoryLots.get('test-lot')).fifo_remaining,
      consumedTotals: await db.inventoryConsumptionTotals.toArray(),
      queueSummary: await db.syncQueueSummary.get('current'),
      catalogCounts: await db.posCatalogCounts.toArray(),
      memberPoints: (await db.memberships.get('test-member')).points_balance,
      counts: await Promise.all([
        db.transactions, db.transactionItems, db.posTransactionPayments, db.financeTransactions,
        db.profitLogs, db.journalEntries, db.journalEntryLines, db.inventoryLotConsumptions,
        db.stockMutations, db.membershipPointTransactions, db.syncQueue,
      ].map((table) => table.count())),
      financeBalance: await db.financeBalance.get('current'),
      profitBalance: await db.profitBalance.get('current'),
    });
    const before = await snapshot();
    const failEnqueue = (_key, row) => {
      if (row.entity === 'financeTransactions') throw new Error('Injected outbox failure');
    };
    db.syncQueue.hook('creating', failEnqueue);
    let failure = '';
    try { await checkout(input); } catch (error) { failure = String(error); }
    finally { db.syncQueue.hook('creating').unsubscribe(failEnqueue); }
    await new Promise((resolve) => setTimeout(resolve, 20));
    const afterFailure = await snapshot();
    const stages: string[] = [];
    const sale = await checkout({ ...input, performanceTrace: {
      checkpoint: (stage) => stages.push(stage), report: () => {},
    } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const queue = await db.syncQueue.toArray();
    const journal = await db.journalEntries.where('source_id').equals(sale.transaction.id).first();
    const finance = await db.financeTransactions.where('reference_id').equals(sale.transaction.id).first();
    return {
      failure, before, afterFailure, stages,
      stock: (await db.products.get(product.id)).stock,
      entities: queue.map((row) => row.entity).sort(),
      journalCount: queue.filter((row) => row.entity === 'journalEntries').length,
      journalId: journal?.id,
      queuedJournalId: queue.find((row) => row.entity === 'journalEntries')?.entity_id,
      financeId: finance?.id,
      queuedFinanceId: queue.find((row) => row.entity === 'financeTransactions')?.entity_id,
      preserveStock: queue.find((row) => row.entity === 'products')?.payload.preserve_stock,
      queuedStock: queue.find((row) => row.entity === 'products')?.payload.stock,
      memberPoints: (await db.memberships.get('test-member')).points_balance,
      queuedMemberPoints: queue.find((row) => row.entity === 'memberships')?.payload.points_balance,
    };
  });
  expect(result.failure).toContain('Injected outbox failure');
  expect(result.afterFailure).toEqual(result.before);
  expect(result.stock).toBe(9);
  expect(result.entities).toEqual([
    'financeTransactions', 'inventoryLotConsumptions', 'journalEntries', 'memberships',
    'products', 'stockMutations', 'transactions',
  ]);
  expect(result.journalCount).toBe(1);
  expect(result.queuedJournalId).toBe(result.journalId);
  expect(result.queuedFinanceId).toBe(result.financeId);
  expect(result.preserveStock).toBe(true);
  expect(result.queuedStock).toBe(9);
  expect(result.queuedMemberPoints).toBe(result.memberPoints);
  expect(result.stages).toEqual([
    'preflight', 'transaction_wait', 'pricing_and_payments', 'stock_validation',
    'fifo', 'sale_records', 'journal_and_outbox', 'stock_mutations', 'outbox', 'commit',
  ]);
});

test('journal lookup skips unrelated history and preserves retry, event, type and reversal behavior', async ({ page }) => {
  await prepareCheckout(page);
  const result = await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    const { postBalancedJournalEntry } = await import('/src/services/generalLedgerService.ts');
    const now = new Date().toISOString();
    await db.journalEntries.bulkAdd(Array.from({ length: 500 }, (_, i) => ({
      id: `old-${i}`, entry_number: `OLD-${i}`, source_type: 'POS_TRANSACTION',
      source_id: `old-sale-${i}`, source_event: 'POS_SALE_POSTED', status: 'POSTED',
    })));
    const cash = await db.chartOfAccounts.get('cash');
    const sales = await db.chartOfAccounts.get('sales-pos');
    const input = {
      source_type: 'POS_TRANSACTION', source_id: 'new-sale', source_event: 'POS_SALE_POSTED',
      entry_date: now, description: 'Test sale', syncInTransaction: true,
      lines: [{ account: cash, debit: 10000 }, { account: sales, credit: 10000 }],
    };
    let unrelatedReads = 0;
    const trackRead = (row) => {
      if (row?.id.startsWith('old-')) unrelatedReads++;
      return row;
    };
    db.journalEntries.hook('reading', trackRead);
    const first = await postBalancedJournalEntry(input);
    const retry = await postBalancedJournalEntry(input);
    const anotherEvent = await postBalancedJournalEntry({ ...input, source_event: 'ANOTHER_EVENT' });
    const anotherType = await postBalancedJournalEntry({ ...input, source_type: 'SALES_INVOICE' });
    const changed = await postBalancedJournalEntry({
      ...input, lines: [{ account: cash, debit: 12000 }, { account: sales, credit: 12000 }],
    });
    const changedRetry = await postBalancedJournalEntry({
      ...input, lines: [{ account: cash, debit: 12000 }, { account: sales, credit: 12000 }],
    });
    db.journalEntries.hook('reading').unsubscribe(trackRead);
    return {
      unrelatedReads, first: first.id, retry: retry.id,
      anotherEvent: anotherEvent.id, anotherType: anotherType.id,
      changed: changed.id, changedRetry: changedRetry.id,
      originalStatus: (await db.journalEntries.get(first.id)).status,
      reversals: await db.journalEntries.where('reversed_entry_id').equals(first.id)
        .filter((entry) => entry.status === 'POSTED').count(),
    };
  });
  expect(result.unrelatedReads).toBe(0);
  expect(result.retry).toBe(result.first);
  expect(new Set([result.first, result.anotherEvent, result.anotherType, result.changed]).size).toBe(4);
  expect(result.changedRetry).toBe(result.changed);
  expect(result.originalStatus).toBe('REVERSED');
  expect(result.reversals).toBe(1);
});

test('sync status preserves counts and live updates while reading at most three payloads', async ({ page }) => {
  await prepareCheckout(page);
  const result = await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    const { liveQuery } = await import('/node_modules/.vite/deps/dexie.js');
    const { readSyncStatusSnapshot } = await import('/src/services/syncStatusReadService.ts');
    const row = (id, status, day) => ({
      id, entity: 'transactions', entity_id: id, operation: 'create', status, attempts: 0,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: `2026-01-${day}T00:00:00.000Z`,
      payload: { text: 'x'.repeat(1024) },
    });
    await db.syncQueue.bulkAdd([
      ...Array.from({ length: 500 }, (_, i) => row(`synced-${i}`, 'synced', '01')),
      row('latest-synced', 'synced', '20'), row('pending', 'pending', '02'),
      row('processing', 'processing', '03'),
      ...Array.from({ length: 5 }, (_, i) => row(`failed-${i}`, 'failed', String(10 + i))),
    ]);
    let payloadReads = 0;
    const track = (item) => { payloadReads++; return item; };
    db.syncQueue.hook('reading', track);
    const snapshot = await readSyncStatusSnapshot();
    db.syncQueue.hook('reading').unsubscribe(track);
    const updates = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { subscription.unsubscribe(); reject(new Error('Live query did not update')); }, 5000);
      const subscription = liveQuery(readSyncStatusSnapshot).subscribe({
        next: async (value) => {
          if (value.counts.pending === 1) {
            await db.syncQueue.update('pending', { status: 'synced', updated_at: '2026-01-25T00:00:00.000Z' });
          } else {
            clearTimeout(timeout);
            subscription.unsubscribe();
            resolve({ counts: value.counts, lastSyncedAt: value.lastSyncedAt });
          }
        }, error: reject,
      });
    });
    return { ...snapshot, failedIds: snapshot.failedItems.map((item) => item.id), payloadReads, updates };
  });
  expect(result.counts).toEqual({ synced: 501, pending: 1, processing: 1, failed: 5 });
  expect(result.failedIds).toEqual(['failed-4', 'failed-3', 'failed-2']);
  expect(result.lastSyncedAt).toBe('2026-01-20T00:00:00.000Z');
  expect(result.payloadReads).toBeLessThanOrEqual(3);
  expect(result.updates).toEqual({
    counts: { synced: 502, pending: 0, processing: 1, failed: 5 },
    lastSyncedAt: '2026-01-25T00:00:00.000Z',
  });
});

test('v133 adds the status/time index without altering an existing queue', async ({ page }) => {
  await prepareCheckout(page);
  const result = await page.evaluate(async () => {
    const { default: Dexie } = await import('/node_modules/.vite/deps/dexie.js');
    const { registerMigrationV133 } = await import('/src/lib/database/migrations/versions/v133.ts');
    const name = 'pos-v133-migration-test';
    const schema = 'id, entity, entity_id, operation, status, created_at, updated_at';
    const row = {
      id: 'preserved-queue', entity: 'transactions', entity_id: 'preserved-sale',
      operation: 'create', status: 'pending', attempts: 2,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z',
      payload: { nested: { original: true } },
    };
    const old = new Dexie(name);
    old.version(132).stores({ syncQueue: schema });
    await old.table('syncQueue').add(row);
    old.close();
    const upgraded = new Dexie(name);
    upgraded.version(132).stores({ syncQueue: schema });
    registerMigrationV133(upgraded);
    try {
      await upgraded.open();
      const found = await upgraded.table('syncQueue').where('[status+updated_at]')
        .equals([row.status, row.updated_at]).first();
      return { before: row, after: found, version: upgraded.verno };
    } finally { await upgraded.delete(); }
  });
  expect(result.after).toEqual(result.before);
  expect(result.version).toBe(133);
});

test('receipt dispatch releases background work before slow transport finishes and records failures', async ({ page }) => {
  await prepareCheckout(page);
  const result = await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    const { checkout } = await import('/src/services/checkoutService.ts');
    const { printReceiptAfterTransaction } = await import('/src/utils/printer/receiptService.ts');
    const sale = await checkout({
      cart: [{ product: await db.products.get('test-product'), quantity: 1, unit: 'pcs' }],
      payments: [{ paymentMethodId: 'test-cash', tenderedAmount: 10000 }], deferSyncProcessing: true,
    });
    const receipt = { ...sale.transaction, items: sale.items, payments: sale.payments };
    localStorage.setItem('frayukti-selected-usb-printer', JSON.stringify({ usbId: '0001:0002', baudRate: 9600 }));
    const events: string[] = [];
    let finishWrite: () => void = () => {};
    let rejectWrite = false;
    const port = {
      getInfo: () => ({ usbVendorId: 1, usbProductId: 2 }),
      open: async () => { events.push('transport-open'); }, close: async () => {},
      writable: { getWriter: () => ({
        write: () => {
          events.push('transport-write');
          if (rejectWrite) return Promise.reject(new Error('Injected printer failure'));
          return new Promise<void>((resolve) => { finishWrite = resolve; });
        }, releaseLock: () => {},
      }) },
    };
    Object.defineProperty(navigator, 'serial', { configurable: true, value: { getPorts: async () => [port] } });
    let startBackground = () => {};
    const backgroundStarted = new Promise<void>((resolve) => {
      startBackground = () => { events.push('background'); resolve(); };
    });
    let finished = false;
    const printing = printReceiptAfterTransaction(receipt, {
      onPrintDispatched: startBackground,
    }).then((value) => { finished = true; return value; });
    await backgroundStarted;
    const pendingAtDispatch = !finished;
    const committedAtDispatch = (await db.transactions.get(sale.transaction.id)).status;
    finishWrite();
    const success = await printing;
    const printedStatus = (await db.transactions.get(sale.transaction.id)).receipt_status;
    rejectWrite = true;
    const failure = await printReceiptAfterTransaction(receipt);
    const failedStatus = (await db.transactions.get(sale.transaction.id)).receipt_status;
    const updates = await db.syncQueue.where('entity_id').equals(sale.transaction.id).toArray();
    localStorage.removeItem('frayukti-selected-usb-printer');
    let noPrinterCallback = 0;
    const noPrinter = await printReceiptAfterTransaction(receipt, { onPrintDispatched: () => { noPrinterCallback++; } });
    await new Promise((resolve) => setTimeout(resolve, 10));
    return {
      pendingAtDispatch, committedAtDispatch, events, success, printedStatus,
      failure, failedStatus, queuedStatuses: updates.map((item) => item.payload.transaction?.receipt_status),
      noPrinter, noPrinterCallback,
    };
  });
  expect(result.pendingAtDispatch).toBe(true);
  expect(result.committedAtDispatch).toBe('COMPLETED');
  expect(result.events.indexOf('transport-write')).toBeLessThan(result.events.indexOf('background'));
  expect(result.success.success).toBe(true);
  expect(result.printedStatus).toBe('printed');
  expect(result.failure.success).toBe(false);
  expect(result.failedStatus).toBe('print_failed');
  expect(result.queuedStatuses).toContain('printed');
  expect(result.queuedStatuses).toContain('print_failed');
  expect(result.noPrinter.success).toBe(false);
  expect(result.noPrinterCallback).toBe(1);
});
