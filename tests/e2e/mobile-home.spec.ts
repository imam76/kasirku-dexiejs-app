import { expect, test, type Page } from '@playwright/test';
import { loginWithCredentials, logout, registerFirstOwner } from './helpers/auth';
import { demoOwner } from './helpers/data';

const warehouseUser = {
  email: 'gudang.mobile@frayukti.test',
  name: 'Petugas Gudang Mobile',
  pin: '246810',
};

const seedWarehouseUser = async (page: Page) => {
  await page.evaluate(async (input) => {
    const bytesToHex = (bytes: Uint8Array) => (
      Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
    );
    const salt = 'e2e-mobile-home-warehouse-salt';
    const encoded = new TextEncoder().encode(`${salt}:${input.pin}`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    const now = new Date().toISOString();
    const { db } = await import('/src/lib/db.ts');

    await db.authUsers.put({
      id: 'e2e-mobile-home-warehouse-user',
      name: input.name,
      email: input.email,
      role: 'GUDANG',
      pin_hash: bytesToHex(new Uint8Array(hashBuffer)),
      pin_salt: salt,
      is_active: true,
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
    });
  }, warehouseUser);
};

test.describe('mobile operational Home', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('shows a role-aware summary, compact services, and recent transactions', async ({ page }) => {
    await registerFirstOwner(page);

    await page.evaluate(async () => {
      const { db } = await import('/src/lib/db.ts');
      const now = new Date().toISOString();
      await db.transactions.put({
        id: 'e2e-mobile-home-transaction',
        transaction_number: 'TRX-MOBILE-001',
        business_type: 'SALE',
        total_amount: 125_000,
        payment_amount: 125_000,
        change_amount: 0,
        payment_method: 'TUNAI',
        payment_method_code: 'CASH',
        payment_method_name: 'Tunai',
        payment_method_category: 'CASH',
        status: 'COMPLETED',
        created_at: now,
      });
    });

    await expect(page.getByText('Selamat datang,')).toBeVisible();
    await expect(page.getByRole('heading', { name: demoOwner.name })).toBeVisible();
    await expect(page.getByText('Penjualan hari ini')).toBeVisible();
    await expect(page.getByText('1 transaksi')).toBeVisible();
    await expect(page.getByText('TRX-MOBILE-001')).toBeVisible();

    const services = page.getByRole('region', { name: 'Layanan utama' });
    await expect(services).toBeVisible();
    await expect(services.locator('a, button')).toHaveCount(8);

    const moreButton = services.getByRole('button', { name: /Buka \d+ layanan lainnya/ });
    await expect(moreButton).toBeVisible();
    await moreButton.click();
    await expect(page.getByRole('dialog').filter({ hasText: 'Navigasi' })).toBeVisible();
    await page.keyboard.press('Escape');

    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      const hasHorizontalOverflow = await page.evaluate(() => (
        document.documentElement.scrollWidth > document.documentElement.clientWidth
      ));
      expect(hasHorizontalOverflow).toBe(false);
    }
  });

  test('shows an operational fallback and only permitted services without report access', async ({ page }) => {
    await registerFirstOwner(page);
    await seedWarehouseUser(page);
    await logout(page);
    await loginWithCredentials(page, warehouseUser.email, warehouseUser.pin);

    await expect(page.getByRole('heading', { name: warehouseUser.name })).toBeVisible();
    await expect(page.getByText('Siap memulai operasional')).toBeVisible();
    await expect(page.getByText('Penjualan hari ini')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Transaksi terbaru' })).toHaveCount(0);

    const services = page.getByRole('region', { name: 'Layanan utama' });
    await expect(services.getByRole('link', { name: 'Master Data' })).toBeVisible();
    await expect(services.getByRole('link', { name: 'POS' })).toHaveCount(0);
    await expect(services.getByRole('link', { name: 'Laporan' })).toBeVisible();
  });
});
