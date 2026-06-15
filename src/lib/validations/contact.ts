import { z } from 'zod';
import type { ContactType } from '@/types';

export const contactTypeValues = ['CUSTOMER', 'SUPPLIER', 'CUSTOMER_SUPPLIER', 'OTHER'] as const satisfies readonly ContactType[];
export const retailMembershipStatusValues = ['ACTIVE', 'INACTIVE'] as const;

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
  is_member: z.boolean().optional(),
  membership_number: optionalTrimmedString.transform((value) => value?.toUpperCase()),
  membership_status: z.enum(retailMembershipStatusValues).optional(),
  membership_joined_at: optionalTrimmedString,
  membership_points_balance: z.number().min(0).optional(),
});

export type ContactFormData = z.infer<typeof contactSchema>;
