import { z } from 'zod';

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((value) => value || undefined);

const optionalPositiveAmount = z
  .number()
  .min(0, 'Perkiraan harga beli tidak boleh negatif.')
  .optional()
  .nullable()
  .transform((value) => value ?? undefined);

const purchasedQuantity = z
  .number({ message: 'Jumlah dibeli wajib diisi.' })
  .positive('Jumlah dibeli harus lebih dari 0.');

export const posQuickItemSchema = z.object({
  name: z.string().trim().min(1, 'Nama barang wajib diisi.'),
  barcode: optionalTrimmedString,
  selling_price: z
    .number({ message: 'Harga jual wajib diisi.' })
    .positive('Harga jual harus lebih dari 0.'),
  quantity: purchasedQuantity,
  unit: z.string().trim().min(1, 'Satuan wajib dipilih.'),
  estimated_purchase_price: optionalPositiveAmount,
});

export const posQuickItemTopUpSchema = z.object({
  quantity: purchasedQuantity,
  estimated_purchase_price: optionalPositiveAmount,
});

export type PosQuickItemFormValues = z.input<typeof posQuickItemSchema>;
export type PosQuickItemFormData = z.infer<typeof posQuickItemSchema>;
export type PosQuickItemTopUpFormValues = z.input<typeof posQuickItemTopUpSchema>;
export type PosQuickItemTopUpFormData = z.infer<typeof posQuickItemTopUpSchema>;
