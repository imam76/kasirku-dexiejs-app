import { z } from 'zod';

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((value) => value || undefined);

export const cashBankReconciliationSchema = z.object({
  cash_account_id: z.string().min(1, 'Akun kas/bank wajib dipilih.'),
  statement_date: z.string().min(1, 'Tanggal statement wajib diisi.'),
  statement_reference: optionalTrimmedString,
  statement_ending_balance: z.number({ message: 'Saldo akhir statement wajib diisi.' }),
  selected_transaction_ids: z.array(z.string()).min(1, 'Minimal pilih 1 transaksi untuk direkonsiliasi.'),
  adjustment_account_id: optionalTrimmedString,
  notes: optionalTrimmedString,
});

export type CashBankReconciliationFormValues = z.input<typeof cashBankReconciliationSchema>;
export type CashBankReconciliationFormData = z.infer<typeof cashBankReconciliationSchema>;
