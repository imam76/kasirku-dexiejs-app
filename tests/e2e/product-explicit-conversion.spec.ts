import { expect, test } from '@playwright/test';
import { loginAsBootstrappedOwner } from './helpers/auth';

test('POS prices and consumes 1 ikat from the equation 1 box = 10 ikat', async ({ page }) => {
  await loginAsBootstrappedOwner(page);

  await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    const { getCurrentSessionUser } = await import('/src/auth/authService.ts');
    const currentUser = await getCurrentSessionUser();
    if (!currentUser) throw new Error('E2E POS user session was not found.');

    const now = new Date().toISOString();
    await db.products.put({
      id: 'e2e-explicit-box-ikat',
      name: 'Produk Box Ikat Eksplisit',
      category: 'non_consumable',
      purchase_unit: 'box',
      selling_unit: 'box',
      purchase_price: 50_000,
      selling_price: 50_000,
      stock: 10,
      sku: 'EXPLICIT-BOX-IKAT',
      product_type: 'FINISHED_GOOD',
      is_visible_in_pos: true,
      sellable_units: ['box', 'ikat'],
      unit_mappings: [{
        from_quantity: 1,
        from_unit: 'box',
        to_quantity: 10,
        to_unit: 'ikat',
      }],
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
    });
    await db.cashierSessions.where('cashier_user_id').equals(currentUser.id).delete();
    await db.cashierSessions.put({
      id: 'e2e-explicit-conversion-session',
      session_number: 'KS-E2E-EXPLICIT',
      status: 'OPEN',
      cashier_user_id: currentUser.id,
      cashier_user_name: currentUser.name,
      opened_at: now,
      opening_cash_amount: 0,
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
    });
  });

  await page.goto('/transaction');
  await expect(page.getByText('KS-E2E-EXPLICIT')).toBeVisible();

  const search = page.getByPlaceholder('Cari produk (nama atau SKU)...');
  await search.fill('EXPLICIT-BOX-IKAT');
  await search.press('Enter');

  const cartItem = page.locator('[data-pos-cart-item-id="e2e-explicit-box-ikat"]:visible');
  await expect(cartItem).toBeVisible();
  const unitSelect = cartItem.locator('.ant-select').first();
  await unitSelect.click();
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content', { hasText: /^ikat$/ }).click();

  await expect(unitSelect).toContainText('ikat');
  await expect(cartItem.getByText('Rp 5.000 / ikat', { exact: true })).toBeVisible();

  const conversion = await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    const { getPrice, konversiSatuanProduk } = await import('/src/utils/pricing.ts');
    const product = await db.products.get('e2e-explicit-box-ikat');
    if (!product) throw new Error('Explicit conversion product was not found.');
    return {
      price: getPrice(product, 1, 'ikat'),
      stockQuantity: konversiSatuanProduk(1, product, 'ikat', 'box'),
    };
  });
  expect(conversion).toEqual({ price: 5_000, stockQuantity: 0.1 });
});
