import { expect, test, type Page } from '@playwright/test';

// Real IndexedDB and application services, in an isolated page without React workers.
// No PostgreSQL connection is used: these cover what each terminal records and queues.
async function prepareMembershipPage(page: Page) {
  await page.route('**/__membership-points-test__', (route) => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>Membership point tests</title>',
  }));
  await page.goto('/__membership-points-test__');
  await page.evaluate(async () => {
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
    await db.memberships.clear();
    await db.membershipPointTransactions.clear();
    await db.syncQueue.clear();
  });
}

test('a void of already-spent points leaves a debt that every queued event accounts for', async ({ page }) => {
  await prepareMembershipPage(page);
  const result = await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    const { checkout } = await import('/src/services/checkoutService.ts');
    const { previewVoidMembershipPoints, voidTransaction } = await import('/src/services/transactionVoidService.ts');
    const now = new Date().toISOString();
    await db.memberships.put({
      id: 'debt-member', member_number: 'MBR-TEST-DEBT', phone: '0811111111',
      points_balance: 0, is_active: true, status: 'ACTIVE', joined_at: now,
      created_at: now, updated_at: now, sync_status: 'synced',
    });
    const product = await db.products.get('test-product');
    const sell = (redeemPoints = 0) => checkout({
      cart: [{ product, quantity: 1, unit: 'pcs' }],
      payments: [{ paymentMethodId: 'test-cash', tenderedAmount: 10000 }],
      memberId: 'debt-member', redeemPoints, deferSyncProcessing: true,
    });
    const balance = async () => (await db.memberships.get('debt-member')).points_balance;

    const first = await sell();               // +10
    const afterFirst = await balance();
    await sell(10);                            // -10 redeemed, +9 on the 9,990 paid
    const afterRedeem = await balance();
    const preview = await previewVoidMembershipPoints(first.transaction);
    await voidTransaction({ transactionId: first.transaction.id, reason: 'Salah input' });
    const afterVoid = await balance();
    const debtSale = await sell(5);            // nothing to redeem; +10 pays the debt off
    const afterDebtSale = await balance();

    const ledger = await db.membershipPointTransactions.where('membership_id').equals('debt-member').toArray();
    const queuedEvents = (await db.syncQueue.where('entity').equals('membershipPointTransactions').toArray())
      .map((row) => row.payload);

    return {
      afterFirst, afterRedeem, afterVoid, afterDebtSale, preview,
      debtSaleRedeemed: debtSale.transaction.membership_points_redeemed,
      ledgerDeltaSum: ledger.reduce((sum, entry) => sum + entry.points_delta, 0),
      ledgerTypes: ledger.map((entry) => entry.type).sort(),
      everyEntryPending: ledger.every((entry) => entry.sync_status === 'pending'),
      queuedIds: queuedEvents.map((event) => event.id).sort(),
      ledgerIds: ledger.map((entry) => entry.id).sort(),
    };
  });

  expect(result.afterFirst).toBe(10);
  expect(result.afterRedeem).toBe(9);
  expect(result.preview).toMatchObject({ earnedPoints: 10, redeemedPoints: 0, balanceBefore: 9, balanceAfter: -1 });
  expect(result.afterVoid).toBe(-1);
  // The debt is neither redeemable nor forgiven by the next sale.
  expect(result.debtSaleRedeemed).toBe(0);
  expect(result.afterDebtSale).toBe(9);
  // PostgreSQL sums the events, so they must add up to exactly the local balance.
  expect(result.ledgerDeltaSum).toBe(result.afterDebtSale);
  expect(result.ledgerTypes).toEqual(['EARN', 'EARN', 'EARN', 'REDEEM', 'VOID_EARN_REVERSAL']);
  expect(result.everyEntryPending).toBe(true);
  expect(result.queuedIds).toEqual(result.ledgerIds);
});

test('a pulled member keeps the local balance until its own point events are sent', async ({ page }) => {
  await prepareMembershipPage(page);
  const result = await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    const { mergeRemoteMembershipsIntoDexie } = await import('/src/services/membershipReadService.ts');
    await db.memberships.put({
      id: 'sync-member', member_number: 'MBR-TEST-SYNC', name: 'Nama lama', phone: '0822222222',
      points_balance: 105, is_active: true, status: 'ACTIVE', joined_at: '2026-10-14T00:00:00.000Z',
      created_at: '2026-10-14T00:00:00.000Z', updated_at: '2026-10-14T01:00:00.000Z',
      sync_status: 'synced', remote_updated_at: '2026-10-14T01:00:00.000Z',
    });
    await db.membershipPointTransactions.put({
      id: 'unsent-earn', membership_id: 'sync-member', member_name: 'Nama lama',
      type: 'EARN', points_delta: 5, amount_value: 0, balance_after: 105,
      reason: 'Poin dari transaksi TRX-LOCAL', created_at: '2026-10-14T01:00:00.000Z',
      sync_status: 'pending',
    });
    const remote = (pointsBalance: number, updatedAt: string) => ({
      id: 'sync-member', member_number: 'MBR-TEST-SYNC', name: 'Nama dari kasir lain', phone: '0822222222',
      status: 'ACTIVE', joined_at: '2026-10-14T00:00:00.000Z', points_balance: pointsBalance,
      is_active: true, created_at: '2026-10-14T00:00:00.000Z', updated_at: updatedAt,
    });

    // The server has not seen the +5 yet, but does carry another terminal's profile edit.
    await mergeRemoteMembershipsIntoDexie([remote(100, '2026-10-14T02:00:00.000Z')]);
    const whilePending = await db.memberships.get('sync-member');

    await db.membershipPointTransactions.update('unsent-earn', { sync_status: 'synced' });
    // +5 from this terminal and +3 from another one, summed by PostgreSQL.
    await mergeRemoteMembershipsIntoDexie([remote(108, '2026-10-14T03:00:00.000Z')]);
    const afterSent = await db.memberships.get('sync-member');

    return {
      pendingBalance: whilePending.points_balance,
      pendingName: whilePending.name,
      sentBalance: afterSent.points_balance,
    };
  });

  expect(result.pendingBalance).toBe(105);
  expect(result.pendingName).toBe('Nama dari kasir lain');
  expect(result.sentBalance).toBe(108);
});

test('a registered phone number is refused in any spelling, without blocking legacy duplicates', async ({ page }) => {
  await prepareMembershipPage(page);
  const result = await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    const { createRetailMemberFromPos } = await import('/src/services/membershipService.ts');
    const { createMembership, updateMembership } = await import('/src/services/membershipManagementService.ts');
    const now = new Date().toISOString();
    const legacy = (id: string) => ({
      id, member_number: `MBR-LEGACY-${id}`, name: id, phone: '08123456789',
      points_balance: 0, is_active: true, status: 'ACTIVE', joined_at: now,
      created_at: now, updated_at: now, sync_status: 'synced',
    });
    // Two members that were already duplicated before the check existed.
    await db.memberships.bulkPut([legacy('A'), legacy('B')]);

    const capture = async (run: () => Promise<unknown>) => {
      try { await run(); return null; } catch (error) {
        return { name: error.name, memberId: error.member?.id, message: error.message };
      }
    };
    const fromPos = await capture(() => createRetailMemberFromPos({ phone: '+62 812-3456-789' }));
    const fromMasterData = await capture(() => createMembership({ phone: '628123456789' }));
    const renameLegacy = await capture(() => updateMembership('B', { phone: '08123456789', name: 'B baru' }));
    const created = await createRetailMemberFromPos({ phone: '0899 0000 111', name: 'Baru' });

    return {
      fromPos, fromMasterData, renameLegacy,
      renamed: (await db.memberships.get('B')).name,
      createdPhone: created.phone,
      createdNumber: created.member_number,
      createdStatus: [created.status, created.is_active],
    };
  });

  expect(result.fromPos).toMatchObject({ name: 'DuplicateMembershipPhoneError' });
  expect(['A', 'B']).toContain(result.fromPos?.memberId);
  expect(result.fromMasterData).toMatchObject({ name: 'DuplicateMembershipPhoneError' });
  expect(result.renameLegacy).toBeNull();
  expect(result.renamed).toBe('B baru');
  expect(result.createdPhone).toBe('08990000111');
  expect(result.createdNumber).toMatch(/^MBR-\d{8}-[0-9A-HJKMNP-TV-Z]{5}$/);
  expect(result.createdStatus).toEqual(['ACTIVE', true]);
});
