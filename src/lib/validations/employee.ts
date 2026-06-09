import { z } from 'zod';

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((value) => value || undefined);

export const employeeSchema = z.object({
  name: z.string().trim().min(1, 'Nama karyawan wajib diisi.'),
  phone: optionalTrimmedString,
  email: optionalTrimmedString.refine((value) => !value || z.email().safeParse(value).success, {
    message: 'Email karyawan tidak valid.',
  }),
  address: optionalTrimmedString,
  position: optionalTrimmedString,
  user_id: optionalTrimmedString,
  notes: optionalTrimmedString,
  area_ids: z.array(z.string().trim().min(1)).optional(),
  is_active: z.boolean().optional(),
});

export type EmployeeFormData = z.infer<typeof employeeSchema>;
