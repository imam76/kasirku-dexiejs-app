import { z } from 'zod';
import {
  inferUnitCategory,
  normalizeUnitKey,
  type UnitCategory,
} from '@/constants/units';
import { defaultLocale, translate, type TranslationKey } from '@/i18n/messages';

type StockValidationTranslator = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

/**
 * Satuan buatan pengguna tidak ada di daftar bawaan, jadi form menyuntikkan
 * kategori dari master unit supaya validasi menilai satuan yang sama dengan
 * yang ditawarkan dropdown.
 */
type StockUnitCategoryResolver = (unit: string) => UnitCategory;

const defaultT: StockValidationTranslator = (key, params) => translate(defaultLocale, key, params);

const defaultUnitCategory: StockUnitCategoryResolver = (unit) => inferUnitCategory(unit);

export const createStockSchema = (
  t: StockValidationTranslator = defaultT,
  getUnitCategory: StockUnitCategoryResolver = defaultUnitCategory,
) => z.object({
  name: z.string().min(1, t('stock.validation.nameRequired')),
  category: z.string().min(1, t('stock.validation.categoryRequired')),
  purchase_unit: z.string().min(1, t('stock.validation.purchaseUnitRequired')),
  selling_unit: z.string().min(1, t('stock.validation.sellingUnitRequired')),
  // Harga boleh dikosongkan dulu supaya produk bisa didaftarkan sebelum harga
  // supplier final. Nilai kosong disimpan sebagai 0, sama seperti jalur impor
  // CSV dan entri dasar dari dokumen pembelian.
  purchase_price: z.number({ message: t('stock.validation.purchasePriceRequired') }).min(0, t('stock.validation.purchasePriceMin')).optional(),
  selling_price: z.number({ message: t('stock.validation.sellingPriceRequired') }).min(0, t('stock.validation.sellingPriceMin')).optional(),
  stock: z.number().min(0, t('stock.validation.stockMin')).optional(),
  sku: z.string().optional().or(z.literal('')),
  product_type: z.enum(['FINISHED_GOOD', 'RAW_MATERIAL']),
  is_visible_in_pos: z.boolean(),
  purchase_quantity: z.number().min(0).optional().or(z.literal(0)),
  wholesale_prices: z.array(z.object({
    min_quantity: z.number().min(1, t('stock.validation.minQty')),
    price: z.number().min(0, t('stock.validation.priceMin')),
    price_type: z.enum(['unit', 'bundle']).optional(),
  })),
  unit_mappings: z.array(z.object({
    unit: z.string().min(1, t('stock.validation.unitRequired')),
    base_unit: z.string().min(1, t('stock.validation.baseUnitRequired')),
    // Turunan dari pasangan di bawah, tetap divalidasi karena inilah angka yang
    // dibaca stok, harga, dan sinkronisasi.
    ratio: z.number().min(0.000001, t('stock.validation.ratioMin')),
    // Pasangan apa adanya dari form: `qty unit = base_qty base_unit`. Opsional
    // supaya baris lama yang cuma punya ratio tetap lolos.
    qty: z.number().min(0.000001, t('stock.validation.unitQtyMin')).optional(),
    base_qty: z.number().min(0.000001, t('stock.validation.baseQtyMin')).optional(),
  })),
}).superRefine((data, ctx) => {
  const seen = new Set<string>();

  data.unit_mappings.forEach((mapping, index) => {
    const unitCategory = getUnitCategory(mapping.unit);
    const purchaseCategory = getUnitCategory(data.purchase_unit);

    if (mapping.base_unit !== data.purchase_unit) {
      ctx.addIssue({
        code: 'custom',
        path: ['unit_mappings', index, 'base_unit'],
        message: t('stock.validation.baseUnitMustMatch'),
      });
    }

    if (mapping.unit === data.purchase_unit) {
      ctx.addIssue({
        code: 'custom',
        path: ['unit_mappings', index, 'unit'],
        message: t('stock.validation.unitAlreadyBase'),
      });
    }

    // Kemasan dan satuan hitungan sepadan ke dua arah: "1 box = 12 pcs" sama
    // sahnya dengan "12 pcs = 1 box". Yang tidak sepadan tetap ditolak, mis.
    // kemasan di atas satuan berat.
    const isPackageOverCount = unitCategory === 'package' && purchaseCategory === 'count';
    const isCountUnderPackage = unitCategory === 'count' && purchaseCategory === 'package';

    if (!isPackageOverCount && !isCountUnderPackage && unitCategory !== purchaseCategory) {
      ctx.addIssue({
        code: 'custom',
        path: ['unit_mappings', index, 'unit'],
        message: t('stock.validation.incompatibleUnitCategory', { unit: mapping.unit }),
      });
    }

    // Kemasan menampung satuan hitungan, tidak pernah sebaliknya. Tanpa ini
    // form menerima "1 pcs = 12 box", yang membaca satu pcs berisi dua belas
    // box dan bikin stok tercatat 12 kali lipat.
    if (isPackageOverCount && mapping.ratio <= 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['unit_mappings', index, 'base_qty'],
        message: t('stock.validation.packageMustBeLarger', {
          packageUnit: mapping.unit,
          countUnit: data.purchase_unit,
        }),
      });
    }

    if (isCountUnderPackage && mapping.ratio >= 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['unit_mappings', index, 'base_qty'],
        message: t('stock.validation.packageMustBeLarger', {
          packageUnit: data.purchase_unit,
          countUnit: mapping.unit,
        }),
      });
    }

    const key = `${mapping.unit}:${mapping.base_unit}`;
    if (seen.has(key)) {
      ctx.addIssue({
        code: 'custom',
        path: ['unit_mappings', index, 'unit'],
        message: t('stock.validation.duplicateUnitConversion'),
      });
    }
    seen.add(key);
  });

  // Satuan default kasir hanya boleh satuan yang rationya sudah terdefinisi,
  // yaitu satuan dasar atau salah satu baris konversi produk.
  const availableUnits = new Set([
    normalizeUnitKey(data.purchase_unit),
    ...data.unit_mappings.map((mapping) => normalizeUnitKey(mapping.unit)),
  ]);

  if (!availableUnits.has(normalizeUnitKey(data.selling_unit))) {
    ctx.addIssue({
      code: 'custom',
      path: ['selling_unit'],
      message: t('stock.validation.sellingUnitNotAvailable', { unit: data.selling_unit }),
    });
  }
});

export const stockSchema = createStockSchema();
export type StockFormData = z.infer<typeof stockSchema>;
