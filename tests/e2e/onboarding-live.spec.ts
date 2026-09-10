import { expect, test, type Page } from '@playwright/test';
test.use({ storageState: { cookies: [], origins: [] } });

async function registerTrial(page: Page) {
  await page
    .getByRole('button', { name: 'Buat usaha baru', exact: true })
    .click();
  await page.getByLabel('Nama pemilik').fill('Pemilik Sandbox');
  await page.getByLabel('Nama usaha', { exact: true }).fill('Usaha Sandbox');
  await page.getByLabel('Nomor WhatsApp').fill('081234567890');
  await page.getByRole('combobox', { name: 'Jenis usaha', exact: true }).click();
  await page.getByRole('option', { name: 'Ritel / restoran', exact: true }).click();
  await page.getByRole('button', { name: 'Lanjut', exact: true }).click();
  await expect(page.getByRole('radio', { name: /POS Ritel/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('button', { name: 'Lanjut', exact: true }).click();
  await page.getByRole('button', { name: 'Lewati, gunakan bawaan' }).click();
  await expect(
    page.getByRole('button', { name: 'Setujui & mulai trial 90 hari' }),
  ).toBeDisabled();
  await expect(
    page.getByRole('checkbox', { name: /follow-up/ }),
  ).not.toBeChecked();
  await page.getByRole('button', { name: 'Baca Syarat Layanan' }).click();
  await expect(page.getByRole('dialog')).toContainText('draf uji sandbox');
  await page.getByRole('button', { name: 'Selesai membaca' }).click();
  await page
    .getByRole('checkbox', { name: 'Saya menyetujui Syarat Layanan' })
    .check();
  await page
    .getByRole('checkbox', {
      name: 'Saya menerima pemberitahuan Kebijakan Privasi',
    })
    .check();
  await page
    .getByRole('button', { name: 'Setujui & mulai trial 90 hari' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Daftarkan Owner' }),
  ).toBeVisible();
  await expect(page.getByLabel('ID masuk')).toHaveValue('owner@frayukti.local');
  await page.getByLabel('PIN', { exact: true }).fill('731482');
  await page.getByLabel('Konfirmasi PIN').fill('731482');
  await page.getByRole('button', { name: 'Buat Owner & masuk' }).click();
  await expect(
    page.getByRole('button', { name: /^Profil login / }),
  ).toBeVisible();
}
async function openSubscription(page: Page, name = 'Upgrade paket') {
  await page.getByRole('button', { name: /^Profil login / }).click();
  await page
    .getByRole('region', { name: 'Langganan usaha' })
    .getByRole('button', { name })
    .click();
}
async function expireTrial(page: Page) {
  await page.evaluate(() => {
    const key = 'frayukti-subscription-v1';
    const state = JSON.parse(localStorage.getItem(key)!);
    state.access.start = new Date(Date.now() - 91 * 86_400_000).toISOString();
    state.access.end = new Date(Date.now() - 86_400_000).toISOString();
    localStorage.setItem(key, JSON.stringify(state));
    window.dispatchEvent(new Event('frayukti-subscription-changed'));
  });
}
for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`onboarding offline, expiry and backup ${viewport.width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize(viewport);
    await page.route('**/v1/**', (route) => route.abort());
    await page.goto('/');
    await expect(
      page.getByRole('button', { name: 'Buat usaha baru', exact: true }),
    ).toBeVisible();
    await context.setOffline(true);
    await registerTrial(page);
    const state = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('frayukti-subscription-v1')!),
    );
    expect(Date.parse(state.access.end) - Date.parse(state.access.start)).toBe(
      90 * 86_400_000,
    );
    expect(state.access.modules).not.toContain('GENERAL_LEDGER');
    expect(state.access.modules).not.toContain('PRODUCTION');
    expect(state.consent.termsHash).toMatch(/^[a-f0-9]{64}$/);
    expect(state.consent.marketing).toBe(false);
    expect(state.leadPending).toBe(true);
    await page.getByRole('button', { name: /^Profil login / }).click();
    const profileSubscription = page.getByRole('region', {
      name: 'Langganan usaha',
    });
    await expect(profileSubscription).toContainText('POS Ritel & Resto');
    await expect(profileSubscription).toContainText('Trial tersisa 90 hari');
    await page.screenshot({
      path: `test-results/onboarding-profile-trial-${viewport.width}.png`,
    });
    await profileSubscription
      .getByRole('button', { name: 'Upgrade paket' })
      .click();
    await page.getByRole('button', { name: 'Kembali ke aplikasi' }).click();
    await expireTrial(page);
    await expect(
      page.getByRole('heading', { name: 'Langganan, tanpa ribet.' }),
    ).toBeVisible();
    await expect(
      page.getByText('Masa akses berakhir', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Kembali ke aplikasi' }),
    ).toHaveCount(0);
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Ekspor backup data' }).click();
    expect((await downloadEvent).suggestedFilename()).toMatch(/\.json$/);
    await page
      .getByRole('button', { name: 'Tampilkan kode pemulihan' })
      .click();
    await expect(page.getByLabel('Kode pemulihan usaha')).toHaveValue(
      state.recoveryCode,
    );
    await expect(page.locator('body')).toHaveJSProperty(
      'scrollWidth',
      viewport.width,
    );
    await page.locator('.onboarding-subscription').evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.screenshot({
      path: `test-results/onboarding-live-expired-${viewport.width}.png`,
      fullPage: true,
    });
    await context.setOffline(false);
    await page.goto('/report/pos-sales');
    await expect(
      page.getByText('Masa akses berakhir', { exact: true }),
    ).toBeVisible();
  });
}
test('paid offline cache survives unavailable billing and queues consent withdrawal', async ({
  page,
  context,
}) => {
  await page.clock.setFixedTime(new Date('2026-09-09T10:00:00Z'));
  await page.route('**/v1/**', (route) => route.abort());
  await page.goto('/');
  await registerTrial(page);
  await expect(
    page.getByText('Pengingat Rabu: 90 hari akses tersisa.'),
  ).toBeVisible();
  await page.evaluate(() => {
    const key = 'frayukti-subscription-v1';
    const state = JSON.parse(localStorage.getItem(key)!);
    state.access = {
      ...state.access,
      kind: 'subscription',
      start: new Date().toISOString(),
      end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    };
    localStorage.setItem(key, JSON.stringify(state));
    window.dispatchEvent(new Event('frayukti-subscription-changed'));
  });
  await context.setOffline(true);
  await expect(page.getByText(/Pengingat Rabu:/)).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Kelola langganan' }),
  ).toHaveCount(0);
  await expect(page.locator('.ant-message-notice')).toHaveCount(0);
  await page.getByRole('button', { name: /^Profil login / }).click();
  const profileSubscription = page.getByRole('region', {
    name: 'Langganan usaha',
  });
  await expect(profileSubscription).toContainText('POS Ritel & Resto');
  await expect(profileSubscription).toContainText(
    'Berlaku hingga 9 Okt 2026',
  );
  await expect(
    profileSubscription.getByText('Aktif', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: 'test-results/onboarding-profile-paid-desktop.png',
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    profileSubscription.getByRole('button', { name: 'Kelola langganan' }),
  ).toBeVisible();
  await page.screenshot({
    path: 'test-results/onboarding-profile-paid-mobile.png',
    animations: 'disabled',
  });
  await profileSubscription
    .getByRole('button', { name: 'Kelola langganan' })
    .click();
  await expect(
    page.getByText('Langganan aktif', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Periksa status', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Kembali ke aplikasi' }),
  ).toBeVisible();
  await page.getByRole('checkbox', { name: /Izinkan follow-up/ }).check();
  await page.getByRole('checkbox', { name: /Izinkan follow-up/ }).uncheck();
  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('frayukti-subscription-v1')!),
  );
  expect(state.access.kind).toBe('subscription');
  expect(state.consentPending).toBe(true);
  expect(state.consent.marketing).toBe(false);
  await page.getByRole('button', { name: 'Kembali ke aplikasi' }).click();
  await page.evaluate(() => {
    const key = 'frayukti-subscription-v1';
    const state = JSON.parse(localStorage.getItem(key)!);
    state.access.start = new Date(Date.now() - 24 * 86_400_000).toISOString();
    state.access.end = new Date(Date.now() + 6 * 86_400_000).toISOString();
    localStorage.setItem(key, JSON.stringify(state));
    window.dispatchEvent(new Event('frayukti-subscription-changed'));
  });
  const expiryReminder = page
    .getByRole('alert')
    .filter({ hasText: 'Akses berakhir dalam 6 hari.' });
  await expect(expiryReminder).toBeVisible();
  await expect(expiryReminder).toHaveCSS('position', 'relative');
  await expiryReminder
    .getByRole('button', { name: 'Perpanjang langganan' })
    .click();
  await expect(
    page.getByText('Langganan aktif', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Kembali ke aplikasi' }).click();
  await expiryReminder.getByRole('button', { name: 'Close' }).click();
  await openSubscription(page, 'Kelola langganan');
  await page.getByRole('button', { name: 'Kembali ke aplikasi' }).click();
  await expect(expiryReminder).toHaveCount(0);
});

test('checkout stays trial until billing activation, then a new installation recovers without a local role', async ({
  page,
  browser,
}) => {
  await page.route('**/v1/**', (route) => route.abort());
  await page.goto('/');
  await registerTrial(page);
  const trial = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('frayukti-subscription-v1')!),
  );
  const businessId = '8870f7f2-a1c4-4d29-99dd-87c75c410000';
  const server = {
    businessId,
    registration: trial.registration,
    access: trial.access,
    orders: [] as Record<string, unknown>[],
  };
  await page.unroute('**/v1/**');
  await page.route('**/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/v1/registrations')
      return route.fulfill({ json: { businessId } });
    if (path === '/v1/status') return route.fulfill({ json: server });
    if (path === '/v1/checkouts') {
      expect(route.request().postDataJSON()).not.toHaveProperty('amount');
      const order = {
        orderId: 'FRY-e2e',
        plan: 'pos',
        amount: 149000,
        status: 'pending',
        createdAt: new Date().toISOString(),
        accessStart: null,
        accessEnd: null,
        redirectUrl: 'https://app.sandbox.midtrans.com/snap/v4/redirection/e2e',
      };
      server.orders = [order];
      return route.fulfill({
        json: {
          orderId: order.orderId,
          amount: order.amount,
          redirectUrl: order.redirectUrl,
        },
      });
    }
    return route.fulfill({ json: { saved: true } });
  });
  await openSubscription(page);
  await page.getByRole('button', { name: 'Siapkan pembayaran' }).click();
  await expect(
    page.getByRole('button', { name: 'Buka Midtrans Sandbox' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('frayukti-subscription-v1')!).access
          .kind,
    ),
  ).toBe('trial');
  server.access = {
    ...trial.access,
    kind: 'subscription',
    start: new Date().toISOString(),
    end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  };
  server.orders[0] = {
    ...server.orders[0],
    status: 'paid',
    accessStart: server.access.start,
    accessEnd: server.access.end,
  };
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(
    page.getByText('Langganan aktif', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Kembali ke aplikasi' }).click();
  await expect(page.getByText(/Pengingat Rabu:/)).toHaveCount(0);
  await openSubscription(page, 'Kelola langganan');
  await expect(
    page.getByText('Langganan aktif', { exact: true }),
  ).toBeVisible();

  const other = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 390, height: 844 },
  });
  const newPage = await other.newPage();
  await newPage.route('**/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/v1/recovery') {
      expect(route.request().postDataJSON().recoveryCode).toBe(
        trial.recoveryCode,
      );
      return route.fulfill({ json: { businessId } });
    }
    if (path === '/v1/consent')
      return route.fulfill({ json: { consent: trial.consent } });
    return route.fulfill({ json: server });
  });
  await newPage.goto(new URL('/', page.url()).href);
  await newPage
    .getByRole('button', { name: 'Hubungkan langganan', exact: true })
    .click();
  await newPage
    .getByLabel('Kode pemulihan', { exact: true })
    .fill(trial.recoveryCode);
  await newPage
    .getByRole('button', { name: 'Hubungkan langganan', exact: true })
    .click();
  await expect(
    newPage.getByRole('heading', { name: 'Daftarkan Owner' }),
  ).toBeVisible();
  const recovered = await newPage.evaluate(() =>
    JSON.parse(localStorage.getItem('frayukti-subscription-v1')!),
  );
  expect(recovered.access).toEqual(server.access);
  expect(recovered.businessId).toBe(businessId);
  await other.close();
});
