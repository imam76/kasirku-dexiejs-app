import { expect, test } from '@playwright/test';
import { demoOwner } from './helpers/data';

for (const viewport of [
  { name: 'desktop', width: 1280, height: 800, hasTouch: false },
  { name: 'mobile', width: 390, height: 844, hasTouch: true },
]) {
  test.describe(`registrasi Owner ${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.hasTouch,
      actionTimeout: 10_000,
    });

    test('Lanjut menampilkan pengaturan usaha sebelum Owner dibuat', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Daftarkan Owner' })).toBeVisible();

      // Reproduce a fresh installation immediately after Developer Setup is saved.
      await page.evaluate(async () => {
        const { CURRENT_MODULE_CATALOG_VERSION, saveSetupConfigForRuntime } = await import('/src/services/setupKeyService.ts');
        await saveSetupConfigForRuntime({
          enabledModules: ['CASH_FLOW', 'CHART_OF_ACCOUNTS', 'GENERAL_LEDGER'],
          configuredAt: new Date().toISOString(),
          configuredBy: 'e2e-developer',
          moduleCatalogVersion: CURRENT_MODULE_CATALOG_VERSION,
        });
      });
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Daftarkan Owner' })).toBeVisible();

      await page.getByLabel('Nama Owner').fill(demoOwner.name);
      await page.getByLabel('Email').fill(demoOwner.email);
      await page.getByLabel('PIN', { exact: true }).fill(demoOwner.pin);
      await page.getByLabel('Konfirmasi PIN').fill(demoOwner.pin);
      const nextButton = page.getByRole('button', { name: 'Lanjut ke Pengaturan Usaha' });
      if (viewport.hasTouch) {
        await nextButton.tap();
      } else {
        await nextButton.click();
      }

      await expect(page.getByRole('radiogroup', { name: 'Jenis Usaha' })).toBeVisible();
      await expect(page.getByTestId('owner-accounting-business-template-GENERAL_SERVICE')).toBeEnabled();
      await page.getByTestId('owner-accounting-business-template-GENERAL_SERVICE').click();
      const beforeSubmit = await page.evaluate(async () => {
        const { db } = await import('/src/lib/db.ts');
        return {
          ownerCount: await db.authUsers.count(),
          setup: (await db.accountingInitialSetupSetting.get('default')) ?? null,
        };
      });
      expect(beforeSubmit).toEqual({ ownerCount: 0, setup: null });

      await page.getByRole('button', { name: 'Buat Owner', exact: true }).click();
      await expect(page.getByLabel(/Profil login|Logged-in profile/)).toBeVisible();
      const savedSetup = await page.evaluate(async () => {
        const { db } = await import('/src/lib/db.ts');
        return db.accountingInitialSetupSetting.get('default');
      });
      expect(savedSetup).toMatchObject({
        business_template_code: 'GENERAL_SERVICE',
        setup_completed_by_name: demoOwner.name,
      });
    });

    test('Enter dan Kembali mempertahankan langkah serta data registrasi', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Daftarkan Owner' })).toBeVisible();
      await page.getByLabel('Nama Owner').fill(demoOwner.name);
      await page.getByLabel('Email').fill(demoOwner.email);
      await page.getByLabel('PIN', { exact: true }).fill(demoOwner.pin);
      await page.getByLabel('Konfirmasi PIN').fill('654321');
      await page.getByLabel('Konfirmasi PIN').press('Enter');
      await expect(page.getByText('Konfirmasi PIN tidak sama.')).toBeVisible();
      await expect(page.getByRole('radiogroup', { name: 'Jenis Usaha' })).toHaveCount(0);

      await page.getByLabel('Konfirmasi PIN').fill(demoOwner.pin);
      await page.getByLabel('Konfirmasi PIN').press('Enter');
      const businessTemplate = page.getByTestId('owner-accounting-business-template-COOPERATIVE');
      await expect(businessTemplate).toBeEnabled();
      await businessTemplate.click();
      await page.getByRole('button', { name: 'Kembali', exact: true }).click();
      await expect(page.getByLabel('Nama Owner')).toHaveValue(demoOwner.name);
      await expect(page.getByLabel('Email')).toHaveValue(demoOwner.email);
      await expect(page.getByLabel('PIN', { exact: true })).toHaveValue(demoOwner.pin);
      await expect(page.getByLabel('Konfirmasi PIN')).toHaveValue(demoOwner.pin);

      await page.getByLabel('Konfirmasi PIN').press('Enter');
      await expect(businessTemplate).toHaveAttribute('aria-checked', 'true');
      const beforeSubmit = await page.evaluate(async () => {
        const { db } = await import('/src/lib/db.ts');
        return {
          ownerCount: await db.authUsers.count(),
          setup: (await db.accountingInitialSetupSetting.get('default')) ?? null,
        };
      });
      expect(beforeSubmit).toEqual({ ownerCount: 0, setup: null });
    });
  });
}
