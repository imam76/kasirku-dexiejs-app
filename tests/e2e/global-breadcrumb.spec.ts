import { expect, test, type Page } from '@playwright/test';
import {
  loginAsBootstrappedOwner,
  loginWithCredentials,
  logout,
} from './helpers/auth';

const restrictedUser = {
  name: 'User Tanpa Akses',
  email: 'breadcrumb.restricted@ksu.test',
  pin: '975310',
};

async function seedRestrictedUser(page: Page) {
  await page.evaluate(async (input) => {
    const [{ createPinHash }, { db }] = await Promise.all([
      import('/src/auth/authService.ts'),
      import('/src/lib/db.ts'),
    ]);
    const now = new Date().toISOString();
    const roleId = 'e2e-role-breadcrumb-restricted';
    const { hash, salt } = await createPinHash(input.pin);

    await db.transaction('rw', [db.roles, db.authUsers], async () => {
      await db.roles.put({
        id: roleId,
        name: input.name,
        code: 'E2E_BREADCRUMB_RESTRICTED',
        description: 'Role E2E tanpa permission untuk menguji guard breadcrumb.',
        is_system: false,
        is_owner: false,
        is_active: true,
        created_at: now,
        updated_at: now,
        sync_status: 'pending',
      });
      await db.authUsers.put({
        id: 'e2e-user-breadcrumb-restricted',
        name: input.name,
        email: input.email,
        role: 'KASIR',
        role_id: roleId,
        role_name: input.name,
        pin_hash: hash,
        pin_salt: salt,
        is_active: true,
        created_at: now,
        updated_at: now,
        sync_status: 'pending',
      });
    });
  }, restrictedUser);
}

test('breadcrumb global follows hierarchy, navigates with SPA links, and hides on flat/404 routes', async ({ page }) => {
  await loginAsBootstrappedOwner(page);

  await page.goto('/master-data/products');
  const breadcrumb = page.getByTestId('global-breadcrumb');
  await expect(breadcrumb).toBeVisible();
  await expect(breadcrumb).toContainText('Home');
  await expect(breadcrumb).toContainText('Master Data');
  await expect(breadcrumb).toContainText('Produk');

  await breadcrumb.getByRole('link', { name: 'Master Data', exact: true }).click();
  await expect(page).toHaveURL(/\/master-data\/?$/);
  await expect(page.getByTestId('global-breadcrumb')).toHaveCount(0);

  await page.goto('/koperasi/migrasi-simpanan');
  const savingMigrationBreadcrumb = page.getByTestId('global-breadcrumb');
  await expect(savingMigrationBreadcrumb).toContainText('Home');
  await expect(savingMigrationBreadcrumb).toContainText('Koperasi');
  await expect(savingMigrationBreadcrumb).toContainText('Saldo Awal Simpanan');

  await page.goto('/koperasi/laporan/drop-harian');
  const reportBreadcrumb = page.getByTestId('global-breadcrumb');
  await expect(reportBreadcrumb).toBeVisible();
  await expect(reportBreadcrumb).toContainText('Home');
  await expect(reportBreadcrumb).toContainText('Koperasi');
  await expect(reportBreadcrumb).toContainText('Laporan');
  await expect(reportBreadcrumb).toContainText('Drop Harian');
  await reportBreadcrumb.getByRole('link', { name: 'Laporan', exact: true }).click();
  await expect(page).toHaveURL(/\/koperasi\/laporan\/?$/);

  await page.goto('/');
  await expect(page.getByTestId('global-breadcrumb')).toHaveCount(0);

  await page.goto('/transaction');
  await expect(page.getByTestId('global-breadcrumb')).toHaveCount(0);

  await page.goto('/route-that-does-not-exist');
  await expect(page.getByRole('heading', { name: 'Halaman Tidak Ditemukan' })).toBeVisible();
  await expect(page.getByTestId('global-breadcrumb')).toHaveCount(0);
});

test('breadcrumb remains single-line and contained on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await loginAsBootstrappedOwner(page);
  await page.goto('/finance/opening-balances/advance-received');

  const breadcrumb = page.getByTestId('global-breadcrumb');
  await expect(breadcrumb).toBeVisible();
  await expect(breadcrumb).toContainText('Uang Muka Masuk');

  const flexWrap = await breadcrumb.locator('ol').evaluate(
    (element) => window.getComputedStyle(element).flexWrap,
  );
  const verticalAlignment = await breadcrumb.evaluate((element) => {
    const list = element.querySelector('ol');
    const separator = element.querySelector('.ant-breadcrumb-separator');
    return {
      list: list ? window.getComputedStyle(list).alignItems : '',
      separator: separator ? window.getComputedStyle(separator).alignItems : '',
    };
  });
  const viewportIsContained = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );

  expect(flexWrap).toBe('nowrap');
  expect(verticalAlignment).toEqual({ list: 'center', separator: 'center' });
  expect(viewportIsContained).toBe(true);
});

test('breadcrumb is not rendered for forbidden or inactive modules', async ({ page }) => {
  await loginAsBootstrappedOwner(page);
  await seedRestrictedUser(page);
  await logout(page);
  await loginWithCredentials(page, restrictedUser.email, restrictedUser.pin);
  await page.evaluate(() => {
    localStorage.setItem('frayukti-setup-config', JSON.stringify({
      enabledModules: ['PRODUCT', 'ROLE_PERMISSION'],
      databaseUrl: '',
      configuredAt: '2026-07-24T00:00:00.000Z',
      configuredBy: 'e2e-global-breadcrumb',
    }));
  });
  await page.reload();

  await page.goto('/master-data/products');
  await expect(page.getByText('Akses tidak tersedia')).toBeVisible();
  await expect(page.getByTestId('global-breadcrumb')).toHaveCount(0);

  await page.goto('/koperasi/simpanan');
  await expect(page.getByText('Module tidak aktif')).toBeVisible();
  await expect(page.getByTestId('global-breadcrumb')).toHaveCount(0);
});
