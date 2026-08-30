import { z } from 'zod';
import { isExpenseReportFinanceTransaction, isIncomeReportFinanceTransaction } from '@/constants/finance';
import type { BudgetPeriodType, BudgetTransactionType } from '@/types';

export const budgetPeriodTypeValues = ['MONTHLY', 'YEARLY'] as const satisfies readonly BudgetPeriodType[];
export const budgetTransactionTypeValues = ['EXPENSE', 'INCOME'] as const satisfies readonly BudgetTransactionType[];

const MONTHLY_PERIOD_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const YEARLY_PERIOD_KEY_PATTERN = /^\d{4}$/;

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((value) => value || undefined);

export const budgetSchema = z.object({
  name: z.string().trim().min(1, 'Nama anggaran wajib diisi.'),
  budget_type: z.enum(budgetTransactionTypeValues, { message: 'Tipe anggaran wajib dipilih.' }),
  category: z.string().trim().min(1, 'Kategori anggaran wajib dipilih.'),
  period_type: z.enum(budgetPeriodTypeValues, { message: 'Jenis periode wajib dipilih.' }),
  period_key: z.string().trim().min(1, 'Periode anggaran wajib diisi.'),
  planned_amount: z
    .number()
    .min(0, 'Nominal anggaran tidak boleh negatif.'),
  warning_threshold_percent: z
    .number()
    .min(0, 'Ambang batas peringatan tidak boleh negatif.')
    .max(1000, 'Ambang batas peringatan tidak valid.')
    .optional(),
  notes: optionalTrimmedString,
  is_active: z.boolean().optional(),
}).superRefine((data, ctx) => {
  const periodPattern = data.period_type === 'MONTHLY' ? MONTHLY_PERIOD_KEY_PATTERN : YEARLY_PERIOD_KEY_PATTERN;
  if (!periodPattern.test(data.period_key)) {
    ctx.addIssue({
      code: 'custom',
      path: ['period_key'],
      message: data.period_type === 'MONTHLY'
        ? 'Format periode bulanan harus YYYY-MM.'
        : 'Format periode tahunan harus YYYY.',
    });
  }

  const isCategoryValid = data.budget_type === 'EXPENSE'
    ? isExpenseReportFinanceTransaction({ type: 'EXPENSE', category: data.category })
    : isIncomeReportFinanceTransaction({ type: 'INCOME', category: data.category });

  if (!isCategoryValid) {
    ctx.addIssue({
      code: 'custom',
      path: ['category'],
      message: 'Kategori tidak valid untuk tipe anggaran ini.',
    });
  }
});

export type BudgetFormData = z.infer<typeof budgetSchema>;
