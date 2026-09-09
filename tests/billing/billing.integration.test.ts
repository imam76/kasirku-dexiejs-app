import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { readConfig } from '../../services/billing/config';
import { migrate, type Databases } from '../../services/billing/db';
import { buildApp } from '../../services/billing/app';
import {
  hashSecret,
  type MidtransStatus,
} from '../../services/billing/midtrans';
import { getPlanModules } from '../../src/onboarding/catalog';
import {
  TERMS_TEXT,
  TERMS_VERSION,
  PRIVACY_TEXT,
  PRIVACY_VERSION,
} from '../../src/onboarding/legal';

const config = {
  ...readConfig(),
  MIDTRANS_SERVER_KEY: 'Mid-server-test',
  MIDTRANS_MERCHANT_ID: 'test-merchant',
};
const schema = `test_billing_${randomBytes(6).toString('hex')}`;
const adminBilling = new pg.Pool({
  connectionString: config.BILLING_DATABASE_URL,
});
const adminLeads = new pg.Pool({ connectionString: config.LEADS_DATABASE_URL });
const db: Databases = {
  billing: new pg.Pool({
    connectionString: config.BILLING_DATABASE_URL,
    options: `-c search_path=${schema}`,
  }),
  leads: new pg.Pool({
    connectionString: config.LEADS_DATABASE_URL,
    options: `-c search_path=${schema}`,
  }),
};
let authoritativeStatus: MidtransStatus;
let checkoutCount = 0;
const app = buildApp(config, db, {
  async checkout() {
    checkoutCount++;
    return 'https://app.sandbox.midtrans.com/snap/v4/redirection/test';
  },
  async status() {
    return authoritativeStatus;
  },
});
app.log.level = 'silent';
const token = randomBytes(32).toString('hex');
const recoveryCode = randomBytes(32).toString('hex');
const headers = { authorization: `Bearer ${token}` };
const now = new Date().toISOString();
const input = {
  installationId: randomUUID(),
  token,
  recoveryCode,
  registration: {
    owner: 'Sandbox Owner',
    business: 'Sandbox Business',
    whatsapp: '081234567890',
    businessType: 'Retail',
    email: '',
    location: '',
  },
  consent: {
    termsVersion: TERMS_VERSION,
    termsHash: hashSecret(TERMS_TEXT),
    privacyVersion: PRIVACY_VERSION,
    privacyHash: hashSecret(PRIVACY_TEXT),
    acceptedAt: now,
    marketing: false,
    marketingUpdatedAt: now,
  },
  access: {
    kind: 'trial',
    plan: 'pos',
    modules: getPlanModules('pos', []),
    start: now,
    end: new Date(Date.now() + 90 * 86_400_000).toISOString(),
  },
};
// Keep exactly 90 days from the same starting timestamp.
input.access.end = new Date(Date.parse(now) + 90 * 86_400_000).toISOString();
let businessId: string;
let orderId: string;
const requestId = randomUUID();
async function notify(overrides: Partial<MidtransStatus> = {}) {
  authoritativeStatus = {
    order_id: orderId,
    status_code: '200',
    merchant_id: config.MIDTRANS_MERCHANT_ID,
    gross_amount: '149000.00',
    payment_type: 'bank_transfer',
    transaction_status: 'settlement',
    ...overrides,
  };
  const payload = {
    ...authoritativeStatus,
    signature_key: createHash('sha512')
      .update(
        orderId +
          '200' +
          authoritativeStatus.gross_amount +
          config.MIDTRANS_SERVER_KEY,
      )
      .digest('hex'),
  };
  return app.inject({
    method: 'POST',
    url: '/v1/midtrans/notifications',
    payload,
  });
}
beforeAll(async () => {
  await Promise.all([
    adminBilling.query(`CREATE SCHEMA ${schema}`),
    adminLeads.query(`CREATE SCHEMA ${schema}`),
  ]);
  await migrate(db);
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await Promise.all([db.billing.end(), db.leads.end()]);
  await Promise.all([
    adminBilling.query(`DROP SCHEMA ${schema} CASCADE`),
    adminLeads.query(`DROP SCHEMA ${schema} CASCADE`),
  ]);
  await Promise.all([adminBilling.end(), adminLeads.end()]);
});
describe('billing HTTP and PostgreSQL integration', () => {
  test('rejects unapproved consent and arbitrary transaction data', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/registrations',
          payload: {
            ...input,
            consent: { ...input.consent, termsHash: '0'.repeat(64) },
          },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/registrations',
          payload: { ...input, transactions: [] },
        })
      ).statusCode,
    ).toBe(400);
  });
  test('retries registration without creating another business, stores only secret hashes', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/v1/registrations',
      payload: input,
    });
    expect(first.statusCode).toBe(200);
    businessId = first.json().businessId;
    const retry = await app.inject({
      method: 'POST',
      url: '/v1/registrations',
      payload: input,
    });
    expect(retry.json().businessId).toBe(businessId);
    expect(
      (await db.billing.query('SELECT count(*)::int AS count FROM businesses'))
        .rows[0].count,
    ).toBe(1);
    expect(
      (await db.billing.query('SELECT recovery_hash FROM businesses')).rows[0]
        .recovery_hash,
    ).toBe(hashSecret(recoveryCode));
    expect(
      (await db.leads.query('SELECT consent FROM leads')).rows[0].consent
        .marketing,
    ).toBe(false);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/registrations',
          payload: { ...input, token: '0'.repeat(64) },
        })
      ).statusCode,
    ).toBe(409);
  });
  test('authenticates status and rejects client price overrides', async () => {
    expect((await app.inject({ url: '/v1/status' })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/checkouts',
          headers,
          payload: { requestId, plan: 'pos', customModules: [], amount: 1 },
        })
      ).statusCode,
    ).toBe(400);
  });
  test('creates one server-priced checkout and reuses concurrent retries', async () => {
    const checkout = await app.inject({
      method: 'POST',
      url: '/v1/checkouts',
      headers,
      payload: { requestId, plan: 'pos', customModules: [] },
    });
    expect(checkout.statusCode).toBe(200);
    orderId = checkout.json().orderId;
    expect(checkout.json().amount).toBe(149000);
    const retries = await Promise.all(
      [1, 2].map(() =>
        app.inject({
          method: 'POST',
          url: '/v1/checkouts',
          headers,
          payload: { requestId: randomUUID(), plan: 'pos', customModules: [] },
        }),
      ),
    );
    expect(retries.map((r) => r.json().orderId)).toEqual([orderId, orderId]);
    expect(checkoutCount).toBe(1);
    expect(
      (await app.inject({ url: '/v1/status', headers })).json().access.kind,
    ).toBe('trial');
  });
  test('rejects forged webhook, wrong merchant and wrong amount', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/midtrans/notifications',
          payload: {
            order_id: orderId,
            status_code: '200',
            gross_amount: '149000.00',
            signature_key: '0'.repeat(128),
          },
        })
      ).statusCode,
    ).toBe(401);
    expect((await notify({ merchant_id: 'wrong' })).statusCode).toBe(400);
    expect((await notify({ gross_amount: '1.00' })).statusCode).toBe(400);
  });
  test('pending and challenged capture do not activate; settlement activates exactly once', async () => {
    expect((await notify({ transaction_status: 'pending' })).statusCode).toBe(
      200,
    );
    expect(
      (await app.inject({ url: '/v1/status', headers })).json().access.kind,
    ).toBe('trial');
    expect(
      (
        await notify({
          transaction_status: 'capture',
          payment_type: 'credit_card',
          fraud_status: 'challenge',
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: '/v1/status', headers })).json().access.kind,
    ).toBe('trial');
    expect((await notify()).statusCode).toBe(200);
    const first = (await app.inject({ url: '/v1/status', headers })).json();
    expect(first.access.kind).toBe('subscription');
    await Promise.all([notify(), notify()]);
    await notify({ transaction_status: 'pending' });
    const after = (await app.inject({ url: '/v1/status', headers })).json();
    expect(after.access.end).toBe(first.access.end);
    expect(after.orders[0].status).toBe('paid');
  });
  test('verifies recovery secret and links another token to the identical access', async () => {
    const newToken = randomBytes(32).toString('hex');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/recovery',
          payload: { token: newToken, recoveryCode: '1'.repeat(64) },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/recovery',
          payload: { token: newToken, recoveryCode },
        })
      ).json().businessId,
    ).toBe(businessId);
    const recovered = (
      await app.inject({
        url: '/v1/status',
        headers: { authorization: `Bearer ${newToken}` },
      })
    ).json();
    expect(recovered.access).toEqual(
      (await app.inject({ url: '/v1/status', headers })).json().access,
    );
  });
  test('withdraws marketing consent and ignores an older offline retry', async () => {
    const granted = {
      ...input.consent,
      marketing: true,
      marketingUpdatedAt: new Date(Date.now() + 1000).toISOString(),
    };
    await app.inject({
      method: 'PATCH',
      url: '/v1/consent',
      headers,
      payload: granted,
    });
    const withdrawn = {
      ...granted,
      marketing: false,
      marketingUpdatedAt: new Date(Date.now() + 2000).toISOString(),
    };
    await app.inject({
      method: 'PATCH',
      url: '/v1/consent',
      headers,
      payload: withdrawn,
    });
    await app.inject({
      method: 'PATCH',
      url: '/v1/consent',
      headers,
      payload: granted,
    });
    expect(
      (await app.inject({ url: '/v1/consent', headers })).json().consent
        .marketing,
    ).toBe(false);
  });
  test('does not change active paid package, renews from paid end, flags refunds without double grants', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/checkouts',
          headers,
          payload: {
            requestId: randomUUID(),
            plan: 'production',
            customModules: [],
          },
        })
      ).statusCode,
    ).toBe(409);
    const before = (await app.inject({ url: '/v1/status', headers })).json()
      .access;
    const next = await app.inject({
      method: 'POST',
      url: '/v1/checkouts',
      headers,
      payload: { requestId: randomUUID(), plan: 'pos', customModules: [] },
    });
    orderId = next.json().orderId;
    await notify();
    const after = (await app.inject({ url: '/v1/status', headers })).json();
    expect(after.orders[0].accessStart).toBe(before.end);
    expect(Date.parse(after.access.end)).toBeGreaterThan(
      Date.parse(before.end),
    );
    await notify({ transaction_status: 'refund' });
    await notify();
    const refunded = (await app.inject({ url: '/v1/status', headers })).json();
    expect(refunded.orders[0].status).toBe('review_required');
    expect(refunded.access.end).toBe(after.access.end);
  });
  test('Custom charges setup once and stores only the explicitly selected sale modules', async () => {
    const customToken = randomBytes(32).toString('hex');
    const customHeaders = { authorization: `Bearer ${customToken}` };
    const customModules = ['PRODUCTION'];
    const registered = await app.inject({
      method: 'POST',
      url: '/v1/registrations',
      remoteAddress: '127.0.0.10',
      payload: {
        ...input,
        installationId: randomUUID(),
        token: customToken,
        recoveryCode: randomBytes(32).toString('hex'),
        access: {
          ...input.access,
          plan: 'custom',
          modules: getPlanModules('custom', customModules),
        },
      },
    });
    expect(registered.statusCode).toBe(200);
    const invalid = await app.inject({
      method: 'POST',
      url: '/v1/checkouts',
      remoteAddress: '127.0.0.10',
      headers: customHeaders,
      payload: {
        requestId: randomUUID(),
        plan: 'custom',
        customModules: ['GENERAL_LEDGER'],
      },
    });
    expect(invalid.statusCode).toBe(400);
    const first = await app.inject({
      method: 'POST',
      url: '/v1/checkouts',
      remoteAddress: '127.0.0.10',
      headers: customHeaders,
      payload: { requestId: randomUUID(), plan: 'custom', customModules },
    });
    expect(first.json().amount).toBe(4_499_000);
    orderId = first.json().orderId;
    expect((await notify({ gross_amount: '4499000.00' })).statusCode).toBe(200);
    const active = (
      await app.inject({ url: '/v1/status', headers: customHeaders })
    ).json();
    expect(active.access.modules).toEqual(
      getPlanModules('custom', customModules),
    );
    const renewal = await app.inject({
      method: 'POST',
      url: '/v1/checkouts',
      remoteAddress: '127.0.0.10',
      headers: customHeaders,
      payload: { requestId: randomUUID(), plan: 'custom', customModules },
    });
    expect(renewal.json().amount).toBe(999_000);
  });
});
