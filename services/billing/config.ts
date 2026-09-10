import { z } from 'zod';

const postgresUrl = z.string().regex(/^postgres(?:ql)?:\/\//);
const schema = z.object({
  BILLING_HOST: z.string().default('127.0.0.1'),
  BILLING_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  BILLING_DATABASE_URL: postgresUrl,
  LEADS_DATABASE_URL: postgresUrl,
  BILLING_DATABASE_SCHEMA: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,62}$/)
    .default('public'),
  LEADS_DATABASE_SCHEMA: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,62}$/)
    .default('public'),
  BILLING_ALLOWED_ORIGINS: z
    .string()
    .default(
      'http://localhost:1420,http://127.0.0.1:1420,http://127.0.0.1:5173,tauri://localhost,http://tauri.localhost,https://tauri.localhost',
    ),
  MIDTRANS_ENVIRONMENT: z.literal('sandbox').default('sandbox'),
  MIDTRANS_MERCHANT_ID: z.string().min(1),
  MIDTRANS_SERVER_KEY: z.string().startsWith('Mid-server-'),
  MIDTRANS_CLIENT_KEY: z.string().startsWith('Mid-client-'),
  MIDTRANS_NOTIFICATION_URL: z
    .union([z.literal(''), z.url().startsWith('https://')])
    .default(''),
  MIDTRANS_FINISH_URL: z.url().default('http://localhost:8787/payment/finish'),
  BILLING_TAX_BPS: z.coerce.number().int().min(0).max(10000).default(0),
});
export type BillingConfig = z.infer<typeof schema>;
export function readConfig(env = process.env): BillingConfig {
  const sharedDatabaseUrl = env.SUPABASE_DB_URL?.trim();
  const parsed = schema.safeParse({
    ...env,
    BILLING_DATABASE_URL:
      env.BILLING_DATABASE_URL?.trim() || sharedDatabaseUrl,
    LEADS_DATABASE_URL: env.LEADS_DATABASE_URL?.trim() || sharedDatabaseUrl,
    BILLING_DATABASE_SCHEMA:
      env.BILLING_DATABASE_SCHEMA?.trim() ||
      (sharedDatabaseUrl ? 'billing_private' : undefined),
    LEADS_DATABASE_SCHEMA:
      env.LEADS_DATABASE_SCHEMA?.trim() ||
      (sharedDatabaseUrl ? 'leads_private' : undefined),
  });
  if (!parsed.success)
    throw new Error(
      `Konfigurasi billing belum valid: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    );
  const billingUrl = new URL(parsed.data.BILLING_DATABASE_URL);
  const leadsUrl = new URL(parsed.data.LEADS_DATABASE_URL);
  const sameDatabase =
    billingUrl.hostname === leadsUrl.hostname &&
    billingUrl.port === leadsUrl.port &&
    billingUrl.pathname === leadsUrl.pathname;
  if (
    sameDatabase &&
    parsed.data.BILLING_DATABASE_SCHEMA === parsed.data.LEADS_DATABASE_SCHEMA
  )
    throw new Error('Database atau schema billing dan leads harus terpisah.');
  if (
    sharedDatabaseUrl &&
    (parsed.data.BILLING_DATABASE_SCHEMA !== 'billing_private' ||
      parsed.data.LEADS_DATABASE_SCHEMA !== 'leads_private')
  )
    throw new Error(
      'Supabase billing hanya boleh memakai schema billing_private dan leads_private.',
    );
  return parsed.data;
}
