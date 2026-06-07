import { z } from 'zod';

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((value) => value || undefined);

export const warehouseSchema = z.object({
  name: z.string().trim().min(1, 'Nama gudang wajib diisi.'),
  code: optionalTrimmedString,
  address: optionalTrimmedString,
  phone: optionalTrimmedString,
  notes: optionalTrimmedString,
  is_active: z.boolean().optional(),
});

export type WarehouseFormData = z.infer<typeof warehouseSchema>;
