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
  await page.keyboard.type('box');
  await page.getByRole('option', { name: 'box', exact: true }).click();
  await expect(baseUnitSelect).toContainText('box');

  await baseUnitSelect.click();
  await page.keyboard.type('pcs');
  await page.getByRole('option', { name: 'pcs', exact: true }).click();
  await expect(baseUnitSelect).toContainText('pcs');

  await productDialog.getByRole('tab', { name: /Multi Unit/ }).click();
  await productDialog.getByTestId('stock-product-sellable-units').click();
  await page.keyboard.type('box');
  await expect(page.getByRole('option', { name: 'box', exact: true })).toHaveCount(0);
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
});
