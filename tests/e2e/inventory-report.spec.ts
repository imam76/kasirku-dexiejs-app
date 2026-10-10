import { expect, test } from '@playwright/test';
import { read, utils } from 'xlsx';
import { registerFirstOwner } from './helpers/auth';

test.use({ actionTimeout: 10_000 });

test('inventory report values FIFO, updates live, filters and exports the full result on desktop and mobile', async ({ page }) => {
  await registerFirstOwner(page);
  await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    const date = '2026-09-28T00:00:00.000Z';
    const products = Array.from({ length: 31 }, (_, index) => ({
      id: `inventory-test-${index}`, name: `Produk Laporan ${String(index).padStart(2, '0')}`, sku: `INV-${index}`,
      category: 'minuman', purchase_unit: 'pcs', selling_unit: 'pcs', stock: 5, purchase_price: 999,
      selling_price: 1500, product_type: 'FINISHED_GOOD' as const, is_visible_in_pos: true, created_at: date, updated_at: date,
    }));
    await db.products.bulkPut(products);
    await db.inventoryLots.bulkPut(products.flatMap((product) => [
      { id: `${product.id}-lot-a`, product_id: product.id, product_name: product.name, source_type: 'PURCHASE_RECEIPT' as const,
        quantity_received: 2, quantity_remaining: 2, cost_per_unit: 100, cost_status: 'FINAL' as const, received_at: date, created_at: date, updated_at: date },
      { id: `${product.id}-lot-b`, product_id: product.id, product_name: product.name, source_type: 'PURCHASE_RECEIPT' as const,
        quantity_received: 3, quantity_remaining: 3, cost_per_unit: 200, cost_status: 'FINAL' as const, received_at: date, created_at: date, updated_at: date },
    ]));
  });
  await page.goto('/report');
  await page.getByRole('link', { name: /Laporan Persediaan/ }).click();
  await expect(page.getByRole('heading', { name: 'Laporan Persediaan' })).toBeVisible();
  const search = page.getByRole('textbox', { name: /Cari produk/ });
  await search.fill('Produk Laporan');
  await expect(page.getByTestId('inventory-product-count')).toHaveText('31');
  await expect(page.getByTestId('inventory-total-value')).toHaveText('Rp 24.800');
  await expect(page.getByTestId('inventory-quantities')).toHaveText('155 pcs');

  // Exports must include page 2, not just the 25 visible table rows.
  await page.getByRole('button', { name: /Export/ }).click();
  await page.getByRole('menuitem', { name: /^CSV/ }).hover();
  const saveCsv = page.locator('[data-menu-id$="csv:save"]');
  await expect(saveCsv).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), saveCsv.click()]);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString('utf8');
  expect(csv).toContain('Produk Laporan 30');
  expect(csv).toContain('24800');

  await page.getByRole('button', { name: /Export/ }).click();
  await page.getByRole('menuitem', { name: /^Excel/ }).hover();
  const saveExcel = page.locator('[data-menu-id$="xlsx:save"]');
  await expect(saveExcel).toBeVisible();
  const [excelDownload] = await Promise.all([page.waitForEvent('download'), saveExcel.click()]);
  const excelStream = await excelDownload.createReadStream();
  const excelChunks = [];
  for await (const chunk of excelStream!) excelChunks.push(chunk);
  const workbook = read(Buffer.concat(excelChunks), { type: 'buffer' });
  expect(workbook.SheetNames).toEqual(['Ringkasan', 'Rincian Persediaan']);
  const exportedProducts = utils.sheet_to_json<unknown[]>(workbook.Sheets['Rincian Persediaan'], { header: 1 });
  expect(exportedProducts).toHaveLength(32);
  expect(exportedProducts[31][0]).toBe('Produk Laporan 30');

  // A remotely merged consumption changes fifo_remaining while quantity_remaining is stale.
  await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    await db.transaction('rw', db.products, db.inventoryLotConsumptions, async () => {
      await db.products.update('inventory-test-0', { stock: 4 });
      await db.inventoryLotConsumptions.put({ id: 'inventory-report-consumption', lot_id: 'inventory-test-0-lot-a',
        product_id: 'inventory-test-0', product_name: 'Produk Laporan 00', source_type: 'POS_SALE', source_id: 'sale-test',
        source_line_id: 'line-test', quantity: 1, cost_per_unit_at_consumption: 100, cost_status_at_consumption: 'FINAL',
        created_at: '2026-09-28T01:00:00.000Z' });
    });
  });
  await expect(page.getByTestId('inventory-total-value')).toHaveText('Rp 24.700');
  await search.fill('INV-0');
  await expect(page.getByTestId('inventory-product-count')).toHaveText('1');
  await expect(page.getByTestId('inventory-total-value')).toHaveText('Rp 700');
  await page.screenshot({ path: 'test-results/inventory-report-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await page.getByTestId('inventory-report').boundingBox())?.x ?? Infinity).toBeLessThan(40);
  await expect(page.getByTestId('inventory-total-value')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/inventory-report-mobile.png', fullPage: true });
  await page.getByTestId('inventory-total-value').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/inventory-report-mobile-value.png', fullPage: true });
  await search.fill('tidak-ada-produk');
  await expect(page.getByText('Tidak ada produk yang sesuai filter.')).toBeVisible();
  await expect(page.getByTestId('inventory-total-value')).toHaveText('Rp 0');
});
