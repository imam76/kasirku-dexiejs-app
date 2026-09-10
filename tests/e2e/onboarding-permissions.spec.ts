import { expect, test, type Page } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

function anonymousAuthResponse(userId: string) {
  const now = new Date().toISOString();
  return {
    access_token: [
      Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString(
        'base64url',
      ),
      Buffer.from(
        JSON.stringify({
          sub: userId,
          role: 'authenticated',
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString('base64url'),
      Buffer.from('e2e-signature').toString('base64url'),
    ].join('.'),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `refresh-${userId}`,
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      identities: [],
      is_anonymous: true,
      created_at: now,
      updated_at: now,
    },
  };
}

async function seedSubscriptionUser(page: Page, role: 'KASIR' | 'ADMIN') {
  await page.route('**/v1/**', route => route.abort());
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Buat usaha baru', exact: true })).toBeVisible();
  await page.evaluate(async (userRole) => {
    const { createTrial, writeSubscription } = await import('/src/onboarding/storage.ts');
    const { applySubscriptionModules } = await import('/src/onboarding/billingClient.ts');
    const { createOwnerUser, createAuthUser, loginWithEmailAndPin, logout } = await import('/src/auth/authService.ts');
    const trial = await createTrial({ owner: 'Audit Owner', business: 'Audit Usaha', whatsapp: '081234567890', businessType: 'Ritel', email: '', location: '' }, 'pos', [], false);
    applySubscriptionModules(trial);
    writeSubscription(trial);
    await createOwnerUser({ name: 'Audit Owner', email: 'audit-owner@example.test', pin: '731482' });
    await loginWithEmailAndPin('audit-owner@example.test', '731482');
    await createAuthUser({ name: 'Audit Staff', email: 'audit-staff@example.test', pin: '842593', role: userRole });
    await logout();
    await loginWithEmailAndPin('audit-staff@example.test', '842593');
  }, role);
  await page.reload();
  await page.getByRole('button', { name: /^Profil login / }).click();
  await page.getByRole('region', { name: 'Langganan usaha' }).getByRole('button', { name: 'Upgrade paket' }).click();
}

test('cashier cannot export backups or manage recovery, including after expiry and via service calls', async ({ page }) => {
  await seedSubscriptionUser(page, 'KASIR');
  for (const expired of [false, true]) {
    if (expired) await page.evaluate(() => {
      const key = 'frayukti-subscription-v1';
      const value = JSON.parse(localStorage.getItem(key)!);
      value.access.start = new Date(Date.now() - 91 * 86_400_000).toISOString();
      value.access.end = new Date(Date.now() - 86_400_000).toISOString();
      localStorage.setItem(key, JSON.stringify(value));
      window.dispatchEvent(new Event('frayukti-subscription-changed'));
    });
    await expect(page.getByRole('button', { name: 'Ekspor backup data' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Tampilkan kode pemulihan' })).toHaveCount(0);
    await expect(page.getByLabel('Kode pemulihan langganan')).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: /Izinkan follow-up/ })).toHaveCount(0);
    const errors = await page.evaluate(async () => {
      const { backupDatabase } = await import('/src/utils/backupRestore.ts');
      const { revealRecoveryCode, recoverSubscription } = await import('/src/onboarding/billingClient.ts');
      const results = [];
      for (const action of [backupDatabase, revealRecoveryCode, () => recoverSubscription('a'.repeat(64))]) {
        try { await action(); results.push('ALLOWED'); }
        catch (error) { results.push((error as Error).message); }
      }
      return results;
    });
    expect(errors).toEqual([
      'Anda tidak memiliki akses untuk aksi ini.',
      'Hanya Owner yang dapat mengelola identitas langganan.',
      'Hanya Owner yang dapat mengelola identitas langganan.',
    ]);
  }
  // Expired staff must still be able to hand the device over to its Owner.
  await page.getByRole('button', { name: 'Ganti pengguna' }).click();
  await page.getByLabel('Email').fill('audit-owner@example.test');
  await page.getByLabel('PIN', { exact: true }).fill('731482');
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect(page.getByText('Masa akses berakhir', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tampilkan kode pemulihan' }).click();
  await expect(page.getByLabel('Kode pemulihan usaha')).toHaveValue(/^[a-f0-9]{64}$/);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Ekspor backup data' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.json$/);
});

test('administrator with Settings permission can back up but cannot reveal recovery', async ({ page }) => {
  await seedSubscriptionUser(page, 'ADMIN');
  await expect(page.getByRole('button', { name: 'Tampilkan kode pemulihan' })).toHaveCount(0);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Ekspor backup data' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.json$/);
});

test('a failed checkout refreshes the pending order and retries using the same request ID', async ({ page }) => {
  await seedSubscriptionUser(page, 'ADMIN');
  const trial = await page.evaluate(() => JSON.parse(localStorage.getItem('frayukti-subscription-v1')!));
  const businessId = '8870f7f2-a1c4-4d29-99dd-87c75c410001';
  const requests: string[] = [];
  const order = {
    orderId: 'FRY-checkout-retry', plan: 'pos', amount: 149000, status: 'creating',
    createdAt: new Date().toISOString(), accessStart: null, accessEnd: null,
    redirectUrl: null as string | null,
  };
  await page.unroute('**/v1/**');
  const auth = anonymousAuthResponse(
    '8870f7f2-a1c4-4d29-99dd-87c75c410012',
  );
  await page.route('**/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/auth/v1/signup') return route.fulfill({ json: auth });
    if (path === '/auth/v1/user')
      return route.fulfill({ json: auth.user });
    if (path === '/v1/registrations') return route.fulfill({ json: { businessId } });
    if (path === '/v1/status') return route.fulfill({ json: {
      businessId, registration: trial.registration, access: trial.access,
      orders: requests.length ? [order] : [],
    } });
    if (path === '/v1/checkouts') {
      requests.push(route.request().postDataJSON().requestId);
      if (requests.length === 1) return route.fulfill({ status: 503, json: { error: 'Checkout sementara tidak tersedia.' } });
      order.status = 'pending';
      order.redirectUrl = 'https://app.sandbox.midtrans.com/snap/v4/redirection/retry';
      return route.fulfill({ json: { orderId: order.orderId, redirectUrl: order.redirectUrl, amount: order.amount } });
    }
    return route.abort();
  });
  await page.getByRole('button', { name: 'Siapkan pembayaran' }).click();
  await expect(page.getByText('Checkout sementara tidak tersedia.', { exact: true })).toBeVisible();
  await expect(page.getByText('Checkout belum selesai dibuat. Pilih Lanjutkan checkout untuk mencoba kembali.')).toBeVisible();
  await page.getByRole('button', { name: 'Lanjutkan checkout' }).click();
  await expect(page.getByRole('button', { name: 'Buka Midtrans Sandbox' })).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[0]).toBe(requests[1]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('frayukti-subscription-v1')!).access.kind)).toBe('trial');
});
