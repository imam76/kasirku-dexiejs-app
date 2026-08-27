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
      localStorage.setItem('feedback_wave1_submitted', 'true');
      localStorage.setItem('feedback_wave2_submitted', 'true');
    });

    await expect(page.getByText('Selamat datang,')).toBeVisible();
    await expect(page.getByRole('heading', { name: demoOwner.name })).toBeVisible();
    await expect(page.getByText('Penjualan hari ini')).toBeVisible();
    await expect(page.getByText('1 transaksi')).toBeVisible();
    await expect(page.getByText('TRX-MOBILE-001')).toBeVisible();

    const bottomNavigation = page.getByTestId('mobile-bottom-navigation');
    await expect(bottomNavigation).toBeVisible();
    await expect(bottomNavigation.getByRole('link')).toHaveCount(4);
    await expect(bottomNavigation.getByRole('button', { name: 'Lainnya' })).toBeVisible();
    await expect(bottomNavigation.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('sidebar-toggle')).toHaveCount(0);

    const insetMetrics = await page.evaluate(async () => {
      const root = document.documentElement;
      root.style.setProperty('--safe-area-inset-top', '47px');
      root.style.setProperty('--safe-area-inset-right', '18px');
      root.style.setProperty('--safe-area-inset-bottom', '31px');
      root.style.setProperty('--safe-area-inset-left', '12px');
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const topNavbar = document.querySelector<HTMLElement>('[data-testid="app-top-navbar"]');
      const bottomNavbar = document.querySelector<HTMLElement>('[data-testid="mobile-bottom-navigation"]');
      const content = document.querySelector<HTMLElement>('[data-testid="app-content-insets"]');

      return {
        top: topNavbar ? getComputedStyle(topNavbar).paddingTop : '',
        right: bottomNavbar ? getComputedStyle(bottomNavbar).paddingRight : '',
        bottom: bottomNavbar ? getComputedStyle(bottomNavbar).paddingBottom : '',
        left: bottomNavbar ? getComputedStyle(bottomNavbar).paddingLeft : '',
        contentBottom: content ? getComputedStyle(content).paddingBottom : '',
      };
    });

    expect(insetMetrics).toEqual({
      top: '47px',
      right: '18px',
      bottom: '31px',
      left: '16px',
      contentBottom: '95px',
    });

    const services = page.getByRole('region', { name: 'Layanan utama' });
    await expect(services).toBeVisible();
    await expect(services.locator('a, button')).toHaveCount(8);

    const moreButton = services.getByRole('button', { name: /Buka \d+ layanan lainnya/ });
    await expect(moreButton).toBeVisible();
    await moreButton.click();
    await expect(page.getByRole('dialog').filter({ hasText: 'Navigasi' })).toBeVisible();
    await page.keyboard.press('Escape');

    await bottomNavigation.getByRole('link', { name: 'Riwayat' }).click();
    await expect(page).toHaveURL(/\/history$/);
    await expect(bottomNavigation.getByRole('link', { name: 'Riwayat' })).toHaveAttribute('aria-current', 'page');

    await bottomNavigation.getByRole('button', { name: 'Lainnya' }).click();
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

    const bottomNavigation = page.getByTestId('mobile-bottom-navigation');
    await expect(bottomNavigation.getByRole('link', { name: 'Home' })).toBeVisible();
    await expect(bottomNavigation.getByRole('link', { name: 'Produk' })).toBeVisible();
    await expect(bottomNavigation.getByRole('link', { name: 'POS' })).toHaveCount(0);
    await expect(bottomNavigation.getByRole('link', { name: 'Riwayat' })).toHaveCount(0);
  });
});
