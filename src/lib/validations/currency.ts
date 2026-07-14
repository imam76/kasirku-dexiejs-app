import { z } from 'zod';
import { BASE_CURRENCY_CODE } from '@/constants/currencies';

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((value) => value || undefined);

export const currencySchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Kode mata uang harus 3 huruf ISO, contoh USD.'),
  name: z.string().trim().min(1, 'Nama mata uang wajib diisi.'),
  symbol: optionalTrimmedString,
  decimal_places: z.coerce.number().int().min(0).max(8).default(2),
  is_active: z.boolean().optional(),
});

export const currencyRateSchema = z.object({
  currency_code: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  base_currency_code: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default(BASE_CURRENCY_CODE),
  rate_date: z.string().trim().min(1),
  unit_amount: z.coerce.number().positive(),
  bi_buy_rate: z.coerce.number().positive().optional(),
  bi_sell_rate: z.coerce.number().positive().optional(),
  middle_rate: z.coerce.number().positive(),
});

export type CurrencyFormData = z.infer<typeof currencySchema>;
export type CurrencyRateFormData = z.infer<typeof currencyRateSchema>;
