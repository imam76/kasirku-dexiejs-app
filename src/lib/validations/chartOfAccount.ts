import { z } from 'zod';
import type { AccountType } from '@/types';
import { getAccountNormalBalance } from '@/utils/chartOfAccounts/getAccountNormalBalance';

export const accountTypeValues = [
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'REVENUE',
  'CONTRA_REVENUE',
  'EXPENSE',
] as const satisfies readonly AccountType[];

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((value) => value || undefined);

export const chartOfAccountSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Kode akun wajib diisi.')
    .max(30, 'Kode akun maksimal 30 karakter.')
    .regex(/^[A-Za-z0-9._-]+$/, 'Kode akun hanya boleh berisi huruf, angka, titik, dash, atau underscore.'),
  name: z
    .string()
    .trim()
    .min(1, 'Nama akun wajib diisi.')
    .max(120, 'Nama akun maksimal 120 karakter.'),
  type: z.enum(accountTypeValues, { message: 'Tipe akun wajib dipilih.' }),
  parent_id: optionalTrimmedString,
  is_postable: z.boolean().optional(),
  is_active: z.boolean().optional(),
  description: optionalTrimmedString,
}).transform((value) => ({
  ...value,
  normal_balance: getAccountNormalBalance(value.type),
}));

export type ChartOfAccountFormData = z.infer<typeof chartOfAccountSchema>;

