import { normalizeUnitKey, normalizeWeightUnit, WEIGHT_BASE_UNIT } from '@/constants/units';
import { getConversionRatio } from '@/utils/pricing';
import type { Product, ProductUnit, SalesUnitCategory, TransactionItem } from '@/types';

export { WEIGHT_BASE_UNIT };

const normalizeMetric = (value?: string): SalesUnitCategory | undefined => {
  const normalized = normalizeUnitKey(value);

  if (normalized === 'weighted' || normalized === 'weight' || normalized === 'berat' || normalized === 'timbang') {
    return 'weighted';
  }

  if (normalized === 'discrete' || normalized === 'unit' || normalized === 'satuan') {
    return 'discrete';
  }

  return undefined;
};

const numberOrFallback = (value: unknown, fallback: number) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

const getNormalizedConversionRatio = (from: ProductUnit, to: ProductUnit) => {
  return getConversionRatio(normalizeWeightUnit(from) || from, normalizeWeightUnit(to) || to);
};

export const classifySalesUnit = (unit?: ProductUnit): SalesUnitCategory => {
  return normalizeWeightUnit(unit) ? 'weighted' : 'discrete';
};

export const resolveTransactionItemUnit = (
  item: Partial<TransactionItem>,
  product?: Product,
): ProductUnit => {
  const itemWithAliases = item as Partial<TransactionItem> & {
    selectedUnitId?: ProductUnit;
    unitId?: ProductUnit;
    unitName?: string;
    unitLabel?: string;
  };

  const unit =
    item.unit ||
    item.unit_id ||
    item.unit_label ||
    itemWithAliases.selectedUnitId ||
    itemWithAliases.unitId ||
    itemWithAliases.unitName ||
    itemWithAliases.unitLabel ||
    product?.selling_unit ||
    product?.purchase_unit ||
    'pcs';

  return String(unit).trim() || 'pcs';
};

export const resolveTransactionItemCategory = (
  item: Partial<TransactionItem>,
  unit: ProductUnit,
): SalesUnitCategory => {
  const itemWithAliases = item as Partial<TransactionItem> & {
    unitCategory?: string;
    unitType?: string;
    measurementType?: string;
  };

  return (
    normalizeMetric(item.unit_category) ||
    normalizeMetric(itemWithAliases.unitCategory) ||
    normalizeMetric(itemWithAliases.unitType) ||
    normalizeMetric(itemWithAliases.measurementType) ||
    classifySalesUnit(unit)
  );
};

export const createSalesUnitSnapshot = (
  unit: ProductUnit,
  product?: Product,
): Pick<TransactionItem, 'unit_id' | 'unit_label' | 'unit_category' | 'conversion_value' | 'base_unit'> => {
  const selectedUnit = String(unit || product?.selling_unit || product?.purchase_unit || 'pcs').trim() || 'pcs';
  const unitCategory = classifySalesUnit(selectedUnit);
  const baseUnit = unitCategory === 'weighted' ? WEIGHT_BASE_UNIT : product?.purchase_unit || selectedUnit;
  const conversionValue = getNormalizedConversionRatio(selectedUnit, baseUnit);

  return {
    unit_id: selectedUnit,
    unit_label: selectedUnit,
    unit_category: unitCategory,
    conversion_value: numberOrFallback(conversionValue, 1),
    base_unit: baseUnit,
  };
};

export interface SoldItemSummary {
  unitItems: number;
  weightedLineItems: number;
  totalWeightBase: number;
  weightBaseUnit: ProductUnit;
}

export const createEmptySoldItemSummary = (): SoldItemSummary => ({
  unitItems: 0,
  weightedLineItems: 0,
  totalWeightBase: 0,
  weightBaseUnit: WEIGHT_BASE_UNIT,
});

export const aggregateSoldItems = (
  items: TransactionItem[],
  productMap: Map<string, Product> = new Map(),
): SoldItemSummary => {
  return items.reduce((summary, item) => {
    const product = productMap.get(item.product_id);
    const unit = resolveTransactionItemUnit(item, product);
    const category = resolveTransactionItemCategory(item, unit);

    if (category === 'weighted') {
      const itemWithAliases = item as TransactionItem & { conversionValue?: number };
      const fallbackConversionValue = getNormalizedConversionRatio(unit, WEIGHT_BASE_UNIT);
      const storedConversionValue = item.conversion_value ?? itemWithAliases.conversionValue;
      const hasStoredConversion =
        Number.isFinite(Number(storedConversionValue)) && Number(storedConversionValue) > 0;
      const conversionValue = hasStoredConversion
        ? Number(storedConversionValue)
        : numberOrFallback(fallbackConversionValue, 1);
      const baseUnitToGram =
        hasStoredConversion && item.base_unit && item.base_unit !== WEIGHT_BASE_UNIT
          ? getNormalizedConversionRatio(item.base_unit, WEIGHT_BASE_UNIT)
          : 1;

      summary.weightedLineItems += 1;
      summary.totalWeightBase += item.quantity * conversionValue * numberOrFallback(baseUnitToGram, 1);
      return summary;
    }

    summary.unitItems += item.quantity;
    return summary;
  }, createEmptySoldItemSummary());
};

export const formatWeightTotal = (weightInGram: number): string => {
  if (!Number.isFinite(weightInGram) || weightInGram <= 0) {
    return `0 ${WEIGHT_BASE_UNIT}`;
  }

  if (weightInGram >= 1000) {
    return `${(weightInGram / 1000).toLocaleString('id-ID')} kg`;
  }

  return `${weightInGram.toLocaleString('id-ID')} ${WEIGHT_BASE_UNIT}`;
};
