import { z } from 'zod';
import type { CooperativeSavingTransactionType, CooperativeSavingType, PaymentMethod } from '@/types';

export const cooperativeSavingTypeValues = ['POKOK', 'WAJIB', 'SUKARELA'] as const satisfies readonly CooperativeSavingType[];
export const cooperativeSavingTransactionTypeValues = ['DEPOSIT', 'WITHDRAWAL'] as const satisfies readonly CooperativeSavingTransactionType[];
export const cooperativeSavingPaymentMethodValues = ['TUNAI', 'NON_TUNAI'] as const satisfies readonly PaymentMethod[];

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((value) => value || undefined);

export const cooperativeSavingTransactionSchema = z.object({
  member_id: z.string().trim().min(1, 'Anggota wajib dipilih.'),
  saving_type: z.enum(cooperativeSavingTypeValues, { message: 'Jenis simpanan wajib dipilih.' }),
  transaction_type: z.enum(cooperativeSavingTransactionTypeValues, { message: 'Jenis transaksi wajib dipilih.' }),
  amount: z.coerce.number().positive('Nominal simpanan harus lebih dari 0.'),
  transaction_date: z.string().trim().optional(),
  payment_method: z.enum(cooperativeSavingPaymentMethodValues).optional(),
  cash_account_id: optionalTrimmedString,
  payment_channel: optionalTrimmedString,
  notes: optionalTrimmedString,
});

export const cooperativeSavingReversalSchema = z.object({
  reason: z.string().trim().min(1, 'Alasan reversal wajib diisi.'),
});

export type CooperativeSavingTransactionFormData = z.infer<typeof cooperativeSavingTransactionSchema>;
export type CooperativeSavingReversalFormData = z.infer<typeof cooperativeSavingReversalSchema>;
