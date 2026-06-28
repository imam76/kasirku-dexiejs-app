import { z } from 'zod';
import type { PaymentMethod } from '@/types';

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((value) => value || undefined);

const currencyAmount = z
  .number({ message: 'Nominal wajib diisi.' })
  .min(0, 'Nominal tidak boleh negatif.')
  .default(0);

export const payrollRunItemSchema = z.object({
  id: optionalTrimmedString,
  employee_id: z.string().trim().min(1, 'Karyawan wajib dipilih.'),
  base_salary: currencyAmount,
  allowance_amount: currencyAmount,
  bonus_amount: currencyAmount,
  other_deduction_amount: currencyAmount.optional(),
  deduction_amount: currencyAmount.optional(),
  notes: optionalTrimmedString,
}).refine((value) => (
  value.base_salary + value.allowance_amount + value.bonus_amount - (value.other_deduction_amount ?? value.deduction_amount ?? 0) >= 0
), {
  path: ['other_deduction_amount'],
  message: 'Potongan tidak boleh melebihi total penghasilan.',
});

export const payrollRunSchema = z.object({
  period_start: z.string().trim().min(1, 'Tanggal awal periode wajib diisi.'),
  period_end: z.string().trim().min(1, 'Tanggal akhir periode wajib diisi.'),
  notes: optionalTrimmedString,
  items: z.array(payrollRunItemSchema).min(1, 'Minimal satu karyawan harus masuk payroll.'),
}).refine((value) => value.period_start.slice(0, 10) <= value.period_end.slice(0, 10), {
  path: ['period_end'],
  message: 'Tanggal akhir periode tidak boleh sebelum tanggal awal.',
});

export const payrollPaymentSchema = z.object({
  paid_at: optionalTrimmedString,
  payment_method: z.enum(['TUNAI', 'NON_TUNAI']).default('TUNAI') as z.ZodType<PaymentMethod>,
  payment_channel: optionalTrimmedString,
  cash_account_id: z.string().trim().min(1, 'Akun kas/bank wajib dipilih.'),
});

export type PayrollRunFormData = z.infer<typeof payrollRunSchema>;
export type PayrollPaymentFormData = z.infer<typeof payrollPaymentSchema>;
