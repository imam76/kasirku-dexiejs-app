import { expect, test } from '@playwright/test';
import { registerFirstOwner } from './helpers/auth';

test.describe('mobile product CRUD standard', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('uses cards, drawers, progressive disclosure, and desktop fallback', async ({ page }) => {
    await registerFirstOwner(page);

    await page.evaluate(async () => {
      const { db } = await import('/src/lib/db.ts');
      const now = new Date().toISOString();
      await db.products.bulkPut(Array.from({ length: 25 }, (_, index) => ({
        id: `e2e-mobile-product-${String(index + 1).padStart(2, '0')}`,
        name: index === 0 ? 'Kopi Arabika Mobile' : `Produk Mobile ${String(index + 1).padStart(2, '0')}`,
        category: index === 0 ? 'kopi' : 'non_consumable',
        purchase_unit: 'pcs',
        selling_unit: 'pcs',
        purchase_price: 10_000 + index,
        selling_price: 15_000 + index,
        stock: index,
        product_type: 'FINISHED_GOOD',
        is_visible_in_pos: index !== 1,
        sku: `MOB-${String(index + 1).padStart(3, '0')}`,
        verification_status: index === 0 ? 'UNVERIFIED' : 'VERIFIED',
        created_at: new Date(Date.now() + index * 1000).toISOString(),
        updated_at: now,
        sync_status: 'pending',
      })));
    });

    await page.goto('/master-data/products');

    const pageHeader = page.getByTestId('mobile-product-page-header');
    await expect(pageHeader).toBeVisible();
    await expect(pageHeader.getByTestId('global-breadcrumb')).toContainText('Home');
    await expect(pageHeader.getByRole('heading', { name: 'Manajemen Stok' })).toBeVisible();
    const addProductFab = page.locator('.ant-float-btn[data-tour="stock-add-product"]');
    await expect(addProductFab).toBeVisible();
    const addProductFabBox = await addProductFab.boundingBox();
    expect(addProductFabBox?.width).toBeGreaterThanOrEqual(56);
    expect(addProductFabBox?.height).toBeGreaterThanOrEqual(56);
    const searchFilterFab = page.getByTestId('stock-search-filter-fab');
    await expect(searchFilterFab).toBeVisible();
    await expect(searchFilterFab).toHaveClass(/ant-float-btn-circle/);
    await expect(searchFilterFab).toHaveClass(/ant-float-btn-default/);
    await expect(page.getByRole('searchbox')).toHaveCount(0);
    await expect(pageHeader).toHaveCSS('position', 'fixed');

    const navbarBox = await page.getByTestId('app-top-navbar').boundingBox();
    const pageHeaderBox = await pageHeader.boundingBox();
    expect(Math.abs(
      (pageHeaderBox?.y ?? 0) - ((navbarBox?.y ?? 0) + (navbarBox?.height ?? 0)),
    )).toBeLessThanOrEqual(1);

    const mobileList = page.getByTestId('mobile-crud-list');
    await expect(mobileList).toBeVisible();
    await expect(page.locator('.ant-table')).toHaveCount(0);
    await expect(mobileList.getByTestId('mobile-crud-item')).toHaveCount(20);

    await mobileList.getByRole('button', { name: /Muat lagi/ }).click();
    await expect(mobileList.getByTestId('mobile-crud-item')).toHaveCount(25);

    await page.getByRole('button', { name: 'Buka aksi untuk produk Kopi Arabika Mobile' }).click();
    const actionDrawer = page.getByRole('dialog').filter({ hasText: 'Kopi Arabika Mobile' });
    await expect(actionDrawer).toBeVisible();
    await expect(actionDrawer.getByRole('button', { name: /Edit produk/ })).toBeVisible();
    await expect(actionDrawer.getByRole('button', { name: /Tandai Terverifikasi/ })).toBeVisible();
    await expect(actionDrawer.getByRole('button', { name: /Kelola Saldo Awal Persediaan/ })).toBeVisible();

    await actionDrawer.getByRole('button', { name: /Hapus produk/ }).click();
    const deleteDialog = page.getByRole('dialog').filter({ hasText: 'Hapus Produk' });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole('button', { name: 'Batal' }).click();

    await page.getByRole('button', { name: 'Lihat detail produk Kopi Arabika Mobile' }).click();
    const detailSheet = page.getByTestId('stock-detail-sheet');
    await expect(detailSheet).toBeVisible();
    await expect(detailSheet.getByText('Kopi Arabika Mobile')).toBeVisible();
    await detailSheet.getByRole('button', { name: 'Edit Produk' }).click();

    const editor = page.getByRole('dialog').filter({ has: page.getByTestId('stock-product-name') });
    await expect(editor).toBeVisible();
    await expect(editor.getByTestId('stock-product-name')).toHaveValue('Kopi Arabika Mobile');
    const editorBox = await editor.boundingBox();
    expect(editorBox?.width).toBeCloseTo(390, 1);
    await editor.getByRole('button', { name: 'Batal' }).click();

    await page.getByRole('button', { name: 'Tambah', exact: true }).click();
    const createEditor = page.getByRole('dialog').filter({ hasText: 'Tambah Produk Baru' });
    await expect(createEditor).toBeVisible();
    await createEditor.getByTestId('stock-product-name').fill('Produk Idempoten Mobile');
    await createEditor.getByRole('button', { name: 'Simpan' }).evaluate((button) => {
      button.click();
      button.click();
    });
    await expect(createEditor).toBeHidden();
    const duplicateSaveCount = await page.evaluate(async () => {
      const { db } = await import('/src/lib/db.ts');
      return db.products.where('name').equals('Produk Idempoten Mobile').count();
    });
    expect(duplicateSaveCount).toBe(1);

    await searchFilterFab.click();
    const filterDrawer = page.getByRole('dialog').filter({ hasText: 'Filter Produk' });
    await expect(filterDrawer).toBeVisible();
    await expect(filterDrawer.getByRole('searchbox', { name: 'Cari produk berdasarkan nama atau SKU...' })).toBeVisible();
    await expect(filterDrawer.getByRole('button', { name: 'Terapkan' })).toBeVisible();
    await filterDrawer.getByRole('button', { name: 'Terapkan' }).click();

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
