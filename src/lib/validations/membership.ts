import { z } from 'zod';
import { normalizeMembershipPhone } from '@/utils/membership';

const membershipPhoneSchema = z
  .string()
  .transform(normalizeMembershipPhone)
  .pipe(z.string().min(1, 'Nomor HP wajib diisi.'));

export const membershipManagementSchema = z.object({
  phone: membershipPhoneSchema,
  name: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((value) => value || undefined),
  email: z
    .string()
    .trim()
    .email('Format email tidak valid.')
    .optional()
    .or(z.literal(''))
    .transform((value) => value || undefined),
  contact_id: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((value) => value || undefined),
  is_active: z.boolean().optional(),
});

export type MembershipManagementFormData = z.infer<typeof membershipManagementSchema>;

export const membershipQuickCreateSchema = z.object({
  phone: membershipPhoneSchema,
  name: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((value) => value || undefined),
  email: z
    .string()
    .trim()
    .email('Format email tidak valid.')
    .optional()
    .or(z.literal(''))
    .transform((value) => value || undefined),
});

export type MembershipQuickCreateFormData = z.infer<typeof membershipQuickCreateSchema>;
