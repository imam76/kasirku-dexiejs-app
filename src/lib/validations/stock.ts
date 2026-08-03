import { z } from 'zod';
import { DEFAULT_CONVERSIONS, normalizeUnitKey } from '@/constants/units';
import { defaultLocale, translate, type TranslationKey } from '@/i18n/messages';
import type { UnitConversion } from '@/types';
import { resolveProductUnitRatio } from '@/utils/productUnits';

type StockValidationTranslator = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

const defaultT: StockValidationTranslator = (key, params) => translate(defaultLocale, key, params);

type StockValidationOptions = {
  globalConversions?: ReadonlyArray<Pick<UnitConversion, 'fromUnit' | 'toUnit' | 'ratio'>>;
};

export const createStockSchema = (
  t: StockValidationTranslator = defaultT,
  { globalConversions = DEFAULT_CONVERSIONS }: StockValidationOptions = {},
) => z.object({
  name: z.string().min(1, t('stock.validation.nameRequired')),
  category: z.string().min(1, t('stock.validation.categoryRequired')),
  purchase_unit: z.string().min(1, t('stock.validation.purchaseUnitRequired')),
  selling_unit: z.string().min(1, t('stock.validation.sellingUnitRequired')),
  purchase_price: z.number({ message: t('stock.validation.purchasePriceRequired') }).min(0, t('stock.validation.purchasePriceMin')),
  selling_price: z.number({ message: t('stock.validation.sellingPriceRequired') }).min(0, t('stock.validation.sellingPriceMin')),
  stock: z.number().min(0, t('stock.validation.stockMin')).optional(),
  sku: z.string().optional().or(z.literal('')),
  product_type: z.enum(['FINISHED_GOOD', 'RAW_MATERIAL']),
  is_visible_in_pos: z.boolean(),
  purchase_quantity: z.number().min(0).optional().or(z.literal(0)),
  wholesale_prices: z.array(z.object({
    min_quantity: z.number().min(1, t('stock.validation.minQty')),
    unit: z.string().min(1, t('stock.validation.unitRequired')),
    price: z.number().min(0, t('stock.validation.priceMin')),
    price_type: z.enum(['unit', 'bundle']).optional(),
  })),
  sellable_units: z.array(z.string()).min(1, t('stock.validation.sellableUnitsRequired')),
  unit_mappings: z.array(z.object({
    from_quantity: z.number().min(0.000001, t('stock.validation.quantityMin')),
    from_unit: z.string().min(1, t('stock.validation.unitRequired')),
    to_quantity: z.number().min(0.000001, t('stock.validation.quantityMin')),
    to_unit: z.string().min(1, t('stock.validation.unitRequired')),
  })),
}).superRefine((data, ctx) => {
  const seen = new Set<string>();
  let hasReportedInconsistentConversion = false;
  const sellableUnits = Array.from(new Set([data.selling_unit, ...data.sellable_units].filter(Boolean)));
  const normalizedSellableUnits = new Set(sellableUnits.map(normalizeUnitKey));

  data.wholesale_prices.forEach((price, index) => {
    if (!normalizedSellableUnits.has(normalizeUnitKey(price.unit))) {
      ctx.addIssue({
        code: 'custom',
        path: ['wholesale_prices', index, 'unit'],
        message: t('stock.validation.wholesaleUnitNotSellable', { unit: price.unit }),
      });
    }

    // Tier yang mulai dari 1 satuan jual berlaku di setiap kuantitas, jadi harga
    // jual tidak pernah terpakai lagi. Threshold 1 pada satuan lain (mis. 1 dus
    // saat produk dijual per pcs) tetap sah karena itu memang pembelian borongan.
    if (
      price.min_quantity <= 1 &&
      normalizeUnitKey(price.unit) === normalizeUnitKey(data.selling_unit)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['wholesale_prices', index, 'min_quantity'],
        message: t('stock.validation.wholesaleMinQtyOverridesBase', { unit: price.unit }),
      });
    }
  });

  data.unit_mappings.forEach((mapping, index) => {
    const normalizedFromUnit = normalizeUnitKey(mapping.from_unit);
    const normalizedToUnit = normalizeUnitKey(mapping.to_unit);

    if (normalizedFromUnit === normalizedToUnit) {
      ctx.addIssue({
        code: 'custom',
        path: ['unit_mappings', index, 'to_unit'],
        message: t('stock.validation.sameConversionUnit'),
      });
    }

    const key = [normalizedFromUnit, normalizedToUnit].sort().join(':');
    if (seen.has(key)) {
      ctx.addIssue({
        code: 'custom',
        path: ['unit_mappings', index, 'to_unit'],
        message: t('stock.validation.duplicateUnitConversion'),
      });
    }
    seen.add(key);
  });

  sellableUnits.forEach((unit) => {
    if (unit === data.purchase_unit) return;

    const normalizedUnit = normalizeUnitKey(unit);
    const normalizedPurchaseUnit = normalizeUnitKey(data.purchase_unit);

    const productResolution = resolveProductUnitRatio({
      purchase_unit: data.purchase_unit,
      selling_unit: data.selling_unit,
      sellable_units: data.sellable_units,
      unit_mappings: data.unit_mappings,
    }, normalizedUnit, normalizedPurchaseUnit, { globalConversions });

    if (productResolution.status === 'inconsistent') {
      if (!hasReportedInconsistentConversion) {
        ctx.addIssue({
          code: 'custom',
          path: ['unit_mappings'],
          message: t('stock.validation.inconsistentUnitConversion'),
        });
        hasReportedInconsistentConversion = true;
      }
      return;
    }

    if (productResolution.status === 'disconnected') {
      ctx.addIssue({
        code: 'custom',
        path: ['sellable_units'],
        message: t('stock.validation.unitNeedsRatio', { unit }),
      });
    }
  });
});

export const stockSchema = createStockSchema();
export type StockFormData = z.infer<typeof stockSchema>;
