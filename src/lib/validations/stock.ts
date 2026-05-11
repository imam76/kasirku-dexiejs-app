import { z } from 'zod';
import { inferUnitDefinitionType, isGlobalConvertibleUnitType } from '@/constants/units';

export const stockSchema = z.object({
  name: z.string().min(1, 'Nama produk harus diisi'),
  category: z.string().min(1, 'Kategori harus diisi'),
  purchase_unit: z.string().min(1, 'Satuan dasar stok harus diisi'),
  selling_unit: z.string().min(1, 'Satuan jual default harus diisi'),
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
  sellable_units: z.array(z.string()).min(1, 'Satuan jual tersedia harus diisi'),
  unit_mappings: z.array(z.object({
    unit: z.string().min(1, 'Satuan harus diisi'),
    base_unit: z.string().min(1, 'Satuan dasar harus diisi'),
    ratio: z.number().min(0.000001, 'Ratio harus > 0'),
  })),
}).superRefine((data, ctx) => {
  const seen = new Set<string>();
  const sellableUnits = Array.from(new Set([data.selling_unit, ...data.sellable_units].filter(Boolean)));

  data.unit_mappings.forEach((mapping, index) => {
    if (mapping.base_unit !== data.purchase_unit) {
      ctx.addIssue({
        code: 'custom',
        path: ['unit_mappings', index, 'base_unit'],
        message: 'Satuan dasar harus sama dengan Satuan Dasar Stok',
      });
    }

    if (mapping.unit === data.purchase_unit) {
      ctx.addIssue({
        code: 'custom',
        path: ['unit_mappings', index, 'unit'],
        message: 'Satuan ini sudah menjadi Satuan Dasar Stok',
      });
    }

    const key = `${mapping.unit}:${mapping.base_unit}`;
    if (seen.has(key)) {
      ctx.addIssue({
        code: 'custom',
        path: ['unit_mappings', index, 'unit'],
        message: 'Konversi satuan produk tidak boleh duplikat',
      });
    }
    seen.add(key);
  });

  sellableUnits.forEach((unit) => {
    if (unit === data.purchase_unit) return;

    const unitType = inferUnitDefinitionType(unit);
    const purchaseType = inferUnitDefinitionType(data.purchase_unit);
    const canUseGlobalConversion =
      unitType === purchaseType &&
      isGlobalConvertibleUnitType(unitType) &&
      isGlobalConvertibleUnitType(purchaseType);

    if (canUseGlobalConversion) return;

    const hasProductMapping = data.unit_mappings.some(
      (mapping) => mapping.unit === unit && mapping.base_unit === data.purchase_unit,
    );

    if (!hasProductMapping) {
      ctx.addIssue({
        code: 'custom',
        path: ['sellable_units'],
        message: `Satuan ${unit} perlu ratio di Konversi Unit`,
      });
    }
  });
});

export type StockFormData = z.infer<typeof stockSchema>;
