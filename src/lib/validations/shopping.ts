import { z } from 'zod';

export const shoppingItemSchema = z.object({
  product_id: z.string().min(1, 'Produk harus dipilih'),
  unit_price: z.number({ message: 'Harga modal harus diisi' }).min(0, 'Harga modal tidak boleh negatif'),
  quantity: z.number().min(0.01, 'Jumlah minimal 0.01'),
  unit: z.string().min(1, 'Satuan harus diisi'),
});

export type ShoppingItemFormData = z.infer<typeof shoppingItemSchema>;
