import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'node:crypto';
import { z, ZodError } from 'zod';
import type { PoolClient } from 'pg';
import {
  getPlan,
  getPlanModules,
  PLAN_NAMES,
} from '../../src/onboarding/catalog.ts';
import {
  addBillingMonth,
  checkoutSchema,
  consentSchema,
  registerBillingSchema,
  type Access,
} from '../../src/onboarding/contract.ts';
import {
  TERMS_TEXT,
  TERMS_VERSION,
  PRIVACY_TEXT,
  PRIVACY_VERSION,
} from '../../src/onboarding/legal.ts';
import type { BillingConfig } from './config.ts';
import type { Databases } from './db.ts';
import {
  hashSecret,
  isPaid,
  notificationSchema,
  verifySignature,
  type Midtrans,
  type MidtransStatus,
} from './midtrans.ts';

const fail = (statusCode: number, message: string): never => {
  throw Object.assign(new Error(message), { statusCode });
};
type Business = {
  id: string;
  registration: {
    owner: string;
    business: string;
    whatsapp: string;
    email?: string;
  };
  access: Access;
  custom_setup_paid: boolean;
};
type Order = {
  order_id: string;
  business_id: string;
  plan: Access['plan'];
  modules: string[];
  amount: number;
  setup_amount: number;
  status: string;
  redirect_url: string | null;
  activated_at: Date | null;
};

export function buildApp(
  config: BillingConfig,
  db: Databases,
  midtrans: Midtrans,
) {
  const app = Fastify({
    bodyLimit: 32_768,
    logger: {
      level: 'info',
      redact: [
        'req.headers.authorization',
        'req.headers.apikey',
        'req.body',
        'res.headers',
      ],
    },
  });
  app.register(cors, {
    origin: config.BILLING_ALLOWED_ORIGINS.split(',').map((s) => s.trim()),
    methods: ['GET', 'POST', 'PATCH'],
  });
  app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  app.setErrorHandler((error, _request, reply) => {
    const err = error as Error & { statusCode?: number };
    const status = error instanceof ZodError ? 400 : (err.statusCode ?? 500);
    reply.status(status).send({
      error:
        error instanceof ZodError
          ? 'Data permintaan tidak valid.'
          : status >= 500
            ? 'Layanan billing sementara tidak tersedia. Coba lagi.'
            : err.message,
    });
  });
  async function transaction<T>(work: (client: PoolClient) => Promise<T>) {
    const client = await db.billing.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async function authenticate(authorization?: string): Promise<Business> {
    const token = authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!token)
      return fail(401, 'Hubungkan identitas langganan terlebih dahulu.');
    const result = await db.billing.query<Business>(
      'SELECT b.* FROM businesses b JOIN access_tokens t ON t.business_id=b.id WHERE t.token_hash=$1',
      [hashSecret(token)],
    );
    return (
      result.rows[0] ??
      fail(401, 'Akses billing tidak valid. Gunakan kode pemulihan.')
    );
  }
  function validateConsent(consent: z.infer<typeof consentSchema>) {
    if (
      consent.termsVersion !== TERMS_VERSION ||
      consent.privacyVersion !== PRIVACY_VERSION ||
      consent.termsHash !== hashSecret(TERMS_TEXT) ||
      consent.privacyHash !== hashSecret(PRIVACY_TEXT)
    )
      fail(400, 'Versi persetujuan tidak sesuai. Perbarui aplikasi.');
    if (
      Date.parse(consent.acceptedAt) > Date.now() + 300_000 ||
      Date.parse(consent.marketingUpdatedAt) > Date.now() + 300_000
    )
      fail(400, 'Waktu persetujuan tidak valid.');
  }
  async function saveLead(
    businessId: string,
    registration: unknown,
    consent: z.infer<typeof consentSchema>,
  ) {
    // Separate database, retryable by the authenticated registration endpoint.
    await db.leads.query(
      `INSERT INTO leads (business_id,registration,consent) VALUES ($1,$2,$3)
      ON CONFLICT (business_id) DO UPDATE SET consent=EXCLUDED.consent,updated_at=now()
      WHERE (leads.consent->>'marketingUpdatedAt')::timestamptz <= (EXCLUDED.consent->>'marketingUpdatedAt')::timestamptz`,
      [businessId, registration, consent],
    );
    await db.leads.query(
      'INSERT INTO consent_events (business_id,consent) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [businessId, consent],
    );
  }
  app.get('/health', async () => {
    await Promise.all([
      db.billing.query('SELECT 1'),
      db.leads.query('SELECT 1'),
    ]);
    return { status: 'ok', environment: 'sandbox' };
  });
  app.get('/payment/finish', async (_request, reply) =>
    reply
      .type('text/plain; charset=utf-8')
      .send(
        'Kembali ke Frayukti\n\nBuka aplikasi lalu pilih Periksa status. Akses aktif setelah pembayaran terverifikasi. Halaman ini tidak mengonfirmasi pembayaran.',
      ),
  );
  app.post(
    '/v1/registrations',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request) => {
      const input = registerBillingSchema.parse(request.body);
      validateConsent(input.consent);
      if (Date.parse(input.access.start) > Date.now() + 300_000)
        fail(400, 'Waktu trial tidak valid.');
      const business = await transaction(async (client) => {
        const id = randomUUID();
        const result = await client.query<Business>(
          `INSERT INTO businesses (id,installation_id,registration,recovery_hash,access)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT (installation_id) DO NOTHING RETURNING *`,
          [
            id,
            input.installationId,
            input.registration,
            hashSecret(input.recoveryCode),
            input.access,
          ],
        );
        if (result.rows[0]) {
          await client.query(
            'INSERT INTO access_tokens (token_hash,business_id) VALUES ($1,$2)',
            [hashSecret(input.token), id],
          );
          return result.rows[0];
        }
        const existing = await client.query<Business>(
          `SELECT b.* FROM businesses b JOIN access_tokens t ON b.id=t.business_id
        WHERE b.installation_id=$1 AND t.token_hash=$2`,
          [input.installationId, hashSecret(input.token)],
        );
        return (
          existing.rows[0] ??
          fail(409, 'Instalasi sudah terdaftar. Gunakan pemulihan.')
        );
      });
      await saveLead(business.id, business.registration, input.consent);
      return { businessId: business.id };
    },
  );
  app.get('/v1/consent', async (request) => {
    const business = await authenticate(request.headers.authorization);
    const result = await db.leads.query(
      'SELECT consent FROM leads WHERE business_id=$1',
      [business.id],
    );
    return (
      result.rows[0] ??
      fail(
        409,
        'Persetujuan belum tersinkron. Buka instalasi asal untuk mencoba lagi.',
      )
    );
  });
  app.patch('/v1/consent', async (request) => {
    const business = await authenticate(request.headers.authorization);
    const consent = consentSchema.parse(request.body);
    validateConsent(consent);
    await saveLead(business.id, business.registration, consent);
    return { saved: true };
  });
  app.post(
    '/v1/recovery',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request) => {
      const input = z
        .object({
          recoveryCode: z.string().regex(/^[a-f0-9]{64}$/),
          token: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict()
        .parse(request.body);
      const businessId = await transaction(async (client) => {
        const result = await client.query<Business>(
          'SELECT * FROM businesses WHERE recovery_hash=$1 FOR UPDATE',
          [hashSecret(input.recoveryCode)],
        );
        const business =
          result.rows[0] ?? fail(401, 'Kode pemulihan tidak valid.');
        await client.query(
          'INSERT INTO access_tokens (token_hash,business_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [hashSecret(input.token), business.id],
        );
        await client.query(
          'INSERT INTO recovery_events (id,business_id) VALUES ($1,$2)',
          [randomUUID(), business.id],
        );
        return business.id;
      });
      return { businessId };
    },
  );
  app.get('/v1/status', async (request) => {
    let business = await authenticate(request.headers.authorization);
    let paymentCheck: 'verified' | 'waiting' | 'unavailable' = 'verified';
    const pending = await db.billing.query<{ order_id: string }>(
      "SELECT order_id FROM orders WHERE business_id=$1 AND status IN ('creating','pending') ORDER BY created_at DESC LIMIT 1",
      [business.id],
    );
    if (pending.rows[0]) {
      try {
        paymentCheck = (await reconcileOrder(pending.rows[0].order_id))
          ? 'verified'
          : 'waiting';
        business = await authenticate(request.headers.authorization);
      } catch {
        // Provider outages must not prevent reading already issued/offline access.
        paymentCheck = 'unavailable';
      }
    }
    const orders = await db.billing.query(
      `SELECT order_id AS "orderId",plan,amount,status,created_at AS "createdAt",
      access_start AS "accessStart",access_end AS "accessEnd",redirect_url AS "redirectUrl"
      FROM orders WHERE business_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [business.id],
    );
    return {
      paymentCheck,
      businessId: business.id,
      registration: business.registration,
      access: business.access,
      orders: orders.rows,
    };
  });
  app.post(
    '/v1/checkouts',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request) => {
      const business = await authenticate(request.headers.authorization);
      const input = checkoutSchema.parse(request.body);
      const plan = getPlan(input.plan);
      if (
        input.plan === 'custom' &&
        (!input.customModules.length ||
          input.customModules.some((code) => !plan.modules.includes(code)))
      )
        fail(400, 'Pilih modul Custom dari katalog yang tersedia.');
      const order = await transaction(async (client) => {
        const locked = (
          await client.query<Business>(
            'SELECT * FROM businesses WHERE id=$1 FOR UPDATE',
            [business.id],
          )
        ).rows[0];
        const previous = (
          await client.query<Order>(
            'SELECT * FROM orders WHERE business_id=$1 AND request_id=$2',
            [business.id, input.requestId],
          )
        ).rows[0];
        if (previous) return { ...previous, existing: true };
        // Do not make a new order while an earlier checkout is unresolved, even after its local expiry.
        const pending = (
          await client.query<Order>(
            "SELECT * FROM orders WHERE business_id=$1 AND status IN ('creating','pending')",
            [business.id],
          )
        ).rows[0];
        if (pending) return { ...pending, existing: true };
        const modules = getPlanModules(input.plan, input.customModules);
        if (
          locked.access.kind === 'subscription' &&
          Date.parse(locked.access.end) > Date.now() &&
          (input.plan !== locked.access.plan ||
            modules.slice().sort().join() !==
              locked.access.modules.slice().sort().join())
        )
          fail(
            409,
            'Ubah paket/modul setelah masa akses berbayar saat ini berakhir.',
          );
        const setup = locked.custom_setup_paid ? 0 : plan.setupPrice;
        const tax = Math.round(
          ((plan.monthlyPrice + setup) * config.BILLING_TAX_BPS) / 10_000,
        );
        const amount = plan.monthlyPrice + setup + tax;
        return {
          ...(
            await client.query<Order>(
              `INSERT INTO orders (order_id,business_id,request_id,plan,modules,amount,setup_amount,tax_amount,expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '1 hour') RETURNING *`,
              [
                `FRY-${randomUUID()}`,
                business.id,
                input.requestId,
                input.plan,
                JSON.stringify(modules),
                amount,
                setup,
                tax,
              ],
            )
          ).rows[0],
          existing: false,
        };
      });
      // Keep the persisted order across failures, and serialize Snap creation across
      // processes. A crashed process releases this lock so a later request can retry.
      const result = await transaction(async (client) => {
        const current = (
          await client.query<Order>(
            'SELECT * FROM orders WHERE order_id=$1 FOR UPDATE',
            [order.order_id],
          )
        ).rows[0];
        if (!['creating', 'pending'].includes(current.status))
          return fail(
            409,
            'Order sudah selesai. Periksa status sebelum membuat pembayaran berikutnya.',
          );
        if (current.redirect_url)
          return {
            orderId: current.order_id,
            redirectUrl: current.redirect_url,
            amount: current.amount,
          };
        if (order.existing) {
          const status = await midtrans.status(current.order_id);
          if (status) {
            if (status.order_id !== current.order_id)
              return fail(400, 'Status Midtrans tidak sesuai dengan order yang diperiksa.');
            // Apply after releasing the order lock; notification processing also locks it.
            return { status };
          }
          // A 404 does not prove Snap never created a token. Reuse the SAME order ID:
          // Midtrans replaces an unselected token and rejects an already-used order ID.
          // https://docs.midtrans.com/docs/snap-advanced-feature
        }
        const redirectUrl = await midtrans.checkout({
          transaction_details: {
            order_id: current.order_id,
            gross_amount: current.amount,
          },
          item_details: [
            {
              id: current.plan,
              name: `Frayukti ${PLAN_NAMES[current.plan]}`.slice(0, 50),
              price: current.amount,
              quantity: 1,
            },
          ],
          customer_details: {
            first_name: business.registration.owner,
            phone: business.registration.whatsapp,
            ...(business.registration.email
              ? { email: business.registration.email }
              : {}),
          },
          callbacks: { finish: config.MIDTRANS_FINISH_URL },
          credit_card: { secure: true },
          expiry: { unit: 'minutes', duration: 60 },
        });
        await client.query(
          "UPDATE orders SET redirect_url=$2,status=CASE WHEN status='creating' THEN 'pending' ELSE status END WHERE order_id=$1",
          [current.order_id, redirectUrl],
        );
        return { orderId: current.order_id, redirectUrl, amount: current.amount };
      });
      if (result.status) {
        await applyNotification(result.status);
        return fail(409, 'Status pembayaran sudah diperbarui. Periksa status untuk melanjutkan.');
      }
      return result;
    },
  );
  async function applyNotification(status: MidtransStatus) {
    await transaction(async (client) => {
      const order =
        (
          await client.query<Order>(
            'SELECT * FROM orders WHERE order_id=$1 FOR UPDATE',
            [status.order_id],
          )
        ).rows[0] ?? fail(404, 'Order tidak ditemukan.');
      if (
        status.merchant_id !== config.MIDTRANS_MERCHANT_ID ||
        Number(status.gross_amount) !== order.amount
      )
        fail(400, 'Merchant atau nominal tidak sesuai.');
      const eventHash = hashSecret(JSON.stringify(status));
      await client.query(
        'INSERT INTO webhook_events (event_hash,order_id,status,payment_type) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [
          eventHash,
          status.order_id,
          status.transaction_status,
          status.payment_type,
        ],
      );
      if (order.activated_at) {
        if (
          [
            'refund',
            'partial_refund',
            'chargeback',
            'partial_chargeback',
            'cancel',
          ].includes(status.transaction_status)
        ) {
          await client.query(
            "UPDATE orders SET status='review_required' WHERE order_id=$1",
            [order.order_id],
          );
        }
        return; // Includes duplicate settlement/capture and stale pending. Never extend twice.
      }
      if (!isPaid(status)) {
        await client.query('UPDATE orders SET status=$2 WHERE order_id=$1', [
          order.order_id,
          ['capture', 'authorize'].includes(status.transaction_status)
            ? 'pending'
            : status.transaction_status,
        ]);
        return;
      }
      const business = (
        await client.query<Business>(
          'SELECT * FROM businesses WHERE id=$1 FOR UPDATE',
          [order.business_id],
        )
      ).rows[0];
      const now = new Date().toISOString();
      const start =
        business.access.kind === 'subscription' &&
        Date.parse(business.access.end) > Date.now()
          ? business.access.end
          : now;
      const end = addBillingMonth(start);
      const access: Access = {
        kind: 'subscription',
        plan: order.plan,
        modules: order.modules,
        start:
          business.access.kind === 'subscription' &&
          start === business.access.end
            ? business.access.start
            : start,
        end,
      };
      await client.query(
        'UPDATE businesses SET access=$2, custom_setup_paid=custom_setup_paid OR $3, first_paid_at=COALESCE(first_paid_at,now()) WHERE id=$1',
        [business.id, access, order.setup_amount > 0],
      );
      await client.query(
        "UPDATE orders SET status='paid',activated_at=now(),access_start=$2,access_end=$3 WHERE order_id=$1",
        [order.order_id, start, end],
      );
    });
  }
  async function reconcileOrder(orderId: string) {
    const status = await midtrans.status(orderId);
    if (!status) return false;
    if (status.order_id !== orderId)
      fail(400, 'Status Midtrans tidak sesuai dengan order yang diperiksa.');
    // Same merchant, amount, fraud and idempotency checks as the webhook path.
    await applyNotification(status);
    return true;
  }
  app.post(
    '/v1/midtrans/notifications',
    { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } },
    async (request) => {
      const notification = notificationSchema.parse(request.body);
      if (!verifySignature(notification, config.MIDTRANS_SERVER_KEY))
        fail(401, 'Signature tidak valid.');
      // Status/fraud fields are not covered by the signature. Read their authoritative values from Midtrans.
      const status = await midtrans.status(notification.order_id);
      if (!status) return fail(503, 'Status Midtrans belum tersedia.');
      if (
        status.order_id !== notification.order_id ||
        Number(status.gross_amount) !== Number(notification.gross_amount)
      )
        fail(400, 'Notifikasi tidak sesuai.');
      await applyNotification(status);
      return { received: true };
    },
  );
  return Object.assign(app, { reconcileOrder });
}
