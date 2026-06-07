import { expect, test } from '@playwright/test';
import { loginAsBootstrappedOwner, logoutAndLoginAgain } from './helpers/auth';
import { demoOwner } from './helpers/data';
import { expectCooperativeOverview } from './helpers/koperasi';

test.describe.serial('setup awal owner', () => {
  test('AUTH-01, AUTH-03, AUTH-04 - register owner, login ulang, dan akses koperasi', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await logoutAndLoginAgain(page);
    await expectCooperativeOverview(page);
  });

  test('AUTH-02 - register menolak konfirmasi PIN berbeda', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Register Owner Pertama' }).click();

    await page.getByLabel('Nama Owner').fill(demoOwner.name);
    await page.getByLabel('PIN', { exact: true }).fill(demoOwner.pin);
    await page.getByLabel('Konfirmasi PIN').fill('654321');
    await page.getByRole('button', { name: 'Simpan Owner' }).click();

    await expect(page.getByText('Konfirmasi PIN tidak sama.')).toBeVisible();
  });
});

