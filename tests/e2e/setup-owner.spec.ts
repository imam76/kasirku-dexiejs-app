import { expect, test } from '@playwright/test';
import { loginAsBootstrappedOwner, logoutAndLoginAgain } from './helpers/auth';
import { readAccountingSetupRegressionState } from './helpers/accounting';
import { demoOwner } from './helpers/data';
import { expectCooperativeOverview } from './helpers/koperasi';

test.describe.serial('setup awal owner', () => {
  test('AUTH-01, AUTH-03, AUTH-04 - register owner, login ulang, dan akses koperasi', async ({ page }) => {
    await loginAsBootstrappedOwner(page);

    const accountingState = await readAccountingSetupRegressionState(page);
    expect(accountingState.setup).toMatchObject({
      business_template_code: 'RETAIL',
      accounting_profile: 'SAK_EMKM',
      industry_extension: 'RETAIL',
      template_id: 'default-sak-emkm-retail',
      base_currency_code: 'IDR',
      setup_completed_by_name: demoOwner.name,
    });
    expect(accountingState.setupConfig).toBeNull();
    expect(accountingState.profile).toMatchObject({
      accounting_profile: 'SAK_EMKM',
      industry_extension: 'RETAIL',
    });

    await logoutAndLoginAgain(page);
    await expectCooperativeOverview(page);
  });

  test('AUTH-02 - register menolak konfirmasi PIN berbeda', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Masuk Frayukti|Register Owner/ })).toBeVisible();

    const registerHeading = page.getByRole('heading', { name: 'Register Owner' });
    if (await page.getByRole('heading', { name: 'Masuk Frayukti' }).isVisible()) {
      await page.getByRole('button', { name: 'Register Owner Pertama' }).click();
    }
    await expect(registerHeading).toBeVisible();

    await page.getByLabel('Nama Owner').fill(demoOwner.name);
    await page.getByLabel('Email').fill(demoOwner.email);
    await page.getByLabel('PIN', { exact: true }).fill(demoOwner.pin);
    await page.getByLabel('Konfirmasi PIN').fill('654321');
    await page.getByRole('button', { name: 'Simpan Owner' }).click();

    await expect(page.getByText('Konfirmasi PIN tidak sama.')).toBeVisible();
  });
});
