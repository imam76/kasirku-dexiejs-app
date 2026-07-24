import { z } from 'zod';
import type {
  CooperativeSavingTransactionType,
  CooperativeSavingType,
  CooperativeSavingWithdrawalSource,
  PaymentMethod,
} from '@/types';

export const cooperativeSavingTypeValues = ['POKOK', 'WAJIB', 'SUKARELA'] as const satisfies readonly CooperativeSavingType[];
export const cooperativeSavingTransactionTypeValues = ['DEPOSIT', 'WITHDRAWAL'] as const satisfies readonly CooperativeSavingTransactionType[];
export const cooperativeSavingWithdrawalSourceValues = ['SAVING', 'INTEREST'] as const satisfies readonly CooperativeSavingWithdrawalSource[];
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
  withdrawal_source: z.enum(cooperativeSavingWithdrawalSourceValues).optional(),
  amount: z.coerce.number().positive('Nominal simpanan harus lebih dari 0.'),
  transaction_date: z.string().trim().optional(),
  payment_method: z.enum(cooperativeSavingPaymentMethodValues).optional(),
  cash_account_id: optionalTrimmedString,
  payment_channel: optionalTrimmedString,
  notes: optionalTrimmedString,
});

export const cooperativeSavingOpeningBalanceSchema = z.object({
  member_id: z.string().trim().min(1, 'Anggota wajib dipilih.'),
  saving_type: z.enum(cooperativeSavingTypeValues, { message: 'Jenis simpanan wajib dipilih.' }),
  amount: z.coerce.number().nonnegative('Saldo simpanan terkini tidak boleh negatif.'),
  opening_interest_amount: z.coerce.number().nonnegative('Akumulasi jasa tidak boleh negatif.').default(0),
  transaction_date: z.string().trim().min(1, 'Tanggal saldo awal wajib diisi.'),
  notes: optionalTrimmedString,
}).superRefine((value, context) => {
  if (value.amount <= 0 && value.opening_interest_amount <= 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['amount'],
      message: 'Saldo simpanan atau akumulasi jasa harus lebih dari 0.',
    });
  }

  if (value.saving_type === 'WAJIB' && value.opening_interest_amount > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['opening_interest_amount'],
      message: 'Akumulasi jasa hanya berlaku untuk simpanan pokok dan sukarela.',
    });
  }
});

export const cooperativeSavingReversalSchema = z.object({
  reason: z.string().trim().min(1, 'Alasan reversal wajib diisi.'),
});

export type CooperativeSavingTransactionFormData = z.infer<typeof cooperativeSavingTransactionSchema>;
export type CooperativeSavingOpeningBalanceFormData = z.infer<typeof cooperativeSavingOpeningBalanceSchema>;
export type CooperativeSavingReversalFormData = z.infer<typeof cooperativeSavingReversalSchema>;
