import { z } from 'zod';
import type {
  CooperativeLoanBillingFrequency,
  CooperativeLoanDeductionMethod,
  CooperativeLoanInterestCalculationType,
  CooperativeLoanStatus,
  PaymentMethod,
} from '@/types';

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
export const cooperativeLoanInterestCalculationTypeValues = [
  'MONTHLY_RATE',
  'TOTAL_PERCENT',
] as const satisfies readonly CooperativeLoanInterestCalculationType[];
export const cooperativeLoanBillingFrequencyValues = [
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
] as const satisfies readonly CooperativeLoanBillingFrequency[];
export const cooperativeLoanDeductionMethodValues = [
  'NONE',
  'DEDUCT_ON_DISBURSEMENT',
] as const satisfies readonly CooperativeLoanDeductionMethod[];

export const cooperativeLoanApplicationSchema = z.object({
  member_id: z.string().min(1, 'Anggota wajib dipilih.'),
  principal_amount: z.number().positive('Pokok pinjaman wajib lebih dari 0.'),
  interest_calculation_type: z.enum(cooperativeLoanInterestCalculationTypeValues).default('MONTHLY_RATE'),
  interest_rate_per_month: z.number().optional(),
  tenor_months: z.number().int().optional(),
  billing_frequency: z.enum(cooperativeLoanBillingFrequencyValues).optional(),
  installment_count: z.number().int().optional(),
  loan_service_rate: z.number().optional(),
  admin_fee_rate: z.number().optional(),
  mandatory_saving_rate: z.number().optional(),
  deduction_method: z.enum(cooperativeLoanDeductionMethodValues).optional(),
  application_date: z.string().optional(),
  notes: z.string().optional(),
}).superRefine((value, context) => {
  if (value.interest_calculation_type === 'MONTHLY_RATE') {
    if (value.interest_rate_per_month === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['interest_rate_per_month'],
        message: 'Bunga per bulan wajib diisi.',
      });
    } else if (value.interest_rate_per_month < 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['interest_rate_per_month'],
        message: 'Bunga per bulan tidak boleh negatif.',
      });
    }
    if (value.tenor_months === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tenor_months'],
        message: 'Tenor wajib diisi.',
      });
    } else if (value.tenor_months < 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tenor_months'],
        message: 'Tenor minimal 1 bulan.',
      });
    }
    return;
  }

  if (value.loan_service_rate === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['loan_service_rate'],
      message: 'Jasa pinjaman total wajib diisi.',
    });
  } else if (value.loan_service_rate < 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['loan_service_rate'],
      message: 'Jasa pinjaman tidak boleh negatif.',
    });
  }
  if (value.admin_fee_rate === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['admin_fee_rate'],
      message: 'Biaya administrasi wajib diisi.',
    });
  } else if (value.admin_fee_rate < 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['admin_fee_rate'],
      message: 'Biaya administrasi tidak boleh negatif.',
    });
  }
  if (value.mandatory_saving_rate === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['mandatory_saving_rate'],
      message: 'Simpanan wajib wajib diisi.',
    });
  } else if (value.mandatory_saving_rate < 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['mandatory_saving_rate'],
      message: 'Simpanan wajib tidak boleh negatif.',
    });
  }
  if (value.installment_count === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['installment_count'],
      message: 'Jumlah angsuran wajib diisi.',
    });
  } else if (value.installment_count < 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['installment_count'],
      message: 'Jumlah angsuran minimal 1.',
    });
  }
  if (!value.billing_frequency) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['billing_frequency'],
      message: 'Frekuensi penagihan wajib dipilih.',
    });
  }

  const totalDeductionRate = Number(value.admin_fee_rate || 0) + Number(value.mandatory_saving_rate || 0);
  if (totalDeductionRate > 100) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['mandatory_saving_rate'],
      message: 'Total biaya administrasi dan simpanan wajib tidak boleh lebih dari 100%.',
    });
  }
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

export const cooperativeLoanInstallmentCollectionStatusValues = [
  'PROMISED_TO_PAY',
  'UNABLE_TO_PAY',
  'FOLLOW_UP',
] as const;

export const cooperativeLoanInstallmentCollectionSchema = z.object({
  installment_id: z.string().min(1, 'Angsuran wajib dipilih.'),
  collection_status: z.enum(cooperativeLoanInstallmentCollectionStatusValues),
  follow_up_date: z.string().optional(),
  collection_notes: z.string().trim().min(3, 'Catatan tindak lanjut wajib diisi.'),
}).superRefine((value, context) => {
  if (value.collection_status !== 'UNABLE_TO_PAY' && !value.follow_up_date) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['follow_up_date'],
      message: 'Tanggal follow-up wajib diisi.',
    });
  }
});

export const cooperativeLoanPaymentReversalSchema = z.object({
  reason: z.string().trim().min(3, 'Alasan reversal wajib diisi.'),
});

export type CooperativeLoanApplicationFormData = z.infer<typeof cooperativeLoanApplicationSchema>;
export type CooperativeLoanApprovalFormData = z.infer<typeof cooperativeLoanApprovalSchema>;
export type CooperativeLoanRejectionFormData = z.infer<typeof cooperativeLoanRejectionSchema>;
export type CooperativeLoanDisbursementFormData = z.infer<typeof cooperativeLoanDisbursementSchema>;
export type CooperativeLoanPaymentFormData = z.infer<typeof cooperativeLoanPaymentSchema>;
export type CooperativeLoanInstallmentCollectionFormData = z.infer<typeof cooperativeLoanInstallmentCollectionSchema>;
export type CooperativeLoanPaymentReversalFormData = z.infer<typeof cooperativeLoanPaymentReversalSchema>;
