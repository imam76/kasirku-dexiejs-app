import { z } from 'zod';

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((value) => value || undefined);

export const cooperativeAreaSchema = z.object({
  name: z.string().trim().min(1, 'Nama area wajib diisi.'),
  code: optionalTrimmedString.refine((value) => !value || value.length <= 20, {
    message: 'Kode area maksimal 20 karakter.',
  }),
  description: optionalTrimmedString,
  is_active: z.boolean().optional(),
});

export type CooperativeAreaFormData = z.infer<typeof cooperativeAreaSchema>;
