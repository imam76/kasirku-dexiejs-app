import { z } from 'zod';
import type { ProjectStatus } from '@/types';

export const projectStatusValues = ['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'] as const satisfies readonly ProjectStatus[];

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((value) => value || undefined);

const optionalDateString = optionalTrimmedString.refine((value) => {
  if (!value) return true;
  return Number.isFinite(new Date(value).getTime());
}, { message: 'Tanggal project tidak valid.' });

export const projectSchema = z.object({
  name: z.string().trim().min(1, 'Nama project wajib diisi.'),
  code: optionalTrimmedString.refine((value) => !value || value.length <= 30, {
    message: 'Kode project maksimal 30 karakter.',
  }),
  status: z.enum(projectStatusValues, { message: 'Status project wajib dipilih.' }),
  contact_id: optionalTrimmedString,
  contact_name: optionalTrimmedString,
  department_id: optionalTrimmedString,
  department_code: optionalTrimmedString,
  department_name: optionalTrimmedString,
  start_date: optionalDateString,
  end_date: optionalDateString,
  budget_amount: z
    .number()
    .min(0, 'Budget project tidak boleh negatif.')
    .optional(),
  description: optionalTrimmedString,
  is_active: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (!data.start_date || !data.end_date) return;

  if (new Date(data.end_date).getTime() < new Date(data.start_date).getTime()) {
    ctx.addIssue({
      code: 'custom',
      path: ['end_date'],
      message: 'Tanggal selesai tidak boleh lebih awal dari tanggal mulai.',
    });
  }
});

export type ProjectFormData = z.infer<typeof projectSchema>;
