import { z } from 'zod';

const schema = z.object({
  BILLING_HOST: z.string().default('127.0.0.1'),
  BILLING_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  BILLING_DATABASE_URL: z.string().startsWith('postgresql://'),
  LEADS_DATABASE_URL: z.string().startsWith('postgresql://'),
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
  const parsed = schema.safeParse(env);
  if (!parsed.success)
    throw new Error(
      `Konfigurasi billing belum valid: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    );
  if (
    new URL(parsed.data.BILLING_DATABASE_URL).pathname ===
    new URL(parsed.data.LEADS_DATABASE_URL).pathname
  ) {
    throw new Error('Database billing dan leads harus terpisah.');
  }
  return parsed.data;
}
