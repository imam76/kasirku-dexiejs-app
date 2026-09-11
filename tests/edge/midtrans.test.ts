import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readConfig } from '../../services/billing/config.ts';
import { createMidtrans, verifySignature } from '../../services/billing/midtrans.ts';

// Newer Deno CLI versions may inject Node globals via package.json. The
// deployed Edge bundle must also work when those globals are absent.
Reflect.deleteProperty(globalThis, 'Buffer');

const config = readConfig({
  BILLING_DATABASE_URL: 'postgres://localhost/billing',
  LEADS_DATABASE_URL: 'postgres://localhost/leads',
  MIDTRANS_MERCHANT_ID: 'test-merchant',
  MIDTRANS_SERVER_KEY: 'Mid-server-test',
  MIDTRANS_CLIENT_KEY: 'Mid-client-test',
});

Deno.test('checkout and status work in the Edge runtime without Node globals', async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const gateway = createMidtrans(config, (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    return Response.json(init?.method === 'POST'
      ? { redirect_url: 'https://app.sandbox.midtrans.com/snap/v4/redirection/test' }
      : { status_code: '404' });
  }) as typeof fetch);
  const payload = { transaction_details: { order_id: 'FRY-test', gross_amount: 149000 } };
  assert.equal(await gateway.checkout(payload), 'https://app.sandbox.midtrans.com/snap/v4/redirection/test');
  assert.equal(await gateway.status('FRY-test'), null);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, 'https://app.sandbox.midtrans.com/snap/v1/transactions');
  assert.equal(requests[1].url, 'https://api.sandbox.midtrans.com/v2/FRY-test/status');
  assert.equal(requests[0].init?.body, JSON.stringify(payload));
  for (const request of requests)
    assert.equal(new Headers(request.init?.headers).get('Authorization'), `Basic ${btoa('Mid-server-test:')}`);
});

Deno.test('webhook signatures are verified in the Edge runtime', () => {
  const body = {
    order_id: 'FRY-test', status_code: '200', gross_amount: '149000.00',
    signature_key: createHash('sha512').update('FRY-test200149000.00Mid-server-test').digest('hex'),
  };
  assert.equal(verifySignature(body, config.MIDTRANS_SERVER_KEY), true);
  assert.equal(verifySignature({ ...body, gross_amount: '1.00' }, config.MIDTRANS_SERVER_KEY), false);
  assert.equal(verifySignature({ ...body, signature_key: '00' }, config.MIDTRANS_SERVER_KEY), false);
});

Deno.test('a Midtrans outage is an error, while a missing transaction is waiting', async () => {
  const unavailable = createMidtrans(config, (async () => new Response(null, { status: 503 })) as typeof fetch);
  await assert.rejects(() => unavailable.status('FRY-test'), { statusCode: 502 });
  const missing = createMidtrans(config, (async () => new Response(null, { status: 404 })) as typeof fetch);
  assert.equal(await missing.status('FRY-test'), null);
});
