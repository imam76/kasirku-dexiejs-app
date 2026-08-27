import { expect, test } from '@playwright/test';
import { registerFirstOwner } from './helpers/auth';

const seedFixtures = async (page: import('@playwright/test').Page) => {
  await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    const now = new Date().toISOString();
    await db.products.put({
      id: 'e2e-mobile-si-product-01',
      name: 'Kopi Susu E2E',
      category: 'kopi',
      purchase_unit: 'pcs',
      selling_unit: 'pcs',
      purchase_price: 12_000,
      selling_price: 20_000,
      stock: 100,
      product_type: 'FINISHED_GOOD',
      is_visible_in_pos: true,
      sku: 'MSC-001',
      verification_status: 'VERIFIED',
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
    });
    await db.contacts.put({
      id: 'e2e-mobile-si-contact-01',
      name: 'Warung E2E Mobile',
      contact_type: 'CUSTOMER',
      is_active: true,
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
    });
  });
};

test.describe('mobile sales document composer', () => {
  test.use({ viewport: { width: 375, height: 844 } });

  test('hub composer: fill via spokes, edit item discount, save draft, reload, issue from detail', async ({ page }) => {
    await registerFirstOwner(page);
    await seedFixtures(page);

    await page.goto('/sales/si/new');
    await expect(page.getByRole('heading', { name: /Sales Invoice/ })).toBeVisible();

    for (const width of [320, 360, 375, 430]) {
      await page.setViewportSize({ width, height: 844 });
      const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(hasOverflow).toBe(false);
    }
    await page.setViewportSize({ width: 375, height: 844 });

    await page.getByRole('button', { name: /Customer & Tanggal/ }).click();
    let editor = page.getByRole('dialog');
    await expect(editor).toBeVisible();
    await editor.locator('.ant-select').first().click();
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content', { hasText: 'Warung E2E Mobile' }).click();

    const dueDateInput = editor.locator('.ant-picker input').nth(1);
    await dueDateInput.click();
    await page.locator('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden) .ant-picker-cell-today .ant-picker-cell-inner').click();

    await page.locator('.ant-drawer-close').first().click();
    await expect(editor).toBeHidden();
    await expect(page.getByText('Warung E2E Mobile').first()).toBeVisible();

    await page.getByRole('button', { name: /^Item \(0\)/ }).click();
    editor = page.getByRole('dialog');
    await expect(editor).toBeVisible();
    await editor.getByTestId('mobile-crud-item').first().click();
    const itemEditor = page.getByRole('dialog').last();
    await itemEditor.locator('.ant-select').first().click();
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content', { hasText: 'Kopi Susu E2E' }).click();

    const qtyInput = itemEditor.locator('.ant-input-number-input').first();
    await qtyInput.fill('4');
    await qtyInput.blur();
    await expect(itemEditor.getByText(/80\.000/)).toBeVisible();

    const discountValueInput = itemEditor.locator('.ant-input-number-input').nth(2);
    await discountValueInput.fill('5000');
    await discountValueInput.blur();
    await expect(itemEditor.getByText(/75\.000/)).toBeVisible();

    await page.locator('.ant-drawer-close').last().click();
    await page.locator('.ant-drawer-close').first().click();

    await expect(page.getByRole('button', { name: /^Item \(1\)/ })).toBeVisible();
    await expect(page.getByText(/75\.000/).first()).toBeVisible();

    await page.getByRole('button', { name: 'Simpan Draft' }).click();
    await expect(page.getByText('Warung E2E Mobile').first()).toBeVisible();
    await expect(page.getByText('Kopi Susu E2E')).toBeVisible();
    await expect(page.locator('table')).toHaveCount(0);

    await page.getByRole('button', { name: 'Edit Draft' }).click();
    await expect(page.getByRole('button', { name: /^Item \(1\)/ })).toBeVisible();
    await expect(page.getByText('Warung E2E Mobile').first()).toBeVisible();

    await page.getByRole('button', { name: /Customer & Tanggal/ }).click();
    editor = page.getByRole('dialog');
    await expect(editor.locator('.ant-select').first()).toContainText('Warung E2E Mobile');
    await page.locator('.ant-drawer-close').first().click();

    await page.goBack();
    await expect(page.getByRole('button', { name: 'Terbitkan' })).toBeVisible();
    await page.getByRole('button', { name: 'Terbitkan' }).click();
    await expect(page.getByText('TERBIT')).toBeVisible();

    for (const width of [320, 360, 375, 430]) {
      await page.setViewportSize({ width, height: 844 });
      const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(hasOverflow).toBe(false);
    }
    await expect(page.getByText('Kopi Susu E2E')).toBeVisible();
    await expect(page.locator('table')).toHaveCount(0);
  });

  test('quotation, order, delivery hubs render with correct spokes', async ({ page }) => {
    await registerFirstOwner(page);

    await page.goto('/sales/sq/new');
    await expect(page.getByRole('heading', { name: /Sales Quotation/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Customer & Tanggal/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Diskon & Pajak Dokumen/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Detail Lainnya/ })).toBeVisible();

    await page.goto('/sales/so/new');
    await expect(page.getByRole('heading', { name: /Sales Order/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Customer & Tanggal/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Diskon & Pajak Dokumen/ })).toBeVisible();

    await page.goto('/sales/sd/new');
    await expect(page.getByRole('heading', { name: /Sales Delivery/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Customer & Tanggal/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Diskon & Pajak Dokumen/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Item \(0\)/ })).toBeVisible();

    for (const width of [320, 360, 375, 430]) {
      await page.setViewportSize({ width, height: 844 });
      const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(hasOverflow).toBe(false);
    }
  });

  test('desktop: virtual table and flat layout unchanged', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await registerFirstOwner(page);
    await seedFixtures(page);

    await page.goto('/sales/si/new');
    await expect(page.getByRole('heading', { name: /Sales Invoice/ })).toBeVisible();
    await expect(page.getByTestId('mobile-crud-list')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Customer & Tanggal/ })).toHaveCount(0);
    await expect(page.locator('text=Pilih customer')).toBeVisible();
    await expect(page.locator('[data-index]').first()).toBeVisible();
  });
});
