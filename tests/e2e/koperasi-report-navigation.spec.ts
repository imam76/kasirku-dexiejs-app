import { expect, test, type Page } from '@playwright/test';
import { loginAsBootstrappedOwner, loginWithCredentials, logout } from './helpers/auth';

const SETUP_CONFIG_STORAGE_KEY = 'frayukti-setup-config';
const reportOnlyUser = {
  name: 'Petugas Laporan Drop',
  email: 'petugas.laporan.drop@ksu.test',
  pin: '135790',
};

async function installDailyDropOnlySetup(page: Page) {
  await page.addInitScript(({ storageKey }) => {
    localStorage.setItem(storageKey, JSON.stringify({
      enabledModules: ['ROLE_PERMISSION', 'KOPERASI_REPORT_DAILY_DROP'],
      databaseUrl: '',
      configuredAt: '2026-07-23T00:00:00.000Z',
      configuredBy: 'e2e-cooperative-report-navigation',
    }));
  }, { storageKey: SETUP_CONFIG_STORAGE_KEY });
}

async function seedDailyDropReportUser(page: Page) {
  await page.evaluate(async (input) => {
    const bytesToHex = (bytes: Uint8Array) => (
      Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
    );
    const salt = 'e2e-daily-drop-report-salt';
    const encoded = new TextEncoder().encode(`${salt}:${input.pin}`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    const now = new Date().toISOString();
    const roleId = 'e2e-role-daily-drop-report-only';

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('KasirkuDB');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(['roles', 'rolePermissions', 'authUsers'], 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };

        transaction.objectStore('roles').put({
          id: roleId,
          name: input.name,
          code: 'E2E_DAILY_DROP_REPORT_ONLY',
          description: 'E2E role dengan akses laporan drop harian saja.',
          is_system: false,
          is_owner: false,
          is_active: true,
          created_at: now,
          updated_at: now,
          sync_status: 'pending',
        });
        transaction.objectStore('rolePermissions').put({
          id: `${roleId}:COOPERATIVE_DAILY_DROP_REPORT_VIEW`,
          role_id: roleId,
          permission_code: 'COOPERATIVE_DAILY_DROP_REPORT_VIEW',
          created_at: now,
          updated_at: now,
          sync_status: 'pending',
        });
        transaction.objectStore('authUsers').put({
          id: 'e2e-user-daily-drop-report-only',
          name: input.name,
          email: input.email,
          role: 'KASIR',
          role_id: roleId,
          role_name: input.name,
          pin_hash: bytesToHex(new Uint8Array(hashBuffer)),
          pin_salt: salt,
          is_active: true,
          created_at: now,
          updated_at: now,
          sync_status: 'pending',
        });
      };
    });
  }, reportOnlyUser);
}

test('menu Koperasi mengonsolidasikan seluruh laporan dalam lima kategori', async ({ page }) => {
  await loginAsBootstrappedOwner(page);

  await page.goto('/koperasi');
  await expect(page.locator('main a[href="/koperasi/laporan"]')).toHaveCount(1);
  await expect(page.locator('main a[href^="/koperasi/laporan/"]')).toHaveCount(0);

  await page.locator('main a[href="/koperasi/laporan"]').click();
  await expect(page).toHaveURL(/\/koperasi\/laporan\/?$/);
  await expect(page.getByRole('heading', { name: 'Laporan Koperasi' })).toBeVisible();
  const reportColumns = page.locator('[data-testid^="cooperative-report-column-"]');
  await expect(reportColumns).toHaveCount(4);
  await expect(reportColumns.nth(0)).toHaveAttribute(
    'data-testid',
    'cooperative-report-column-operations',
  );
  await expect(reportColumns.nth(3)).toHaveAttribute(
    'data-testid',
    'cooperative-report-column-overview',
  );
  await expect(page.locator('[data-testid^="cooperative-report-category-"]')).toHaveCount(5);
  await expect(page.locator('[data-testid^="cooperative-report-link-"]')).toHaveCount(15);
  await expect(page.getByTestId('cooperative-report-link-voluntary-savings'))
    .toContainText('Simpanan Sukarela');
  await expect(page.getByTestId('cooperative-report-link-savings-in'))
    .toContainText('Simpanan Masuk');
  await expect(page.getByTestId('cooperative-report-link-savings-out'))
    .toContainText('Simpanan Keluar');
  await expect(page.getByTestId('cooperative-report-link-daily-field-cash'))
    .toContainText('Kas Harian PDL');
  await expect(page.getByTestId('cooperative-report-column-overview'))
    .toContainText('Ringkasan & Keuangan');
  await expect(page.getByTestId('cooperative-report-column-overview'))
    .toContainText('Keanggotaan');

  const summaryToggle = page.getByTestId('cooperative-report-toggle-summary-finance');
  await expect(summaryToggle).toHaveAttribute('aria-expanded', 'true');
  await summaryToggle.click();
  await expect(summaryToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('cooperative-report-link-summary')).toHaveCount(0);
  await summaryToggle.click();
  await expect(summaryToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('cooperative-report-link-summary')).toBeVisible();

  await page.goto('/koperasi/laporan-drop-harian');
  await expect(page.getByRole('heading', { name: 'Halaman Tidak Ditemukan' })).toBeVisible();
});

test('indeks hanya menampilkan laporan yang diizinkan dan menyembunyikan kategori kosong', async ({ page }) => {
  await installDailyDropOnlySetup(page);
  await loginAsBootstrappedOwner(page);
  await seedDailyDropReportUser(page);
  await logout(page);
  await loginWithCredentials(page, reportOnlyUser.email, reportOnlyUser.pin);

  await page.goto('/koperasi');
  await expect(page.locator('main a[href="/koperasi/laporan"]')).toBeVisible();

  await page.goto('/koperasi/laporan');
  await expect(page.getByTestId('cooperative-report-column-operations')).toBeVisible();
  await expect(page.locator('[data-testid^="cooperative-report-column-"]')).toHaveCount(1);
  await expect(page.getByTestId('cooperative-report-category-field-operations')).toBeVisible();
  await expect(page.locator('[data-testid^="cooperative-report-category-"]')).toHaveCount(1);
  await expect(page.getByTestId('cooperative-report-link-daily-drop')).toBeVisible();
  await expect(page.locator('[data-testid^="cooperative-report-link-"]')).toHaveCount(1);
});
