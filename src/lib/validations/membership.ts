import { z } from 'zod';

export const retailMembershipStatusValues = ['ACTIVE', 'INACTIVE'] as const;

export const membershipManagementSchema = z.object({
  phone: z.string().trim().min(1, 'Nomor HP wajib diisi.'),
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
  status: z.enum(retailMembershipStatusValues).optional(),
  is_active: z.boolean().optional(),
});

export type MembershipManagementFormData = z.infer<typeof membershipManagementSchema>;

export const membershipQuickCreateSchema = z.object({
  phone: z.string().trim().min(1, 'Nomor HP wajib diisi.'),
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
