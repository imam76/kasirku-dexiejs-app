import { z } from 'zod';

export const stockSchema = z.object({
  name: z.string().min(1, 'Nama produk harus diisi'),
  category: z.string().min(1, 'Kategori harus diisi'),
  purchase_unit: z.string().min(1, 'Satuan beli harus diisi'),
  selling_unit: z.string().min(1, 'Satuan jual harus diisi'),
  purchase_price: z.number({ message: 'Harga beli harus diisi' }).min(0, 'Harga beli tidak boleh negatif'),
  selling_price: z.number({ message: 'Harga jual harus diisi' }).min(0, 'Harga jual tidak boleh negatif'),
  stock: z.number({ message: 'Stok harus diisi' }).min(0, 'Stok tidak boleh negatif'),
  sku: z.string().optional().or(z.literal('')),
  purchase_quantity: z.number().min(0).optional().or(z.literal(0)),
  wholesale_prices: z.array(z.object({
    min_quantity: z.number().min(1, 'Min. qty harus > 0'),
    price: z.number().min(0, 'Harga harus >= 0'),
    price_type: z.enum(['unit', 'bundle']).optional(),
  })),
  sellable_units: z.array(z.string()),
});

export type StockFormData = z.infer<typeof stockSchema>;
