import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { BillingConfig } from './config.ts';

export const hashSecret = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const notificationSchema = z.object({
  order_id: z.string().min(1).max(100),
  status_code: z.string(),
  gross_amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  signature_key: z.string().regex(/^[a-fA-F0-9]{128}$/),
});
export const statusSchema = z.object({
  order_id: z.string(),
  status_code: z.string(),
  gross_amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  merchant_id: z.string(),
  transaction_status: z.string(),
  fraud_status: z.string().optional(),
  payment_type: z.string(),
  currency: z.literal('IDR').optional(),
});
export type MidtransStatus = z.infer<typeof statusSchema>;
export function verifySignature(
  body: z.infer<typeof notificationSchema>,
  key: string,
) {
  const expected = createHash('sha512')
    .update(body.order_id + body.status_code + body.gross_amount + key)
    .digest();
  const received = Buffer.from(body.signature_key, 'hex');
  return (
    received.length === expected.length && timingSafeEqual(expected, received)
  );
}
export const isPaid = (status: MidtransStatus) =>
  status.status_code === '200' &&
  (!status.fraud_status || status.fraud_status === 'accept') &&
  (status.transaction_status === 'settlement' ||
    (status.transaction_status === 'capture' &&
      status.payment_type === 'credit_card' &&
      status.fraud_status === 'accept'));

export function createMidtrans(config: BillingConfig, request = fetch) {
  async function api(url: string, init?: RequestInit) {
    const response = await request(url, {
      ...init,
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${config.MIDTRANS_SERVER_KEY}:`).toString('base64')}`,
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok)
      throw Object.assign(
        new Error(
          'Midtrans sementara tidak tersedia. Periksa status sebelum mencoba lagi.',
        ),
        { statusCode: 502 },
      );
    return response.json();
  }
  return {
    async checkout(payload: unknown): Promise<string> {
      const body = await api(
        'https://app.sandbox.midtrans.com/snap/v1/transactions',
        {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: config.MIDTRANS_NOTIFICATION_URL
            ? { 'X-Override-Notification': config.MIDTRANS_NOTIFICATION_URL }
            : {},
        },
      );
      const result = z.object({ redirect_url: z.url() }).parse(body);
      const url = new URL(result.redirect_url);
      if (url.origin !== 'https://app.sandbox.midtrans.com')
        throw new Error('URL checkout Midtrans tidak valid.');
      return result.redirect_url;
    },
    async status(orderId: string) {
      return statusSchema.parse(
        await api(
          `https://api.sandbox.midtrans.com/v2/${encodeURIComponent(orderId)}/status`,
        ),
      );
    },
  };
}
export type Midtrans = ReturnType<typeof createMidtrans>;
