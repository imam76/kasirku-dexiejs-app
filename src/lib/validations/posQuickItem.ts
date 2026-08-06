import { z } from 'zod';

const optionalPositiveAmount = z
  .number()
  .min(0, 'Perkiraan harga beli tidak boleh negatif.')
  .optional()
  .nullable()
  .transform((value) => value ?? undefined);

const purchasedQuantity = z
  .number({ message: 'Jumlah dibeli wajib diisi.' })
  .positive('Jumlah dibeli harus lebih dari 0.');

export const posQuickItemTopUpSchema = z.object({
  quantity: purchasedQuantity,
  estimated_purchase_price: optionalPositiveAmount,
});

export type PosQuickItemTopUpFormValues = z.input<typeof posQuickItemTopUpSchema>;
export type PosQuickItemTopUpFormData = z.infer<typeof posQuickItemTopUpSchema>;
