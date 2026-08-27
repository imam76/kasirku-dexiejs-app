import { expect, test } from '@playwright/test';
import { registerFirstOwner } from './helpers/auth';

test.describe('quick purchase from selected stock', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('mode pilih di ponsel membawa produk terpilih ke dokumen pembelian', async ({ page }) => {
    await registerFirstOwner(page);

    await page.evaluate(async () => {
      const { db } = await import('/src/lib/db.ts');
      const now = new Date().toISOString();
      await db.products.bulkPut([
        {
          id: 'e2e-quick-purchase-1',
          name: 'Gula Pasir Menipis',
          category: 'non_consumable',
          purchase_unit: 'kg',
          selling_unit: 'kg',
          purchase_price: 14_000,
          selling_price: 16_000,
          stock: 2,
          min_stock: 10,
          product_type: 'FINISHED_GOOD',
          is_visible_in_pos: true,
          sku: 'QP-001',
          created_at: now,
          updated_at: now,
          sync_status: 'pending',
        },
        {
          id: 'e2e-quick-purchase-2',
          name: 'Kopi Bubuk Menipis',
          category: 'kopi',
          purchase_unit: 'kg',
          selling_unit: 'kg',
          purchase_price: 90_000,
          selling_price: 120_000,
          stock: 1,
          min_stock: 5,
          product_type: 'FINISHED_GOOD',
          is_visible_in_pos: true,
          sku: 'QP-002',
          created_at: now,
          updated_at: now,
          sync_status: 'pending',
        },
      ]);
    });

    await page.goto('/master-data/products');

    const list = page.getByTestId('mobile-crud-list');
    await expect(list).toBeVisible();
    await expect(list.getByRole('checkbox')).toHaveCount(0);

    await page.getByRole('button', { name: 'Buka aksi untuk produk Gula Pasir Menipis' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Pilih produk/ }).click();

    await expect(list.getByRole('checkbox')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Lihat detail produk Gula Pasir Menipis' }))
      .toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Lihat detail produk Kopi Bubuk Menipis' }).click();
    await expect(page.getByRole('button', { name: 'Lihat detail produk Kopi Bubuk Menipis' }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('stock-detail-sheet')).toHaveCount(0);

    const list2 = page.getByTestId('mobile-crud-list');
    await list2.getByRole('button', { name: /Pilih semua/ }).click();
    await expect(list2.getByText('2 produk dipilih')).toBeVisible();

    const bulkFab = page.getByTestId('stock-bulk-purchase-fab');
    await expect(bulkFab).toBeVisible();
    await bulkFab.click();

    const bulkSheet = page.getByRole('dialog').filter({ hasText: 'Buat Pembelian' });
    await expect(bulkSheet.getByText('2 produk dipilih')).toBeVisible();
    await bulkSheet.getByRole('button', { name: 'Purchase Order' }).click();

    await expect(page).toHaveURL(/\/purchases\/po\/new$/);
    await expect(page.getByText('Gula Pasir Menipis')).toBeVisible();
    await expect(page.getByText('Kopi Bubuk Menipis')).toBeVisible();
  });

  test('tekan lama membuka mode pilih', async ({ page }) => {
    await registerFirstOwner(page);

    await page.evaluate(async () => {
      const { db } = await import('/src/lib/db.ts');
      const now = new Date().toISOString();
      await db.products.put({
        id: 'e2e-quick-purchase-press',
        name: 'Susu Kental Menipis',
        category: 'non_consumable',
        purchase_unit: 'kaleng',
        selling_unit: 'kaleng',
        purchase_price: 11_000,
        selling_price: 14_000,
        stock: 1,
        min_stock: 8,
        product_type: 'FINISHED_GOOD',
        is_visible_in_pos: true,
        sku: 'QP-004',
        created_at: now,
        updated_at: now,
        sync_status: 'pending',
      });
    });

    await page.goto('/master-data/products');

    const list = page.getByTestId('mobile-crud-list');
    const card = page.getByRole('button', { name: 'Lihat detail produk Susu Kental Menipis' });
    await expect(card).toBeVisible();

    const box = await card.boundingBox();
    const point = { clientX: (box?.x ?? 0) + 20, clientY: (box?.y ?? 0) + 20, pointerType: 'touch' };
    await card.dispatchEvent('pointerdown', point);
    await page.waitForTimeout(600);
    await card.dispatchEvent('pointerup', point);

    await expect(list.getByRole('checkbox')).toHaveCount(1);
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('stock-bulk-purchase-fab')).toBeVisible();
    await expect(page.getByTestId('stock-detail-sheet')).toHaveCount(0);
  });

  test('mode pilih berakhir saat centang terakhir dilepas', async ({ page }) => {
    await registerFirstOwner(page);

    await page.evaluate(async () => {
      const { db } = await import('/src/lib/db.ts');
      const now = new Date().toISOString();
      await db.products.put({
        id: 'e2e-quick-purchase-solo',
        name: 'Teh Celup Menipis',
        category: 'non_consumable',
        purchase_unit: 'box',
        selling_unit: 'box',
        purchase_price: 12_000,
        selling_price: 15_000,
        stock: 1,
        min_stock: 6,
        product_type: 'FINISHED_GOOD',
        is_visible_in_pos: true,
        sku: 'QP-003',
        created_at: now,
        updated_at: now,
        sync_status: 'pending',
      });
    });

    await page.goto('/master-data/products');

    const list = page.getByTestId('mobile-crud-list');
    await page.getByRole('button', { name: 'Buka aksi untuk produk Teh Celup Menipis' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Pilih produk/ }).click();
    await expect(list.getByRole('checkbox')).toHaveCount(1);

    await page.getByRole('button', { name: 'Lihat detail produk Teh Celup Menipis' }).click();

    await expect(list.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByTestId('stock-bulk-purchase-fab')).toHaveCount(0);
  });
});
