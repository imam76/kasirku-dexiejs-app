import { expect, test } from '@playwright/test';
import { demoOwner } from './helpers/data';
import { seedInstallmentBookFixture } from './helpers/koperasiInstallmentBook';

test('preview seed Buku Angsuran', async ({ page }) => {
  test.skip(
    process.env.PREVIEW_INSTALLMENT_BOOK !== '1',
    'Preview manual hanya dijalankan saat PREVIEW_INSTALLMENT_BOOK=1.',
  );

  await page.goto('/');
  await page.getByRole('button', { name: 'Register Owner Pertama' }).click();
  await page.getByLabel('Nama Owner').fill(demoOwner.name);
  await page.getByLabel('Email').fill(demoOwner.email);
  await page.getByLabel('PIN', { exact: true }).fill(demoOwner.pin);
  await page.getByLabel('Konfirmasi PIN').fill(demoOwner.pin);
  await page.getByRole('button', { name: 'Simpan Owner' }).click();
  await expect(page.getByLabel(/Profil login|Logged-in profile/)).toBeVisible();

  await seedInstallmentBookFixture(page);
  await page.goto('/koperasi/buku-angsuran');

  const collectionDayFilter = page
    .getByText('Hari Penagihan', { exact: true })
    .locator('..');
  await collectionDayFilter.locator('.ant-select').click();

  const weekdayDropdown = page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .last();
  await weekdayDropdown
    .locator('.ant-select-item-option')
    .filter({ hasText: 'Senin' })
    .click();

  const report = page.getByTestId('koperasi-installment-book-report');
  await expect(report).toContainText('Angsuran Lancar');
  await expect(report).toContainText('Calon Macet');
  await expect(report).toContainText('Macet');

  await page.pause();
});
