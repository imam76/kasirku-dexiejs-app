import { expect, test } from '@playwright/test';
import { registerFirstOwner } from './helpers/auth';

const FEATURED_ID = 'e2e-mobile-gr-01';
const FEATURED_NUMBER = 'GR-MOB-001';

const seedPurchaseReceipts = async (page: import('@playwright/test').Page) => {
  await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    const now = new Date().toISOString();
    await db.purchaseDocuments.bulkPut([
      {
        id: 'e2e-mobile-gr-01',
        document_number: 'GR-MOB-001',
        type: 'PURCHASE_RECEIPT' as const,
        status: 'DRAFT' as const,
        supplier_name: 'Supplier Mobile Satu',
        document_date: now,
        total_amount: 250_000,
        currency_code: 'IDR',
        base_currency_code: 'IDR',
        cost_status: 'PENDING' as const,
        created_at: new Date(Date.now() + 2000).toISOString(),
        updated_at: now,
        sync_status: 'pending' as const,
      },
      {
        id: 'e2e-mobile-gr-02',
        document_number: 'GR-MOB-002',
        type: 'PURCHASE_RECEIPT' as const,
        status: 'ISSUED' as const,
        supplier_name: 'Supplier Mobile Dua',
        document_date: now,
        total_amount: 500_000,
        currency_code: 'IDR',
        base_currency_code: 'IDR',
        cost_status: 'FINAL' as const,
        created_at: new Date(Date.now() + 1000).toISOString(),
        updated_at: now,
        sync_status: 'pending' as const,
      },
      {
        id: 'e2e-mobile-gr-03',
        document_number: 'GR-MOB-003',
        type: 'PURCHASE_RECEIPT' as const,
        status: 'ISSUED' as const,
        supplier_name: 'Supplier Mobile Tiga',
        document_date: now,
        total_amount: 750_000,
        currency_code: 'IDR',
        base_currency_code: 'IDR',
        cost_status: 'ESTIMATED' as const,
        created_at: now,
        updated_at: now,
        sync_status: 'pending' as const,
      },
    ]);
  });
};

test.describe('mobile purchase document list', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('uses cards with cost-status badge, filter drawer, tap-to-detail, and desktop fallback', async ({ page }) => {
    await registerFirstOwner(page);
    await seedPurchaseReceipts(page);

    await page.goto('/purchases/gr');

    await expect(page.getByRole('heading', { name: /Purchase Receipt/ })).toBeVisible();
    await expect(page.getByTestId('global-breadcrumb')).toContainText('Home');

    const mobileList = page.getByTestId('mobile-crud-list');
    await expect(mobileList).toBeVisible();
    await expect(page.locator('.ant-table')).toHaveCount(0);
    await expect(mobileList.getByTestId('mobile-crud-item')).toHaveCount(3);

    const featuredCard = mobileList.getByTestId('mobile-crud-item').filter({ hasText: FEATURED_NUMBER });
    await expect(featuredCard).toBeVisible();
    await expect(featuredCard.getByText('Supplier Mobile Satu')).toBeVisible();
    await expect(featuredCard.getByText('Belum Ada Harga')).toBeVisible();
    await expect(mobileList.getByText('Harga Final')).toBeVisible();
    await expect(mobileList.getByText('Harga Sementara')).toBeVisible();

    const addFab = page.getByRole('button', { name: 'Buat baru', exact: true });
    await expect(addFab).toBeVisible();

    const filterFab = page.getByRole('button', { name: 'Filter Dokumen', exact: true });
    await filterFab.click();
    const filterDrawer = page.getByRole('dialog').filter({ hasText: 'Filter Dokumen' });
    await expect(filterDrawer).toBeVisible();
    await filterDrawer.locator('.ant-select').click();
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content', { hasText: 'Draft' }).click();
    await filterDrawer.getByRole('button', { name: 'Terapkan' }).click();

    await expect(mobileList.getByTestId('mobile-crud-item')).toHaveCount(1);
    await expect(mobileList.getByText('Supplier Mobile Satu')).toBeVisible();

    await filterFab.click();
    await expect(filterDrawer).toBeVisible();
    await filterDrawer.getByRole('button', { name: 'Reset' }).click();
    await expect(mobileList.getByTestId('mobile-crud-item')).toHaveCount(3);
    await page.locator('.ant-drawer-close').click();
    await expect(filterDrawer).toBeHidden();

    await featuredCard.click();
    await expect(page).toHaveURL(new RegExp(`/purchases/gr/${FEATURED_ID}$`));
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
