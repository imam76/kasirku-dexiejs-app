import { expect, type Page } from '@playwright/test';
import { demoOwner } from './data';

async function normalizeOwnerAccountingBaseline(page: Page) {
  await page.evaluate(async (ownerFixture) => {
    const { DEFAULT_SELECTED_MODULES } = await import('/src/constants/setupModules.ts');
    const { db } = await import('/src/lib/db.ts');
    const {
      getSuggestedAccountingBusinessTemplate,
      saveInitialAccountingSetup,
    } = await import('/src/services/accountingInitialSetupService.ts');
    const { getSetupConfig } = await import('/src/services/setupKeyService.ts');

    const setupConfig = getSetupConfig();
    const enabledModules = setupConfig?.enabledModules ?? DEFAULT_SELECTED_MODULES;
    const owner = await db.authUsers.where('email').equals(ownerFixture.email).first();

    await db.transaction('rw', [db.accountingPeriods, db.accountingFiscalYears], async () => {
      await db.accountingPeriods.clear();
      await db.accountingFiscalYears.clear();
    });

    await saveInitialAccountingSetup({
      enabledModules,
      configuredBy: owner?.id ?? 'e2e-owner-baseline',
      configuredByName: owner?.name ?? ownerFixture.name,
      business_template_code: getSuggestedAccountingBusinessTemplate(enabledModules),
      cutoff_date: '2026-01-01',
      fiscal_period_start: '2026-01-01',
      fiscal_period_end: '2026-12-31',
      current_period_start: '2026-01-01',
      current_period_end: '2026-12-31',
      base_currency_code: 'IDR',
      persistSetupConfig: false,
    });
  }, {
    email: demoOwner.email,
    name: demoOwner.name,
  });
}

export async function registerFirstOwner(page: Page, pin = demoOwner.pin) {
  await page.goto('/');

  const registerHeading = page.getByRole('heading', { name: 'Register Owner' });
  await expect(page.getByRole('heading', { name: /Masuk Frayukti|Register Owner/ })).toBeVisible();

  if (!await registerHeading.isVisible()) {
    await expect(page.getByRole('heading', { name: 'Masuk Frayukti' })).toBeVisible();
    await expect(page.getByText('Belum ada user aktif.')).toBeVisible();

    await page.getByRole('button', { name: 'Register Owner Pertama' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Register Owner' })).toBeVisible();

  await page.getByLabel('Nama Owner').fill(demoOwner.name);
  await page.getByLabel('Email').fill(demoOwner.email);
  await page.getByLabel('PIN', { exact: true }).fill(pin);
  await page.getByLabel('Konfirmasi PIN').fill(pin);
  await page.getByRole('button', { name: 'Simpan Owner' }).click();

  await expect(page.getByLabel(/Profil login|Logged-in profile/)).toBeVisible();
  await normalizeOwnerAccountingBaseline(page);
}

export async function logout(page: Page) {
  const logoutButton = page.getByRole('button', { name: 'Logout' });
  if (!await logoutButton.isVisible()) {
    await page.getByLabel(/Profil login|Logged-in profile/).click();
  }
  await logoutButton.click();

  const logoutDialog = page.getByRole('dialog').filter({ hasText: 'Logout dari Frayukti?' });
  await expect(logoutDialog).toBeVisible();
  await logoutDialog.getByRole('button', { name: 'Logout' }).click();
  await expect(page.getByRole('heading', { name: 'Masuk Frayukti' })).toBeVisible();
}

export async function loginWithCredentials(page: Page, email: string, pin: string) {
  await expect(page.getByRole('heading', { name: 'Masuk Frayukti' })).toBeVisible();

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('PIN').fill(pin);
  await page.getByRole('button', { name: 'Masuk' }).click();

  await expect(page.getByLabel(/Profil login|Logged-in profile/)).toBeVisible();
}

export async function logoutAndLoginAgain(page: Page, pin = demoOwner.pin) {
  await logout(page);
  await loginWithCredentials(page, demoOwner.email, pin);
}

export async function loginAsBootstrappedOwner(page: Page) {
  await registerFirstOwner(page);
}
