import { z } from 'zod';

export const PAYMENT_METHOD_CATEGORIES = [
  'CASH',
  'QRIS',
  'BANK_TRANSFER',
  'MARKETPLACE',
  'OTHER',
] as const;

const optionalAccountId = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((value) => value || undefined);

export const paymentMethodSchema = z.object({
  code: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(
      z
        .string()
        .min(2, 'Kode metode pembayaran minimal 2 karakter.')
        .max(30, 'Kode metode pembayaran maksimal 30 karakter.')
        .regex(/^[A-Z0-9_-]+$/, 'Kode hanya boleh berisi huruf, angka, underscore, dan dash.'),
    ),
  name: z
    .string()
    .trim()
    .min(1, 'Nama metode pembayaran wajib diisi.')
    .max(80, 'Nama metode pembayaran maksimal 80 karakter.'),
  category: z.enum(PAYMENT_METHOD_CATEGORIES),
  posting_account_id: optionalAccountId,
  requires_reference: z.boolean().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.coerce.number().int().min(0).max(999).optional(),
}).superRefine((value, context) => {
  if ((value.is_active ?? true) && !value.posting_account_id) {
    context.addIssue({
      code: 'custom',
      path: ['posting_account_id'],
      message: 'Akun penerimaan/clearing wajib dipilih untuk metode aktif.',
    });
  }
});

export type PaymentMethodFormData = z.infer<typeof paymentMethodSchema>;
