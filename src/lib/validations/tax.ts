import { z } from 'zod';
import type { TaxCalculationMode, TaxRateType } from '@/types';

export const taxRateTypeValues = ['PERCENTAGE'] as const satisfies readonly TaxRateType[];
export const taxCalculationModeValues = ['EXCLUSIVE', 'INCLUSIVE'] as const satisfies readonly TaxCalculationMode[];

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((value) => value || undefined);

const optionalDateString = optionalTrimmedString.refine((value) => {
  if (!value) return true;
  return Number.isFinite(new Date(value).getTime());
}, { message: 'Periode pajak tidak valid.' });

export const taxSchema = z.object({
  name: z.string().trim().min(1, 'Nama tax wajib diisi.'),
  code: optionalTrimmedString.refine((value) => !value || value.length <= 30, {
    message: 'Kode tax maksimal 30 karakter.',
  }),
  rate: z.number({ message: 'Rate tax wajib diisi.' }).min(0, 'Rate tax tidak boleh negatif.').max(100, 'Rate tax maksimal 100%.'),
  rate_type: z.enum(taxRateTypeValues).optional().default('PERCENTAGE'),
  calculation_mode: z.enum(taxCalculationModeValues, { message: 'Mode kalkulasi tax wajib dipilih.' }),
  description: optionalTrimmedString,
  effective_from: optionalDateString,
  effective_to: optionalDateString,
  is_default: z.boolean().optional(),
  is_active: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (!data.effective_from || !data.effective_to) return;

  if (new Date(data.effective_to).getTime() < new Date(data.effective_from).getTime()) {
    ctx.addIssue({
      code: 'custom',
      path: ['effective_to'],
      message: 'Tanggal akhir efektif tidak boleh lebih awal dari tanggal mulai.',
    });
  }
});

export type TaxFormData = z.infer<typeof taxSchema>;
