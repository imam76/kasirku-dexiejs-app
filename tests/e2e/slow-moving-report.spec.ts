import { expect, test } from '@playwright/test';
import { registerFirstOwner } from './helpers/auth';

test.use({ actionTimeout: 10_000, timezoneId: 'Asia/Tokyo' });

test('slow-moving report includes unsold products, nets returns, filters dates, updates live and exports all pages', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-28T05:00:00.000Z'));
  await registerFirstOwner(page);
  await page.evaluate(async () => {
    localStorage.setItem('feedback_wave1_submitted', 'true');
    localStorage.setItem('feedback_wave2_submitted', 'true');
    const { db } = await import('/src/lib/db.ts');
    const now = '2026-09-28T05:00:00.000Z';
    await db.products.bulkPut(Array.from({ length: 32 }, (_, index) => ({
      id: `slow-test-${index}`, name: `Slow Test ${String(index).padStart(2, '0')}`, sku: `SLOW-${String(index).padStart(2, '0')}`,
      category: 'minuman', purchase_unit: 'pcs', selling_unit: 'pcs', stock: index === 4 ? 0 : 20,
      purchase_price: 1000, selling_price: 2000, product_type: 'FINISHED_GOOD' as const,
      is_visible_in_pos: true, created_at: '2026-07-01T00:00:00.000Z', updated_at: now,
    })));
    const sale = (id: string, created_at = now) => ({ id, transaction_number: id, total_amount: 12000, payment_amount: 12000,
      change_amount: 0, payment_method: 'TUNAI' as const, created_at });
    await db.transactions.bulkPut([sale('slow-sale'), sale('slow-refunded-sale'), sale('slow-old-sale', '2026-08-15T05:00:00.000Z'),
      { ...sale('slow-void'), status: 'VOIDED' as const }]);
    const line = (id: string, transaction_id: string, product: number, quantity: number) => ({ id, transaction_id, product_id: `slow-test-${product}`,
      product_name: `Slow Test ${String(product).padStart(2, '0')}`, price: 2000, purchase_price: 1000, quantity, unit: 'pcs',
      subtotal: quantity * 2000, profit: quantity * 1000, created_at: now });
    await db.transactionItems.bulkPut([line('slow-line', 'slow-sale', 1, 6), line('slow-refunded-line', 'slow-refunded-sale', 3, 3),
      line('slow-old-line', 'slow-old-sale', 0, 10), line('slow-void-line', 'slow-void', 5, 99)]);
    await db.salesDocuments.bulkPut([
      { id: 'slow-invoice', document_number: 'SLOW-INV', type: 'SALES_INVOICE', status: 'ISSUED', customer_name: 'Test',
        document_date: '2026-09-28', source_document_type: 'SALES_DELIVERY', source_document_id: 'slow-delivery', created_at: now, updated_at: now },
      { id: 'slow-delivery', document_number: 'SLOW-DEL', type: 'SALES_DELIVERY', status: 'ISSUED', customer_name: 'Test',
        document_date: '2026-09-28', created_at: now, updated_at: now },
    ]);
    await db.salesDocumentItems.bulkPut(['slow-invoice', 'slow-delivery'].map((id) => ({ id: `${id}-line`, document_id: id,
      product_id: 'slow-test-2', product_name: 'Slow Test 02', unit: 'pcs', quantity: 8, created_at: now })));
    await db.salesReturns.bulkPut([
      { id: 'slow-return', source_id: 'slow-sale' }, { id: 'slow-full-return', source_id: 'slow-refunded-sale' },
    ].map((doc) => ({ ...doc, return_number: doc.id, status: 'ISSUED' as const, source_type: 'POS_TRANSACTION' as const,
      source_number: doc.source_id, customer_name: 'Test', document_date: '2026-09-28', resolution: 'REFUND' as const,
      subtotal_amount: 4000, total_amount: 4000, created_at: now, updated_at: now })));
    await db.salesReturnItems.bulkPut([
      { id: 'slow-return-line', return_id: 'slow-return', source_item_id: 'slow-line', product_id: 'slow-test-1', quantity: 2 },
      { id: 'slow-full-return-line', return_id: 'slow-full-return', source_item_id: 'slow-refunded-line', product_id: 'slow-test-3', quantity: 3 },
    ].map((line) => ({ ...line, product_name: 'Test', unit: 'pcs', source_quantity: 6, price: 2000, subtotal: 4000,
      total_amount: 4000, condition: 'SELLABLE' as const, created_at: now })));
  });
  await page.goto('/report');
  await page.getByRole('link', { name: /Laporan Produk Slow Moving/ }).click();
  await expect(page.getByRole('heading', { name: 'Laporan Produk Slow Moving' })).toBeVisible();
  const search = page.getByRole('textbox', { name: /Cari produk/ });
  await search.fill('Slow Test');
  await expect(page.getByTestId('slow-moving-count')).toHaveText('30');
  await expect(page.getByTestId('slow-moving-zero')).toHaveText('29');
  await expect(page.getByTestId('slow-moving-slow')).toHaveText('1');
  await expect(page.getByTestId('slow-moving-range')).toContainText('01/09/2026 sampai 28/09/2026');

  await page.getByRole('button', { name: /Export/ }).click();
  await page.getByRole('menuitem', { name: /^CSV/ }).hover();
  const saveCsv = page.locator('[data-menu-id$="csv:save"]');
  const [download] = await Promise.all([page.waitForEvent('download'), saveCsv.click()]);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString('utf8');
  expect(csv).toContain('Slow Test 31');
  expect(csv).toContain('Slow Test 01,SLOW-01,Minuman,pcs,20,6,2,4,');
  expect(csv).not.toContain('Slow Test 02');
  expect(csv).not.toContain('Slow Test 04');

  // A synced sale-line correction reclassifies the product without reloading.
  await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    await db.transactionItems.update('slow-line', { quantity: 9 });
  });
  await expect(page.getByTestId('slow-moving-count')).toHaveText('29');
  await page.getByRole('spinbutton', { name: 'Batas slow moving' }).fill('10');
  await expect(page.getByTestId('slow-moving-count')).toHaveText('31');
  await expect(page.getByTestId('slow-moving-slow')).toHaveText('2');
  await search.fill('SLOW-02');
  await expect(page.getByRole('row').filter({ hasText: 'Slow Test 02' })).toContainText('8 pcs');

  const period = page.getByRole('combobox', { name: 'Periode laporan' });
  await search.fill('SLOW-00');
  await period.click();
  await page.getByText('Hari ini', { exact: true }).click();
  await expect(page.getByTestId('slow-moving-range')).toContainText('28/09/2026 sampai 28/09/2026');
  await expect(page.getByTestId('slow-moving-zero')).toHaveText('1');
  await period.click();
  await page.getByText('Minggu ini', { exact: true }).click();
  await expect(page.getByTestId('slow-moving-range')).toContainText('28/09/2026 sampai 28/09/2026');
  await period.click();
  await page.getByText('Bulan lalu', { exact: true }).click();
  await expect(page.getByTestId('slow-moving-range')).toContainText('01/08/2026 sampai 31/08/2026');
  await expect(page.getByTestId('slow-moving-slow')).toHaveText('1');
  await expect(page.getByRole('row').filter({ hasText: 'Slow Test 00' })).toContainText('10 pcs');

  await page.getByRole('textbox', { name: 'Tanggal akhir' }).fill('15/08/2026');
  await page.getByRole('textbox', { name: 'Tanggal akhir' }).press('Enter');
  await page.getByRole('textbox', { name: 'Tanggal mulai' }).fill('15/08/2026');
  await page.getByRole('textbox', { name: 'Tanggal mulai' }).press('Enter');
  await expect(page.getByTestId('slow-moving-range')).toHaveText('15/08/2026 sampai 15/08/2026 · 1 hari');
  await expect(page.getByRole('row').filter({ hasText: 'Slow Test 00' })).toContainText('10 pcs');
  await page.getByRole('heading', { name: 'Laporan Produk Slow Moving' }).click();
  await page.getByRole('row').filter({ hasText: 'Slow Test 00' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/slow-moving-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await page.getByTestId('slow-moving-report').boundingBox())?.x ?? Infinity).toBeLessThan(40);
  await expect(page.getByTestId('slow-moving-count')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/slow-moving-mobile.png', fullPage: true });
  const mobileProduct = page.getByTestId('slow-moving-product-slow-test-0');
  await mobileProduct.scrollIntoViewIfNeeded();
  await expect(mobileProduct).toContainText('Slow moving');
  await expect(mobileProduct).toContainText('Terjual bersih10 pcs');
  await page.screenshot({ path: 'test-results/slow-moving-mobile-product.png', fullPage: true });
  await search.fill('nothing-matches');
  await expect(page.getByText('Tidak ada produk yang sesuai filter dan periode ini.')).toBeVisible();
  await expect(page.getByTestId('slow-moving-count')).toHaveText('0');
});
