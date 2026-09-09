import { expect, test, type Page } from '@playwright/test';

const previewUrl = '/onboarding-preview.html';
async function scenario(page: Page, name: string) {
  await page.getByRole('button', { name: 'Skenario simulasi', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('compact viewport, picker Back and overlay resize keep the draft usable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(previewUrl);
  await page.getByRole('button', { name: /Daftar usaha baru/ }).click();
  await page.getByLabel('Nama pemilik', { exact: true }).fill('Rani');
  await page.getByLabel('Jenis usaha', { exact: true }).click();
  await expect(page.getByRole('option', { name: 'Ritel / restoran', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('option', { name: 'Ritel / restoran', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Nama pemilik', { exact: true })).toHaveValue('Rani');
  await noOverflow(page);
  await primaryVisible(page);
  await page.getByRole('button', { name: 'Skenario simulasi', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.getByRole('dialog').getByRole('button', { name: 'Tutup', exact: true }).click();
  await expect(page.getByLabel('Nama pemilik', { exact: true })).toHaveValue('Rani');
  await page.setViewportSize({ width: 844, height: 390 });
  await noOverflow(page);
  await primaryVisible(page);
});
async function register(page: Page) {
  await page.getByLabel('Nama pemilik', { exact: true }).fill('Rani Demo');
  await page.getByLabel('Nama usaha', { exact: true }).fill('Toko Sinar Demo');
  await page.getByLabel('Nomor WhatsApp', { exact: true }).fill('081234567890');
  await page.getByLabel('Jenis usaha', { exact: true }).click();
  await page.getByRole('option', { name: 'Ritel / restoran', exact: true }).click();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('.preview-main').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
}
async function primaryVisible(page: Page) {
  const bounds = await page.locator('.preview-footer .ant-btn-primary').boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
}

for (const viewport of [{ name: 'desktop', width: 1440, height: 960 }, { name: 'mobile', width: 390, height: 844 }]) {
  test.describe(`onboarding preview ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('registration to trial to payment, with isolation, Back, consent and resize', async ({ page }) => {
      const requests: string[] = [];
      page.on('request', (request) => requests.push(request.url()));
      await page.goto(previewUrl);
      await expect(page.getByRole('heading', { name: 'Mulai perjalanan usahamu', exact: true })).toBeVisible();
      await page.getByRole('button', { name: /Daftar usaha baru/ }).click();
      await page.getByRole('button', { name: 'Lanjutkan', exact: true }).click();
      await expect(page.getByLabel('Nama pemilik', { exact: true })).toHaveAttribute('aria-invalid', 'true');
      await expect(page.getByLabel('Nama pemilik', { exact: true })).toBeFocused();
      await register(page);
      await page.getByLabel('Nomor WhatsApp', { exact: true }).press('Enter');
      await expect(page.getByRole('heading', { name: 'Kenali usahamu', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Lanjutkan', exact: true }).click();
      await page.getByRole('button', { name: 'Pilih paket POS Ritel & Resto' }).click();
      await noOverflow(page);
      await page.getByRole('button', { name: /Detail modul/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.goBack();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.getByRole('button', { name: 'Lanjutkan', exact: true }).click();
      await page.getByRole('button', { name: 'Kembali', exact: true }).click();
      await page.getByRole('button', { name: 'Kembali', exact: true }).click();
      await expect(page.getByLabel('Nama pemilik', { exact: true })).toHaveValue('Rani Demo');
      await page.setViewportSize({ width: viewport.name === 'desktop' ? 390 : 1440, height: 900 });
      await expect(page.getByLabel('Nama usaha', { exact: true })).toHaveValue('Toko Sinar Demo');
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.reload();
      await expect(page.getByLabel('Nama usaha', { exact: true })).toHaveValue('Toko Sinar Demo');
      await page.getByRole('button', { name: 'Lanjutkan', exact: true }).click();
      await page.getByRole('button', { name: 'Lanjutkan', exact: true }).click();
      await page.getByRole('button', { name: 'Lanjutkan', exact: true }).click();
      await expect(page.getByRole('checkbox', { name: /Saya bersedia/ })).not.toBeChecked();
      await page.getByRole('button', { name: 'Mulai trial simulasi', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Syarat & privasi', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Syarat Layanan', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.getByRole('checkbox', { name: 'Saya menyetujui Syarat Layanan simulasi.' }).check();
      await page.getByRole('checkbox', { name: 'Saya menerima pemberitahuan Kebijakan Privasi simulasi.' }).check();
      await page.getByRole('switch', { name: 'Offline simulasi' }).click();
      await page.getByRole('button', { name: 'Mulai trial simulasi', exact: true }).click();
      await expect(page.getByText('90 hari tersisa', { exact: true })).toBeVisible();
      await page.locator('.preview-footer').getByRole('button', { name: 'Upgrade sekarang' }).click();
      await expect(page.getByRole('button', { name: 'Lanjut ke checkout simulasi' })).toBeDisabled();
      await page.getByRole('switch', { name: 'Offline simulasi' }).click();
      await page.getByRole('button', { name: 'Lanjut ke checkout simulasi' }).click();
      await expect(page.getByText('Menunggu pembayaran', { exact: true })).toBeVisible();
      await page.getByLabel('Hasil layanan simulasi').selectOption('activation-waiting');
      await page.getByRole('button', { name: 'Periksa status pembayaran', exact: true }).click();
      await expect(page.getByText(/Pembayaran berhasil, aktivasi belum diterima/)).toBeVisible();
      await page.getByRole('button', { name: 'Status akses usaha', exact: true }).click();
      await expect(page.getByText('90 hari tersisa', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Periksa status akses', exact: true }).click();
      await page.getByLabel('Hasil layanan simulasi').selectOption('success');
      await page.getByRole('button', { name: 'Periksa status pembayaran', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Paketmu sudah aktif', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Kembali ke aplikasi', exact: true }).click();
      await expect(page.getByText('Aktif', { exact: true })).toBeVisible();
      await noOverflow(page);
      expect(requests.some((url) => /\/src\/(lib\/db|auth\/AuthProvider|AppShell|services\/setupKeyService)/.test(url))).toBe(false);
      expect(await page.evaluate(async () => (await indexedDB.databases()).length)).toBe(0);
      expect(await page.evaluate(() => Object.keys(localStorage).every((key) => key.startsWith('frayukti:onboarding-preview:')))).toBe(true);
    });

    test('expiry, recovery and Android browser handoff preserve exact dates', async ({ page }) => {
      await page.goto(previewUrl);
      await scenario(page, 'Trial habis');
      await expect(page.getByText('Masa trial habis', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Ekspor backup', exact: true })).toBeInViewport();
      await page.getByRole('button', { name: 'Ekspor backup', exact: true }).click();
      await expect(page.getByRole('dialog')).toContainText('Tidak ada ekspor yang dijalankan');
      await page.getByRole('dialog').getByRole('button', { name: 'Tutup', exact: true }).click();
      await page.getByRole('button', { name: 'Sudah punya langganan', exact: true }).click();
      await page.getByRole('switch', { name: 'Offline simulasi' }).click();
      await page.getByRole('button', { name: 'Simulasikan verifikasi & pulihkan' }).click();
      await expect(page.getByText(/Pemulihan memerlukan koneksi/)).toBeVisible();
      await page.getByRole('switch', { name: 'Offline simulasi' }).click();
      await page.getByLabel('Hasil layanan simulasi').selectOption('failed');
      await page.getByRole('button', { name: 'Simulasikan verifikasi & pulihkan' }).click();
      await expect(page.getByText(/Verifikasi simulasi gagal/)).toBeVisible();
      await page.getByLabel('Hasil layanan simulasi').selectOption('expired');
      await page.getByRole('button', { name: 'Simulasikan verifikasi & pulihkan' }).click();
      await expect(page.getByText('Langganan habis', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Sudah punya langganan', exact: true }).click();
      await page.getByLabel('Hasil layanan simulasi').selectOption('success');
      await page.getByRole('button', { name: 'Simulasikan verifikasi & pulihkan' }).click();
      await expect(page.locator('.preview-dates')).toContainText('1 Oktober 2026');
      await page.getByRole('button', { name: 'Skenario simulasi', exact: true }).click();
      await page.getByLabel('Perilaku checkout').selectOption('android');
      await page.getByRole('dialog').getByRole('button', { name: 'Tutup', exact: true }).click();
      await page.getByRole('button', { name: 'Perpanjang langganan', exact: true }).click();
      await page.getByRole('button', { name: 'Simulasikan menuju browser eksternal' }).click();
      await expect(page.getByText('Simulasi perpindahan ke browser', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Saya sudah kembali ke aplikasi' }).click();
      await expect(page.getByText('Menunggu pembayaran', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Status akses usaha', exact: true }).click();
      await expect(page.locator('.preview-dates')).toContainText('1 Oktober 2026');
    });

    for (const mode of ['light', 'dark'] as const) {
      test(`visual, focus, overlays and footer in ${mode}`, async ({ page }, testInfo) => {
        await page.addInitScript((value) => localStorage.setItem('frayukti:onboarding-preview:theme', value), mode);
        await page.goto(previewUrl);
        await page.getByRole('button', { name: /Daftar usaha baru/ }).click();
        await register(page);
        await page.getByRole('button', { name: 'Lanjutkan', exact: true }).click();
        await primaryVisible(page);
        await noOverflow(page);
        await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-${mode}-plans.png`) });
        await page.getByRole('button', { name: 'Pilih paket Custom' }).click();
        await page.getByRole('checkbox', { name: 'Produksi', exact: true }).check();
        await page.getByRole('button', { name: /Detail modul/ }).click();
        await page.keyboard.press('Tab');
        await expect.poll(() => page.getByRole('dialog').evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
        await page.keyboard.press('Shift+Tab');
        await expect.poll(() => page.getByRole('dialog').evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
        await expect(page.getByRole('dialog').getByRole('button', { name: 'Tutup', exact: true })).toBeInViewport();
        await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-${mode}-overlay.png`) });
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await page.getByRole('button', { name: 'Lanjutkan', exact: true }).click();
        await page.getByRole('radio', { name: 'Atur sekarang', exact: true }).check();
        await noOverflow(page);
        await page.getByLabel('Mulai pembukuan', { exact: true }).focus();
        await page.evaluate(() => document.documentElement.style.setProperty('--app-keyboard-inset-bottom', '280px'));
        const footer = await page.locator('.preview-footer').boundingBox();
        expect(footer!.y + footer!.height).toBeLessThanOrEqual(viewport.height - 280);
        await page.evaluate(() => document.documentElement.style.setProperty('--app-keyboard-inset-bottom', '0px'));
        await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-${mode}-accounting.png`) });
        await scenario(page, 'Trial habis');
        await primaryVisible(page);
        await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-${mode}-expired.png`) });
        await page.getByRole('button', { name: 'Ganti bahasa' }).click();
        await expect(page.getByRole('heading', { name: 'Business access status', exact: true })).toBeVisible();
        await noOverflow(page);
      });
    }
  });
}
