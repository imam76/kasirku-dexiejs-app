import { z } from 'zod';
import type { BudgetCommitmentStatus } from '@/types';

export const budgetCommitmentStatusValues = ['PLANNED', 'REALIZED', 'CANCELLED'] as const satisfies readonly BudgetCommitmentStatus[];

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((value) => value || undefined);

export const budgetCommitmentSchema = z.object({
  budget_id: z.string().trim().min(1, 'Anggaran wajib dipilih.'),
  description: z.string().trim().min(1, 'Deskripsi komitmen wajib diisi.'),
  amount: z
    .number()
    .min(0, 'Nominal komitmen tidak boleh negatif.'),
  status: z.enum(budgetCommitmentStatusValues).optional(),
  notes: optionalTrimmedString,
});

export type BudgetCommitmentFormData = z.infer<typeof budgetCommitmentSchema>;
