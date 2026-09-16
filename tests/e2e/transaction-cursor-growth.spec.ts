import { expect, test } from '@playwright/test';

test('transaction modules seek by date/id without reading unrelated history', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30_000 });

  const result = await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    const { listTransactionHistoryPage } = await import('/src/services/transactionHistoryReadService.ts');
    const {
      listPurchaseDocumentPage,
      listSalesDocumentPage,
    } = await import('/src/services/documentHistoryReadService.ts');
    const { listFinanceHistoryPage } = await import('/src/services/financeHistoryReadService.ts');

    const oldTimestamp = '2000-01-01T00:00:00.000Z';
    const currentDate = '2099-01-15';
    const currentTimestamp = `${currentDate}T03:00:00.000Z`;
    const oldCount = 300;
    const currentCount = 45;
    const makeId = (kind: string, age: 'old' | 'current', index: number) => (
      `cursor-growth-${kind}-${age}-${String(index).padStart(4, '0')}`
    );

    const oldTransactions = Array.from({ length: oldCount }, (_, index) => ({
      id: makeId('pos', 'old', index),
      transaction_number: `OLD-POS-${index}`,
      total_amount: 1,
      payment_amount: 1,
      change_amount: 0,
      payment_method: 'TUNAI' as const,
      created_at: oldTimestamp,
      updated_at: oldTimestamp,
    }));
    const currentTransactions = Array.from({ length: currentCount }, (_, index) => ({
      id: makeId('pos', 'current', index),
      transaction_number: `CURRENT-POS-${index}`,
      total_amount: 10,
      payment_amount: 10,
      change_amount: 0,
      payment_method: 'TUNAI' as const,
      created_at: currentTimestamp,
      updated_at: currentTimestamp,
    }));
    const oldSales = Array.from({ length: oldCount }, (_, index) => ({
      id: makeId('sales', 'old', index),
      document_number: `OLD-SI-${index}`,
      type: 'SALES_INVOICE' as const,
      status: 'ISSUED' as const,
      customer_name: 'Historical customer',
      document_date: '2000-01-01',
      created_at: oldTimestamp,
      updated_at: oldTimestamp,
    }));
    const currentSales = Array.from({ length: currentCount }, (_, index) => ({
      id: makeId('sales', 'current', index),
      document_number: `CURRENT-SI-${index}`,
      type: 'SALES_INVOICE' as const,
      status: 'ISSUED' as const,
      customer_name: 'Current customer',
      document_date: currentDate,
      created_at: currentTimestamp,
      updated_at: currentTimestamp,
    }));
    const oldPurchases = Array.from({ length: oldCount }, (_, index) => ({
      id: makeId('purchase', 'old', index),
      document_number: `OLD-PI-${index}`,
      type: 'PURCHASE_INVOICE' as const,
      status: 'ISSUED' as const,
      supplier_name: 'Historical supplier',
      document_date: '2000-01-01',
      created_at: oldTimestamp,
      updated_at: oldTimestamp,
    }));
    const currentPurchases = Array.from({ length: currentCount }, (_, index) => ({
      id: makeId('purchase', 'current', index),
      document_number: `CURRENT-PI-${index}`,
      type: 'PURCHASE_INVOICE' as const,
      status: 'ISSUED' as const,
      supplier_name: 'Current supplier',
      document_date: currentDate,
      created_at: currentTimestamp,
      updated_at: currentTimestamp,
    }));
    const oldFinance = Array.from({ length: oldCount }, (_, index) => ({
      id: makeId('finance', 'old', index),
      type: 'INCOME' as const,
      category: 'CURSOR_TEST',
      amount: 1,
      description: 'Historical finance noise',
      account_id: 'cursor-growth-account',
      account_type: 'ASSET' as const,
      created_at: oldTimestamp,
    }));
    const currentFinance = Array.from({ length: currentCount }, (_, index) => ({
      id: makeId('finance', 'current', index),
      type: 'INCOME' as const,
      category: 'CURSOR_TEST',
      amount: 10,
      description: 'Current finance row',
      account_id: 'cursor-growth-account',
      account_type: 'ASSET' as const,
      created_at: currentTimestamp,
    }));

    await db.transaction(
      'rw',
      db.transactions,
      db.salesDocuments,
      db.purchaseDocuments,
      db.financeTransactions,
      async () => {
        await db.transactions.bulkPut([...oldTransactions, ...currentTransactions]);
        await db.salesDocuments.bulkPut([...oldSales, ...currentSales]);
        await db.purchaseDocuments.bulkPut([...oldPurchases, ...currentPurchases]);
        await db.financeTransactions.bulkPut([...oldFinance, ...currentFinance]);
      },
    );

    const reads = { pos: 0, sales: 0, purchase: 0, finance: 0 };
    const trackPos = <T>(row: T) => { reads.pos += 1; return row; };
    const trackSales = <T>(row: T) => { reads.sales += 1; return row; };
    const trackPurchase = <T>(row: T) => { reads.purchase += 1; return row; };
    const trackFinance = <T>(row: T) => { reads.finance += 1; return row; };
    db.transactions.hook('reading', trackPos);
    db.salesDocuments.hook('reading', trackSales);
    db.purchaseDocuments.hook('reading', trackPurchase);
    db.financeTransactions.hook('reading', trackFinance);

    try {
      const posPage = await listTransactionHistoryPage({
        startDate: `${currentDate}T00:00:00.000Z`,
        endDate: `${currentDate}T23:59:59.999Z`,
        limit: 20,
      });
      const salesPage = await listSalesDocumentPage({
        type: 'SALES_INVOICE',
        startDate: currentDate,
        endDate: currentDate,
        limit: 20,
      });
      const purchasePage = await listPurchaseDocumentPage({
        type: 'PURCHASE_INVOICE',
        startDate: currentDate,
        endDate: currentDate,
        limit: 20,
      });
      const financePage = await listFinanceHistoryPage({
        startDate: `${currentDate}T00:00:00.000Z`,
        endDate: `${currentDate}T23:59:59.999Z`,
        accountId: 'cursor-growth-account',
        limit: 20,
      });

      return {
        posIds: posPage.rows.map((row) => row.id),
        salesIds: salesPage.rows.map((row) => row.id),
        purchaseIds: purchasePage.rows.map((row) => row.id),
        financeIds: financePage.rows.map((row) => row.id),
        cursors: [
          posPage.nextCursor,
          salesPage.nextCursor,
          purchasePage.nextCursor,
          financePage.nextCursor,
        ],
        reads,
      };
    } finally {
      db.transactions.hook('reading').unsubscribe(trackPos);
      db.salesDocuments.hook('reading').unsubscribe(trackSales);
      db.purchaseDocuments.hook('reading').unsubscribe(trackPurchase);
      db.financeTransactions.hook('reading').unsubscribe(trackFinance);
    }
  });

  expect(result.posIds).toHaveLength(20);
  expect(result.salesIds).toHaveLength(20);
  expect(result.purchaseIds).toHaveLength(20);
  expect(result.financeIds).toHaveLength(20);
  expect(result.cursors.every(Boolean)).toBe(true);
  expect([
    ...result.posIds,
    ...result.salesIds,
    ...result.purchaseIds,
    ...result.financeIds,
  ].every((id) => id.includes('-current-'))).toBe(true);
  expect(result.reads.pos).toBeLessThan(30);
  expect(result.reads.sales).toBeLessThan(30);
  expect(result.reads.purchase).toBeLessThan(30);
  expect(result.reads.finance).toBeLessThan(30);
});
