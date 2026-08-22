import { expect, test, type Page } from '@playwright/test';
import { loginAsBootstrappedOwner } from './helpers/auth';

const PRODUCT_WITH_UNITS_ID = 'e2e-pos-keyboard-box';
const SECOND_PRODUCT_ID = 'e2e-pos-keyboard-sugar';

async function dispatchNumpadKey(page: Page, code: string, key: string) {
  await page.evaluate(({ eventCode, eventKey }) => {
    const target = document.activeElement ?? document.body;
    target.dispatchEvent(new KeyboardEvent('keydown', {
      key: eventKey,
      code: eventCode,
      bubbles: true,
      cancelable: true,
    }));
  }, { eventCode: code, eventKey: key });
}

async function preparePosKeyboardFixture(page: Page) {
  await loginAsBootstrappedOwner(page);

  await page.evaluate(async ({ productWithUnitsId, secondProductId }) => {
    const { getCurrentSessionUser } = await import('/src/auth/authService.ts');
    const { db } = await import('/src/lib/db.ts');
    const currentUser = await getCurrentSessionUser();
    if (!currentUser) throw new Error('E2E POS user session was not found.');

    const now = new Date().toISOString();
    await db.products.bulkPut([
      {
        id: 'e2e-pos-keyboard-decoy',
        name: 'Alpha POS-BOX Decoy',
        category: 'consumable',
        purchase_unit: 'pcs',
        selling_unit: 'pcs',
        purchase_price: 1_000,
        selling_price: 2_000,
        stock: 100,
        sku: 'DECOY-BOX',
        sellable_units: ['pcs'],
        created_at: now,
        updated_at: now,
        sync_status: 'pending',
      },
      {
        id: productWithUnitsId,
        name: 'Zulu Kotak Shortcut',
        category: 'consumable',
        purchase_unit: 'pcs',
        selling_unit: 'pcs',
        purchase_price: 5_000,
        selling_price: 10_000,
        stock: 240,
        sku: 'POS-BOX',
        sellable_units: ['pcs', 'pack', 'dus'],
        unit_mappings: [
          { unit: 'pack', base_unit: 'pcs', ratio: 6 },
          { unit: 'dus', base_unit: 'pcs', ratio: 12 },
        ],
        created_at: now,
        updated_at: now,
        sync_status: 'pending',
      },
      {
        id: secondProductId,
        name: 'Gula Shortcut',
        category: 'consumable',
        purchase_unit: 'pcs',
        selling_unit: 'pcs',
        purchase_price: 4_000,
        selling_price: 8_000,
        stock: 100,
        sku: 'POS-SUGAR',
        sellable_units: ['pcs'],
        created_at: now,
        updated_at: now,
        sync_status: 'pending',
      },
    ]);

    await db.cashierSessions
      .where('cashier_user_id')
      .equals(currentUser.id)
      .delete();
    await db.cashierSessions.put({
      id: 'e2e-pos-keyboard-session',
      session_number: 'KS-E2E-KEYBOARD',
      status: 'OPEN',
      cashier_user_id: currentUser.id,
      cashier_user_name: currentUser.name,
      opened_at: now,
      opening_cash_amount: 0,
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
    });
  }, {
    productWithUnitsId: PRODUCT_WITH_UNITS_ID,
    secondProductId: SECOND_PRODUCT_ID,
  });

  await page.goto('/transaction');
  await expect(page.getByText('KS-E2E-KEYBOARD')).toBeVisible();
}

test('POS regular supports the one-hand numpad item flow', async ({ page }) => {
  await preparePosKeyboardFixture(page);

  const search = page.getByPlaceholder('Cari produk (nama atau SKU)...');
  await page.getByText('Shortcut desktop', { exact: true }).click();
  await dispatchNumpadKey(page, 'NumpadDivide', '/');
  await expect(search).toBeFocused();

  await search.fill('POS-BOX');
  await dispatchNumpadKey(page, 'NumpadEnter', 'Enter');

  const boxItem = page.locator(`[data-pos-cart-item-id="${PRODUCT_WITH_UNITS_ID}"]:visible`);
  await expect(boxItem).toBeVisible();
  await expect(boxItem).toHaveAttribute('data-pos-active', 'true');
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();

  await dispatchNumpadKey(page, 'NumpadMultiply', '*');
  const quantityInput = boxItem.getByTestId(`pos-cart-quantity-${PRODUCT_WITH_UNITS_ID}`);
  await expect(quantityInput).toBeFocused();
  await quantityInput.fill('3');
  await dispatchNumpadKey(page, 'NumpadEnter', 'Enter');
  await expect(quantityInput).toHaveValue('3');
  await expect(search).toBeFocused();

  await dispatchNumpadKey(page, 'NumpadAdd', '+');
  const unitSelect = boxItem.getByTestId(`pos-cart-unit-${PRODUCT_WITH_UNITS_ID}`);
  await expect(unitSelect).toContainText('pack');
  await expect(quantityInput).toHaveValue('3');

  await dispatchNumpadKey(page, 'NumpadSubtract', '-');
  await expect(unitSelect).toContainText('pcs');

  await search.fill('Gula Shortcut');
  await dispatchNumpadKey(page, 'NumpadEnter', 'Enter');
  const sugarItem = page.locator(`[data-pos-cart-item-id="${SECOND_PRODUCT_ID}"]:visible`);
  await expect(sugarItem).toHaveAttribute('data-pos-active', 'true');
  await expect(boxItem).toHaveAttribute('data-pos-active', 'false');

  await boxItem.click();
  await expect(boxItem).toHaveAttribute('data-pos-active', 'true');

  await page.getByRole('button', { name: /Bayar Rp/ }).click();
  const paymentAmount = page.getByTestId('pos-payment-amount-0');
  await paymentAmount.focus();
  await dispatchNumpadKey(page, 'NumpadAdd', '+');
  await expect(unitSelect).toContainText('pcs');
  await expect(paymentAmount).toBeFocused();

  await page.getByRole('button', { name: 'Batal', exact: true }).click();
  // Menutup sesi kasir diblokir selama keranjang masih berisi item, jadi
  // menekan "Tutup Kasir" di sini membuka dialog peringatan "Masih ada
  // transaksi belum selesai" (bukan dialog Tutup Kasir yang sesungguhnya).
  // Dialog ini tetap dirender lewat antd Modal (.ant-modal-wrap), jadi tetap
  // sah untuk memverifikasi shortcut numpad diam saat ada modal blocker aktif
  // sekaligus menjaga item keranjang agar unitSelect masih bisa diperiksa.
  await page.getByRole('button', { name: 'Tutup Kasir', exact: true }).click();
  const closeBlockedDialog = page.getByRole('dialog', { name: 'Masih ada transaksi belum selesai' });
  await expect(closeBlockedDialog).toBeVisible();
  await dispatchNumpadKey(page, 'NumpadAdd', '+');
  await expect(unitSelect).toContainText('pcs');
  await closeBlockedDialog.getByRole('button', { name: 'OK', exact: true }).click();
});

test('USB keyboard-wedge scans increment qty without adding another cart line', async ({ page }) => {
  await preparePosKeyboardFixture(page);

  const search = page.getByPlaceholder('Cari produk (nama atau SKU)...');
  await search.focus();
  await search.evaluate((input) => {
    input.dataset.scannerInputEvents = '0';
    input.addEventListener('input', () => {
      input.dataset.scannerInputEvents = String(Number(input.dataset.scannerInputEvents || 0) + 1);
    });
  });
  await page.keyboard.type('POS-BOX', { delay: 5 });
  await page.keyboard.press('Enter');

  const cartItems = page.locator(`[data-pos-cart-item-id="${PRODUCT_WITH_UNITS_ID}"]:visible`);
  const quantityInput = cartItems.getByTestId(`pos-cart-quantity-${PRODUCT_WITH_UNITS_ID}`);
  await expect(search).toHaveAttribute('data-scanner-input-events', '0');
  await expect(search).toHaveValue('');
  await expect(cartItems).toHaveCount(1);
  await expect(quantityInput).toHaveValue('1');

  await page.keyboard.type('POS-BOX', { delay: 5 });
  await page.keyboard.press('Enter');

  await expect(search).toHaveAttribute('data-scanner-input-events', '0');
  await expect(search).toHaveValue('');
  await expect(cartItems).toHaveCount(1);
  await expect(quantityInput).toHaveValue('2');
});

test('F6 holds the active transaction and Shift+F6 opens the draft list', async ({ page }) => {
  await preparePosKeyboardFixture(page);

  const search = page.getByPlaceholder('Cari produk (nama atau SKU)...');
  await search.fill('POS-BOX');
  await search.press('Enter');
  await expect(page.locator(`[data-pos-cart-item-id="${PRODUCT_WITH_UNITS_ID}"]:visible`)).toBeVisible();

  await page.keyboard.press('F6');
  const holdDialog = page.getByRole('dialog', { name: 'Tahan transaksi ini?' });
  await expect(holdDialog).toBeVisible();
  const labelInput = holdDialog.getByPlaceholder('Contoh: Queue XXX / Budi');
  await labelInput.fill('Queue Shortcut');
  await labelInput.press('Enter');

  await expect(holdDialog).toBeHidden();
  await expect(page.locator(`[data-pos-cart-item-id="${PRODUCT_WITH_UNITS_ID}"]:visible`)).toHaveCount(0);
  await page.keyboard.press('Shift+F6');

  const draftDialog = page.getByRole('dialog', { name: 'Draft (1)' });
  await expect(draftDialog.getByText('Queue Shortcut')).toBeVisible();
  await draftDialog.getByRole('button', { name: 'Buka', exact: true }).click();
  await expect(page.locator(`[data-pos-cart-item-id="${PRODUCT_WITH_UNITS_ID}"]:visible`)).toBeVisible();
});
