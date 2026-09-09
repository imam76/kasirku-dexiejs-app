import { expect, test } from '@playwright/test';

for (const width of [390, 768, 1024, 1440]) {
  for (const mode of ['light', 'dark'] as const) {
    test(`subscription reference ${width}px ${mode}: plans, payment, activation and management`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('frayukti:onboarding-preview:theme', value), mode);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('/onboarding-preview.html');
      await page.getByRole('button', { name: 'Skenario simulasi', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: '01 · Pilih paket', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Pilih paket yang pas', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Pilih paket Perdagangan Umum', exact: true }).click();
      const checkLayout = async (screen: string) => {
        expect(await page.locator('.preview-main').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`${screen}.png`) });
      };
      await checkLayout('01-plans');
      await page.getByRole('button', { name: 'Lanjutkan', exact: true }).click();
      await page.getByRole('radio', { name: /^Kartu/ }).check();
      await page.reload();
      await expect(page.getByRole('radio', { name: /^Kartu/ })).toBeChecked();
      await checkLayout('02-checkout');
      await expect(page.getByRole('button', { name: 'Lanjut ke checkout simulasi', exact: true })).toBeInViewport();
      await page.getByRole('button', { name: 'Lanjut ke checkout simulasi', exact: true }).click();
      await page.getByLabel('Hasil layanan simulasi').selectOption('success');
      await page.getByRole('button', { name: 'Periksa status pembayaran', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Paketmu sudah aktif', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Kembali ke aplikasi', exact: true })).toBeInViewport();
      await checkLayout('03-activation');
      await page.getByRole('button', { name: 'Lihat invoice', exact: true }).click();
      await expect(page.getByRole('dialog')).toContainText('SIM-trading-2026-09-09');
      await expect(page.getByRole('dialog')).toContainText('Kartu');
      await page.goBack();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.getByRole('button', { name: 'Kembali ke aplikasi', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Langganan', exact: true })).toBeVisible();
      await checkLayout('04-subscription');
      await page.getByRole('button', { name: 'Riwayat pembayaran', exact: true }).click();
      await expect(page.getByRole('dialog')).toContainText('Pembayaran berhasil');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Ubah paket', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Pilih paket yang pas', exact: true })).toBeVisible();
      if (width < 1280) {
        await page.getByRole('button', { name: 'Kembali', exact: true }).click();
        await page.getByRole('button', { name: 'Menu navigasi', exact: true }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Langganan', exact: true }).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(page.getByRole('heading', { name: 'Langganan', exact: true })).toBeVisible();
      }
      expect(errors).toEqual([]);
    });
  }
}
