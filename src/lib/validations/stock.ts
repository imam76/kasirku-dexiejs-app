import { z } from 'zod';
import { inferUnitDefinitionType, isGlobalConvertibleUnitType } from '@/constants/units';
import { defaultLocale, translate, type TranslationKey } from '@/i18n/messages';

type StockValidationTranslator = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

const defaultT: StockValidationTranslator = (key, params) => translate(defaultLocale, key, params);

export const createStockSchema = (t: StockValidationTranslator = defaultT) => z.object({
  name: z.string().min(1, t('stock.validation.nameRequired')),
  category: z.string().min(1, t('stock.validation.categoryRequired')),
  purchase_unit: z.string().min(1, t('stock.validation.purchaseUnitRequired')),
  selling_unit: z.string().min(1, t('stock.validation.sellingUnitRequired')),
  purchase_price: z.number({ message: t('stock.validation.purchasePriceRequired') }).min(0, t('stock.validation.purchasePriceMin')),
  selling_price: z.number({ message: t('stock.validation.sellingPriceRequired') }).min(0, t('stock.validation.sellingPriceMin')),
  stock: z.number({ message: t('stock.validation.stockRequired') }).min(0, t('stock.validation.stockMin')),
  sku: z.string().optional().or(z.literal('')),
  purchase_quantity: z.number().min(0).optional().or(z.literal(0)),
  wholesale_prices: z.array(z.object({
    min_quantity: z.number().min(1, t('stock.validation.minQty')),
    price: z.number().min(0, t('stock.validation.priceMin')),
    price_type: z.enum(['unit', 'bundle']).optional(),
  })),
  sellable_units: z.array(z.string()).min(1, t('stock.validation.sellableUnitsRequired')),
  unit_mappings: z.array(z.object({
    unit: z.string().min(1, t('stock.validation.unitRequired')),
    base_unit: z.string().min(1, t('stock.validation.baseUnitRequired')),
    ratio: z.number().min(0.000001, t('stock.validation.ratioMin')),
  })),
}).superRefine((data, ctx) => {
  const seen = new Set<string>();
  const sellableUnits = Array.from(new Set([data.selling_unit, ...data.sellable_units].filter(Boolean)));

  data.unit_mappings.forEach((mapping, index) => {
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
        message: t('stock.validation.unitNeedsRatio', { unit }),
      });
    }
  });
});

export const stockSchema = createStockSchema();
export type StockFormData = z.infer<typeof stockSchema>;
