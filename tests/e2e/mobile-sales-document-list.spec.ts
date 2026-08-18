import { expect, test } from '@playwright/test';
import { registerFirstOwner } from './helpers/auth';

const DOCUMENT_COUNT = 25;
/** `documents` query orders by `created_at` descending, jadi record ini (timestamp terbesar) selalu di posisi pertama tanpa perlu "Muat lagi". */
const FEATURED_INDEX = DOCUMENT_COUNT - 1;
const FEATURED_ID = `e2e-mobile-si-${String(FEATURED_INDEX + 1).padStart(2, '0')}`;
const FEATURED_NUMBER = `SI-MOB-${String(FEATURED_INDEX + 1).padStart(3, '0')}`;
const OLDEST_NUMBER = 'SI-MOB-001';

const seedSalesInvoices = async (page: import('@playwright/test').Page) => {
  await page.evaluate(async ({ documentCount, featuredIndex }) => {
    const { db } = await import('/src/lib/db.ts');
    const now = new Date().toISOString();
    await db.salesDocuments.bulkPut(Array.from({ length: documentCount }, (_, index) => ({
      id: `e2e-mobile-si-${String(index + 1).padStart(2, '0')}`,
      document_number: `SI-MOB-${String(index + 1).padStart(3, '0')}`,
      type: 'SALES_INVOICE' as const,
      status: index === featuredIndex ? 'DRAFT' as const : 'ISSUED' as const,
      customer_name: index === featuredIndex ? 'Toko Mobile Satu' : `Customer Mobile ${String(index + 1).padStart(2, '0')}`,
      document_date: now,
      total_amount: 100_000 + index * 1000,
      currency_code: 'IDR',
      base_currency_code: 'IDR',
      payment_status: index === featuredIndex ? 'UNPAID' as const : 'PAID' as const,
      created_at: new Date(Date.now() + index * 1000).toISOString(),
      updated_at: now,
      sync_status: 'pending' as const,
    })));
  }, { documentCount: DOCUMENT_COUNT, featuredIndex: FEATURED_INDEX });
};

test.describe('mobile sales document list', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('uses cards, filter drawer, progressive disclosure, tap-to-detail, and desktop fallback', async ({ page }) => {
    await registerFirstOwner(page);
    await seedSalesInvoices(page);

    await page.goto('/sales/si');

    await expect(page.getByRole('heading', { name: /Sales Invoice/ })).toBeVisible();
    await expect(page.getByTestId('global-breadcrumb')).toContainText('Home');

    const mobileList = page.getByTestId('mobile-crud-list');
    await expect(mobileList).toBeVisible();
    await expect(page.locator('.ant-table')).toHaveCount(0);
    await expect(mobileList.getByTestId('mobile-crud-item')).toHaveCount(20);
    await expect(page.getByText('Toko Mobile Satu')).toBeVisible();
    await expect(mobileList.getByTestId('mobile-crud-item').filter({ hasText: FEATURED_NUMBER })).toBeVisible();

    await mobileList.getByRole('button', { name: /Muat lagi/ }).click();
    await expect(mobileList.getByTestId('mobile-crud-item')).toHaveCount(DOCUMENT_COUNT);
    await expect(mobileList.getByTestId('mobile-crud-item').filter({ hasText: OLDEST_NUMBER })).toBeVisible();

    const addFab = page.getByRole('button', { name: 'Buat baru', exact: true });
    await expect(addFab).toBeVisible();
    const addFabBox = await addFab.boundingBox();
    expect(addFabBox?.width).toBeGreaterThanOrEqual(56);
    expect(addFabBox?.height).toBeGreaterThanOrEqual(56);

    const filterFab = page.getByRole('button', { name: 'Filter Dokumen', exact: true });
    await expect(filterFab).toBeVisible();
    await filterFab.click();
    const filterDrawer = page.getByRole('dialog').filter({ hasText: 'Filter Dokumen' });
    await expect(filterDrawer).toBeVisible();
    await filterDrawer.locator('.ant-select').click();
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content', { hasText: 'Draft' }).click();
    await filterDrawer.getByRole('button', { name: 'Terapkan' }).click();

    await expect(mobileList.getByTestId('mobile-crud-item')).toHaveCount(1);
    await expect(page.getByText('Toko Mobile Satu')).toBeVisible();

    await filterFab.click();
    await expect(filterDrawer).toBeVisible();
    await filterDrawer.getByRole('button', { name: 'Reset' }).click();
    await expect(mobileList.getByTestId('mobile-crud-item')).toHaveCount(20);
    await page.locator('.ant-drawer-close').click();
    await expect(filterDrawer).toBeHidden();

    await mobileList.getByTestId('mobile-crud-item').filter({ hasText: FEATURED_NUMBER }).click();
    await expect(page).toHaveURL(new RegExp(`/sales/si/${FEATURED_ID}$`));
    await expect(page.getByRole('heading', { name: FEATURED_NUMBER })).toBeVisible();

    await page.goBack();
    await expect(page.getByTestId('mobile-crud-list')).toBeVisible();

    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      const hasHorizontalOverflow = await page.evaluate(() => (
        document.documentElement.scrollWidth > document.documentElement.clientWidth
      ));
      expect(hasHorizontalOverflow).toBe(false);
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByTestId('mobile-crud-list')).toHaveCount(0);
    await expect(page.locator('.ant-table')).toBeVisible();
  });
});
