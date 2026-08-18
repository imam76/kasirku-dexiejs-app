import { expect, test } from '@playwright/test';
import { registerFirstOwner } from './helpers/auth';

test.describe('mobile stock-in document composer', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('uses cards and a bottom sheet editor, matches desktop fallback', async ({ page }) => {
    await registerFirstOwner(page);

    await page.evaluate(async () => {
      const { db } = await import('/src/lib/db.ts');
      const now = new Date().toISOString();
      await db.products.put({
        id: 'e2e-mobile-stockin-01',
        name: 'Beras Mobile 5kg',
        category: 'sembako',
        purchase_unit: 'karung',
        selling_unit: 'karung',
        purchase_price: 65_000,
        selling_price: 75_000,
        stock: 0,
        product_type: 'FINISHED_GOOD',
        is_visible_in_pos: true,
        sku: 'STK-001',
        verification_status: 'VERIFIED',
        created_at: now,
        updated_at: now,
        sync_status: 'pending',
      });
      await db.contacts.put({
        id: 'e2e-mobile-stockin-supplier-01',
        name: 'Toko Beras Mobile',
        contact_type: 'SUPPLIER',
        is_active: true,
        created_at: now,
        updated_at: now,
        sync_status: 'pending',
      });
    });

    await page.goto('/inventory/stock-in');

    const mobileList = page.getByTestId('mobile-crud-list');
    await expect(mobileList).toBeVisible();
    await expect(page.locator('.ant-table')).toHaveCount(0);
    await expect(mobileList.getByTestId('mobile-crud-item')).toHaveCount(1);
    await expect(mobileList.getByText('Pilih produk')).toBeVisible();

    await page.getByRole('button', { name: 'Edit baris Pilih produk' }).click();

    const rowSheet = page.getByTestId('stock-in-row-sheet');
    await expect(rowSheet).toBeVisible();

    await rowSheet.locator('.ant-select').first().click();
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content', { hasText: 'Beras Mobile 5kg' }).click();

    const quantityInput = rowSheet.locator('.ant-input-number-input').first();
    await quantityInput.fill('10');
    await quantityInput.blur();

    await page.locator('.ant-drawer-close').click();
    await expect(rowSheet).toBeHidden();

    const firstCard = mobileList.getByTestId('mobile-crud-item').first();
    await expect(firstCard).toContainText('Beras Mobile 5kg');
    await expect(firstCard).toContainText('10 karung');

    await page.getByRole('button', { name: 'Tambah Baris' }).click();
    await expect(mobileList.getByTestId('mobile-crud-item')).toHaveCount(2);

    await page.getByRole('button', { name: /^Edit baris Pilih produk$/ }).click();
    await expect(rowSheet).toBeVisible();
    await rowSheet.getByRole('button', { name: 'Hapus baris' }).click();
    await expect(rowSheet).toBeHidden();
    await expect(mobileList.getByTestId('mobile-crud-item')).toHaveCount(1);

    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      const hasHorizontalOverflow = await page.evaluate(() => (
        document.documentElement.scrollWidth > document.documentElement.clientWidth
      ));
      expect(hasHorizontalOverflow).toBe(false);
    }
    await page.setViewportSize({ width: 390, height: 844 });

    await page.getByRole('combobox').click();
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content', { hasText: 'Toko Beras Mobile' }).click();

    await page.getByRole('button', { name: 'Simpan', exact: true }).click();
    const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Simpan stok masuk' });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Simpan' }).click();
    await expect(confirmDialog).toBeHidden();

    await expect(mobileList.getByTestId('mobile-crud-item')).toHaveCount(1);
    await expect(mobileList.getByText('Pilih produk')).toBeVisible();

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByTestId('mobile-crud-list')).toHaveCount(0);
    await expect(page.locator('.ant-table')).toBeVisible();
  });
});
