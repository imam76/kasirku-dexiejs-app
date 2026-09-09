// Creates an unpaid sandbox checkout with synthetic data. Never performs a payment.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createTrialPayload } from './billing-test-payload.ts';

const base = process.env.BILLING_SMOKE_URL ?? 'http://127.0.0.1:8787';
if (
  new URL(base).hostname !== '127.0.0.1' &&
  new URL(base).hostname !== 'localhost'
)
  throw new Error('Smoke test hanya untuk layanan lokal.');
const token = randomBytes(32).toString('hex');
async function request(path: string, payload?: unknown) {
  const response = await fetch(`${base}${path}`, {
    method: payload ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(`${path}: HTTP ${response.status} ${body.error ?? ''}`);
  return body;
}
const health = await request('/health');
if (health.environment !== 'sandbox') throw new Error('Server bukan sandbox.');
const registration = await request(
  '/v1/registrations',
  createTrialPayload(token),
);
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
