import { z } from 'zod';
import type { CooperativeLoanStatus, PaymentMethod } from '@/types';

export const cooperativeLoanStatusValues = [
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'DISBURSED',
  'PAID_OFF',
  'REVERSED',
] as const satisfies readonly CooperativeLoanStatus[];

export const cooperativeLoanPaymentMethodValues = ['TUNAI', 'NON_TUNAI'] as const satisfies readonly PaymentMethod[];

export const cooperativeLoanApplicationSchema = z.object({
  member_id: z.string().min(1, 'Anggota wajib dipilih.'),
  principal_amount: z.number().positive('Pokok pinjaman wajib lebih dari 0.'),
  interest_rate_per_month: z.number().min(0, 'Bunga per bulan tidak boleh negatif.'),
  tenor_months: z.number().int().min(1, 'Tenor minimal 1 bulan.'),
  application_date: z.string().optional(),
  notes: z.string().optional(),
});

export const cooperativeLoanApprovalSchema = z.object({
  approval_date: z.string().optional(),
  notes: z.string().optional(),
});

export const cooperativeLoanRejectionSchema = z.object({
  reason: z.string().trim().min(3, 'Alasan reject wajib diisi.'),
});

export const cooperativeLoanDisbursementSchema = z.object({
  disbursement_date: z.string().optional(),
  first_due_date: z.string().optional(),
  payment_method: z.enum(cooperativeLoanPaymentMethodValues).optional(),
  cash_account_id: z.string().optional(),
  payment_channel: z.string().optional(),
  notes: z.string().optional(),
});

export const cooperativeLoanPaymentSchema = z.object({
  installment_id: z.string().min(1, 'Angsuran wajib dipilih.'),
  amount: z.number().positive('Nominal pembayaran wajib lebih dari 0.'),
  payment_date: z.string().optional(),
  payment_method: z.enum(cooperativeLoanPaymentMethodValues).optional(),
  cash_account_id: z.string().optional(),
  payment_channel: z.string().optional(),
  notes: z.string().optional(),
});

export const cooperativeLoanPaymentReversalSchema = z.object({
  reason: z.string().trim().min(3, 'Alasan reversal wajib diisi.'),
});

export type CooperativeLoanApplicationFormData = z.infer<typeof cooperativeLoanApplicationSchema>;
export type CooperativeLoanApprovalFormData = z.infer<typeof cooperativeLoanApprovalSchema>;
export type CooperativeLoanRejectionFormData = z.infer<typeof cooperativeLoanRejectionSchema>;
export type CooperativeLoanDisbursementFormData = z.infer<typeof cooperativeLoanDisbursementSchema>;
export type CooperativeLoanPaymentFormData = z.infer<typeof cooperativeLoanPaymentSchema>;
export type CooperativeLoanPaymentReversalFormData = z.infer<typeof cooperativeLoanPaymentReversalSchema>;
