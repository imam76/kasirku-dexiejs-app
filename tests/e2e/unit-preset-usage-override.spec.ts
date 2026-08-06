import { expect, test } from '@playwright/test';
import { loginAsBootstrappedOwner } from './helpers/auth';

test('default unit usage can be overridden and is reflected in the product form', async ({ page }) => {
  await loginAsBootstrappedOwner(page);

  await page.goto('/master-data/units#units');
  await expect(page.getByRole('heading', { name: 'Manajemen Satuan & Konversi' })).toBeVisible();

  const boxRow = page.getByRole('row').filter({
    has: page.getByText('box', { exact: true }),
  });
  await expect(boxRow).toBeVisible();
  await expect(boxRow.getByRole('button', { name: 'Hapus Satuan: box' })).toBeDisabled();
  await boxRow.getByRole('button', { name: 'Edit Satuan: box' }).click();

  const editDialog = page.getByRole('dialog', { name: 'Edit Satuan' });
  await expect(editDialog).toBeVisible();
  await expect(editDialog.getByText('Satuan bawaan sistem')).toBeVisible();
  await expect(editDialog.getByLabel('Nama Satuan')).toBeDisabled();
  await expect(editDialog.getByRole('combobox', { name: 'Jenis Satuan' })).toBeDisabled();

  const baseUnitCheckbox = editDialog.getByRole('checkbox', { name: 'Bisa menjadi satuan dasar' });
  const conversionUnitCheckbox = editDialog.getByRole('checkbox', { name: 'Bisa menjadi satuan konversi' });
  await expect(baseUnitCheckbox).toBeEnabled();
  await expect(conversionUnitCheckbox).toBeEnabled();
  await baseUnitCheckbox.check();
  await conversionUnitCheckbox.uncheck();
  await editDialog.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByText('Satuan berhasil diperbarui')).toBeVisible();

  const savedBox = await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    return db.units.get('box');
  });
  expect(savedBox).toMatchObject({
    id: 'box',
    name: 'box',
    type: 'package',
    isPreset: true,
    canBeBaseUnit: true,
    canBeConversionUnit: false,
  });

  await page.goto('/master-data/products');
  const boxAtProductRoute = await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    return db.units.get('box');
  });
  expect(boxAtProductRoute?.canBeBaseUnit).toBe(true);
  await page.locator('[data-tour="stock-add-product"]:visible').click();

  const productDialog = page.getByRole('dialog', { name: 'Tambah Produk Baru' });
  const baseUnitSelect = productDialog.getByTestId('stock-product-base-unit');
  await baseUnitSelect.click();
  await baseUnitSelect.getByRole('combobox').fill('box');
  await expect(page.getByRole('option', { name: 'box', exact: true })).toBeAttached();
  await page.keyboard.press('Enter');
  await expect(baseUnitSelect).toContainText('box');

  await baseUnitSelect.click();
  await baseUnitSelect.getByRole('combobox').fill('pcs');
  await page.keyboard.press('Enter');
  await expect(baseUnitSelect).toContainText('pcs');

  // Satuan jual hanya lahir dari baris konversi, jadi penandaan "bukan satuan
  // konversi" harus menutup pilihannya di baris konversi itu sendiri.
  await productDialog.getByRole('tab', { name: /Multi Unit/ }).click();
  await productDialog.getByRole('button', { name: 'Tambah Unit' }).click();
  const blockedTargetUnitSelect = productDialog.getByTestId('stock-product-unit-mapping-target-unit-0');
  await blockedTargetUnitSelect.click();
  await expect(
    page.locator('.ant-select-dropdown:visible .ant-select-item-option-content', { hasText: /^box$/ }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');

  await productDialog.getByRole('button', { name: 'Batal' }).click();
  await page.goto('/master-data/units#units');
  await page.getByRole('button', { name: 'Pulihkan Bawaan' }).click();

  const restoreDialog = page.getByRole('dialog', { name: 'Pulihkan Satuan Bawaan' });
  await restoreDialog.getByRole('button', { name: 'Pulihkan', exact: true }).click();
  await expect(page.getByText('Satuan bawaan berhasil dipulihkan')).toBeVisible();

  const restoredBox = await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    return db.units.get('box');
  });
  expect(restoredBox).toMatchObject({
    id: 'box',
    type: 'package',
    isPreset: true,
    canBeBaseUnit: false,
    canBeConversionUnit: true,
  });

  await page.goto('/master-data/products');
  await page.locator('[data-tour="stock-add-product"]:visible').click();

  const restoredProductDialog = page.getByRole('dialog', { name: 'Tambah Produk Baru' });
  const restoredBaseUnitSelect = restoredProductDialog.getByTestId('stock-product-base-unit');
  await restoredBaseUnitSelect.click();
  await restoredBaseUnitSelect.getByRole('combobox').fill('kg');
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content', { hasText: /^kg$/ }).click();
  await expect(restoredBaseUnitSelect).toContainText('kg');

  const purchasePriceInput = restoredProductDialog.getByTestId('stock-product-purchase-price');
  const sellingPriceInput = restoredProductDialog.getByTestId('stock-product-selling-price');
  await purchasePriceInput.fill('1250000');
  await sellingPriceInput.fill('1500000');
  await expect(purchasePriceInput).toHaveValue('1.250.000');
  await expect(sellingPriceInput).toHaveValue('1.500.000');

  await restoredProductDialog.getByRole('tab', { name: /Multi Unit/ }).click();
  await restoredProductDialog.getByRole('button', { name: 'Tambah Unit' }).click();
  await expect(restoredProductDialog.getByText('Konversi Produk Belum Ada')).toBeVisible();

  const productQuantityInput = restoredProductDialog.getByTestId('stock-product-unit-mapping-quantity-0');
  const productSourceUnitSelect = restoredProductDialog.getByTestId('stock-product-unit-mapping-source-unit-0');
  const productTargetUnitSelect = restoredProductDialog.getByTestId('stock-product-unit-mapping-target-unit-0');
  const productValueInput = restoredProductDialog.getByTestId('stock-product-unit-mapping-value-0');

  await productTargetUnitSelect.click();
  const visibleBoxOption = page.locator(
    '.ant-select-dropdown:visible .ant-select-item-option-content',
    { hasText: /^box$/ },
  );
  await expect(visibleBoxOption).toBeVisible();
  await visibleBoxOption.click();

  await expect(productQuantityInput).toBeDisabled();
  await expect(productQuantityInput).toHaveValue('1');
  await expect(productSourceUnitSelect).not.toHaveClass(/ant-select-disabled/);
  await expect(productSourceUnitSelect).toContainText('kg');
  await expect(productTargetUnitSelect).toContainText('box');
  await productValueInput.fill('5');
  await expect(restoredProductDialog.getByText('Konversi Produk Belum Ada')).toHaveCount(0);

  // Satuan jual default baru muncul setelah produk punya lebih dari satu satuan.
  const defaultUnitSelect = restoredProductDialog.getByTestId('stock-product-default-unit');
  await expect(defaultUnitSelect).toContainText('kg');

  await restoredProductDialog.getByRole('tab', { name: 'Harga Grosir' }).click();
  await restoredProductDialog.getByRole('button', { name: 'Tambah Harga' }).click();
  await expect(restoredProductDialog.getByText('Min. Qty', { exact: true })).toBeVisible();

  const wholesaleUnitSelect = restoredProductDialog.getByTestId('stock-product-wholesale-unit-0');
  await expect(wholesaleUnitSelect).toContainText('kg');
  await wholesaleUnitSelect.click();
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content', { hasText: /^box$/ }).last().click();
  await expect(wholesaleUnitSelect).toContainText('box');
  await expect(restoredProductDialog.getByText('Per box', { exact: true })).toBeVisible();

  const wholesalePriceInput = restoredProductDialog.getByTestId('stock-product-wholesale-price-0');
  await wholesalePriceInput.fill('1200000');
  await expect(wholesalePriceInput).toHaveValue('1.200.000');

  await restoredProductDialog.getByRole('tab', { name: 'Produk' }).click();
  await restoredProductDialog.getByTestId('stock-product-name').fill('Produk Konversi Eksplisit');
  await restoredProductDialog.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(restoredProductDialog).toBeHidden();

  const savedProduct = await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    return db.products.where('name').equals('Produk Konversi Eksplisit').first();
  });
  expect(savedProduct).toMatchObject({
    purchase_unit: 'kg',
    sellable_units: ['kg', 'box'],
    unit_mappings: [{
      from_quantity: 1,
      from_unit: 'kg',
      to_quantity: 5,
      to_unit: 'box',
    }],
    wholesale_prices: [{
      min_quantity: 2,
      unit: 'box',
      price: 1_200_000,
      price_type: 'unit',
    }],
  });
});
