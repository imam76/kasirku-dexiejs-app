import { expect, test, type Page } from '@playwright/test';
import { loginWithCredentials, logout, registerFirstOwner } from './helpers/auth';

const SETUP_CONFIG_STORAGE_KEY = 'frayukti-setup-config';

const memberOnlyUser = {
  name: 'Petugas Anggota',
  email: 'petugas.anggota@ksu.test',
  pin: '246810',
};

const installTrialSetupConfig = async (page: Page) => {
  await page.addInitScript(({ storageKey }) => {
    localStorage.setItem(storageKey, JSON.stringify({
      enabledModules: [
        'POS_TRANSACTION',
        'PRODUCT',
        'ROLE_PERMISSION',
        'KOPERASI_ANGGOTA',
      ],
      databaseUrl: '',
      configuredAt: '2026-06-10T00:00:00.000Z',
      configuredBy: 'e2e-web-trial',
    }));
  }, { storageKey: SETUP_CONFIG_STORAGE_KEY });
};

const seedMemberOnlyUser = async (page: Page) => {
  await page.evaluate(async (input) => {
    const bytesToHex = (bytes: Uint8Array) => (
      Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
    );
    const salt = 'e2e-member-only-salt';
    const encoded = new TextEncoder().encode(`${salt}:${input.pin}`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    const now = new Date().toISOString();
    const roleId = 'e2e-role-koperasi-member-only';

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('KasirkuDB');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(['roles', 'rolePermissions', 'authUsers'], 'readwrite');
        tx.onerror = () => reject(tx.error);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };

        tx.objectStore('roles').put({
          id: roleId,
          name: 'Petugas Anggota',
          code: 'E2E_KOPERASI_MEMBER_ONLY',
          description: 'E2E role dengan akses anggota koperasi saja.',
          is_system: false,
          is_owner: false,
          is_active: true,
          created_at: now,
          updated_at: now,
          sync_status: 'pending',
        });
        tx.objectStore('rolePermissions').put({
          id: `${roleId}:COOPERATIVE_MEMBER_VIEW`,
          role_id: roleId,
          permission_code: 'COOPERATIVE_MEMBER_VIEW',
          created_at: now,
          updated_at: now,
          sync_status: 'pending',
        });
        tx.objectStore('authUsers').put({
          id: 'e2e-user-koperasi-member-only',
          name: input.name,
          email: input.email,
          role: 'KASIR',
          role_id: roleId,
          role_name: 'Petugas Anggota',
          pin_hash: bytesToHex(new Uint8Array(hashBuffer)),
          pin_salt: salt,
          is_active: true,
          created_at: now,
          updated_at: now,
          sync_status: 'pending',
        });
      };
    });
  }, memberOnlyUser);
};

test.describe('trial web role dan permission', () => {
  test('Owner bypass setup module lock, non-owner tetap sesuai permission role', async ({ page }) => {
    await installTrialSetupConfig(page);
    await registerFirstOwner(page);

    await page.goto('/koperasi');
    await expect(page.getByRole('heading', { name: 'Koperasi' })).toBeVisible();
    await expect(page.locator('main a[href="/koperasi/anggota"]')).toBeVisible();
    await expect(page.locator('main a[href="/koperasi/simpanan"]')).toBeVisible();
    await expect(page.locator('main a[href="/koperasi/migrasi-simpanan"]')).toBeVisible();

    await page.goto('/report');
    await expect(page.getByRole('link', { name: 'Laba Rugi' })).toBeVisible();

    await seedMemberOnlyUser(page);
    await logout(page);
    await loginWithCredentials(page, memberOnlyUser.email, memberOnlyUser.pin);

    await page.goto('/koperasi');
    await expect(page.getByRole('heading', { name: 'Koperasi' })).toBeVisible();
    await expect(page.locator('main a[href="/koperasi/anggota"]')).toBeVisible();
    await expect(page.locator('main a[href="/koperasi/simpanan"]')).toHaveCount(0);
    await expect(page.locator('main a[href="/koperasi/migrasi-simpanan"]')).toHaveCount(0);
    await expect(page.locator('main a[href="/koperasi/pinjaman"]')).toHaveCount(0);

    await page.goto('/koperasi/anggota');
    await expect(page.getByText('Master Anggota Koperasi')).toBeVisible();

    await page.goto('/koperasi/simpanan');
    await expect(page.getByText(/Module tidak aktif|Akses tidak tersedia/)).toBeVisible();

    await page.goto('/koperasi/migrasi-simpanan');
    await expect(page.getByText(/Module tidak aktif|Akses tidak tersedia/)).toBeVisible();

    await page.goto('/report/profit-loss-report');
    await expect(page.getByText(/Module tidak aktif|Akses tidak tersedia/)).toBeVisible();
  });
});
