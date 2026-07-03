import { z } from 'zod';

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((value) => value || undefined);

export const cashBankTransferSchema = z.object({
  from_cash_account_id: z.string().min(1, 'Akun sumber wajib dipilih.'),
  to_cash_account_id: z.string().min(1, 'Akun tujuan wajib dipilih.'),
  amount: z.number({ message: 'Jumlah transfer wajib diisi.' }).min(1, 'Jumlah transfer harus lebih dari 0.'),
  transfer_date: optionalTrimmedString,
  payment_channel: optionalTrimmedString,
  reference_id: optionalTrimmedString,
  notes: optionalTrimmedString,
}).refine((value) => value.from_cash_account_id !== value.to_cash_account_id, {
  path: ['to_cash_account_id'],
  message: 'Akun tujuan harus berbeda dari akun sumber.',
});

export type CashBankTransferFormValues = z.input<typeof cashBankTransferSchema>;
export type CashBankTransferFormData = z.infer<typeof cashBankTransferSchema>;
