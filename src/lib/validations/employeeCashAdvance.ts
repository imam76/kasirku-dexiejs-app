import { z } from 'zod';
import type { PaymentMethod } from '@/types';

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((value) => value || undefined);

const positiveCurrencyAmount = z
  .number({ message: 'Nominal wajib diisi.' })
  .positive('Nominal harus lebih dari 0.');

export const employeeCashAdvanceSchema = z.object({
  employee_id: z.string().trim().min(1, 'Karyawan wajib dipilih.'),
  amount: positiveCurrencyAmount,
  disbursed_at: optionalTrimmedString,
  payment_method: z.enum(['TUNAI', 'NON_TUNAI']).default('TUNAI') as z.ZodType<PaymentMethod>,
  payment_channel: optionalTrimmedString,
  cash_account_id: z.string().trim().min(1, 'Akun kas/bank wajib dipilih.'),
  notes: optionalTrimmedString,
});

export const employeeCashAdvanceVoidSchema = z.object({
  id: z.string().trim().min(1, 'Kasbon wajib dipilih.'),
  reason: z.string().trim().min(1, 'Alasan pembatalan wajib diisi.'),
});

export type EmployeeCashAdvanceFormData = z.infer<typeof employeeCashAdvanceSchema>;
export type EmployeeCashAdvanceVoidFormData = z.infer<typeof employeeCashAdvanceVoidSchema>;
