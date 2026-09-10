// Creates an unpaid sandbox checkout with synthetic data. Never performs a payment.
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { createTrialPayload } from './billing-test-payload.ts';

const base = (
  process.env.BILLING_SMOKE_URL ??
  'http://127.0.0.1:54321/functions/v1/billing'
).replace(/\/$/, '');
const parsedBase = new URL(base);
if (
  !parsedBase.pathname.endsWith('/functions/v1/billing') ||
  (parsedBase.protocol !== 'https:' &&
    !['127.0.0.1', 'localhost'].includes(parsedBase.hostname))
)
  throw new Error('BILLING_SMOKE_URL harus menunjuk Edge Function billing.');

const publishableKey = process.env.BILLING_SMOKE_PUBLISHABLE_KEY?.trim();
if (!publishableKey)
  throw new Error('BILLING_SMOKE_PUBLISHABLE_KEY wajib diisi.');
const publicBase = base.replace(/\/billing$/, '/billing-public');
const supabase = createClient(parsedBase.origin, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const signedIn = await supabase.auth.signInAnonymously();
if (signedIn.error || !signedIn.data.session)
  throw new Error('Gagal membuat user anonim Supabase untuk smoke test.', {
    cause: signedIn.error,
  });
const accessToken = signedIn.data.session.access_token;

async function request(path: string, payload?: unknown) {
  const response = await fetch(`${base}${path}`, {
    method: payload ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(`${path}: HTTP ${response.status} ${body.error ?? ''}`);
  return body;
}

const healthResponse = await fetch(`${publicBase}/health`);
const health = await healthResponse.json();
if (!healthResponse.ok || health.environment !== 'sandbox')
  throw new Error('Server bukan sandbox atau health check gagal.');
const registration = await request('/v1/registrations', createTrialPayload());
const checkout = await request('/v1/checkouts', {
  requestId: randomUUID(),
  plan: 'pos',
  customModules: [],
});
const status = await request('/v1/status');
if (
  checkout.amount !== 149000 ||
  status.access.kind !== 'trial' ||
  !checkout.redirectUrl.startsWith('https://app.sandbox.midtrans.com/')
)
  throw new Error('Hasil checkout tidak sesuai.');
await mkdir('.billing-postgres.local', { recursive: true });
await writeFile(
  '.billing-postgres.local/snap-smoke.json',
  JSON.stringify(
    {
      businessId: registration.businessId,
      orderId: checkout.orderId,
      amount: checkout.amount,
      redirectUrl: checkout.redirectUrl,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    sandbox: true,
    checkoutCreated: true,
    amount: checkout.amount,
    accessStillTrial: true,
    resultFile: '.billing-postgres.local/snap-smoke.json',
  }),
);
