import { z } from 'zod';

export const shoppingItemSchema = z.object({
  name: z.string().min(1, 'Nama item harus diisi'),
  unit_price: z.number().min(0, 'Harga tidak boleh negatif'),
  quantity: z.number().min(0.01, 'Jumlah minimal 0.01'),
  unit: z.string().min(1, 'Satuan harus diisi'),
});

export type ShoppingItemFormData = z.infer<typeof shoppingItemSchema>;
