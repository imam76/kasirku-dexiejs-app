import { z } from 'zod';
import type { ContactType } from '@/types';

export const contactTypeValues = ['CUSTOMER', 'SUPPLIER', 'CUSTOMER_SUPPLIER', 'OTHER'] as const satisfies readonly ContactType[];

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((value) => value || undefined);

export const contactSchema = z.object({
  name: z.string().trim().min(1, 'Nama contact wajib diisi.'),
  contact_type: z.enum(contactTypeValues, { message: 'Tipe contact wajib dipilih.' }),
  phone: optionalTrimmedString,
  email: z
    .string()
    .trim()
    .email('Format email tidak valid.')
    .optional()
    .or(z.literal(''))
    .transform((value) => value || undefined),
  address: optionalTrimmedString,
  company_name: optionalTrimmedString,
  tax_number: optionalTrimmedString,
  notes: optionalTrimmedString,
  is_active: z.boolean().optional(),
});

export type ContactFormData = z.infer<typeof contactSchema>;
