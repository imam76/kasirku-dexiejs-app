import { normalizeUnitKey } from '@/constants/units';
import type { Product, ProductUnit, ProductUnitMapping } from '@/types';

type ProductUnitShape = Pick<Product, 'purchase_unit' | 'selling_unit' | 'sellable_units' | 'unit_mappings'>;

const normalizeUnit = (unit?: ProductUnit) => normalizeUnitKey(unit || 'pcs') || 'pcs';

const uniqueUnits = (units: Array<ProductUnit | undefined>) => {
  const seen = new Set<string>();
  return units
    .map((unit) => normalizeUnitKey(unit))
    .filter((unit): unit is string => Boolean(unit))
    .filter((unit) => {
      if (seen.has(unit)) return false;
      seen.add(unit);
      return true;
    });
};

export const normalizeProductUnitMappings = (product: ProductUnitShape): ProductUnitMapping[] => {
  const fallbackBaseUnit = normalizeUnit(product.purchase_unit);
  const seen = new Set<string>();

  return (product.unit_mappings || [])
    .map((mapping) => ({
      unit: normalizeUnit(mapping.unit),
      base_unit: normalizeUnit(mapping.base_unit || fallbackBaseUnit),
      ratio: Number(mapping.ratio),
    }))
    .filter((mapping) => mapping.unit && mapping.base_unit && Number.isFinite(mapping.ratio) && mapping.ratio > 0)
    .filter((mapping) => {
      const key = `${mapping.unit}:${mapping.base_unit}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

export const getProductUnitRatio = (
  product: ProductUnitShape,
  fromUnit: ProductUnit,
  toUnit: ProductUnit,
): number | undefined => {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (from === to) return 1;

  const mappings = normalizeProductUnitMappings(product);
  const baseUnits = uniqueUnits([product.purchase_unit, ...mappings.map((mapping) => mapping.base_unit)]);

  for (const baseUnit of baseUnits) {
    const fromRatio = from === baseUnit
      ? 1
      : mappings.find((mapping) => mapping.unit === from && mapping.base_unit === baseUnit)?.ratio;
    const toRatio = to === baseUnit
      ? 1
      : mappings.find((mapping) => mapping.unit === to && mapping.base_unit === baseUnit)?.ratio;

    if (fromRatio && toRatio) {
      return fromRatio / toRatio;
    }
  }

  return undefined;
};

export const getProductSellableUnits = (product: ProductUnitShape) => {
  return uniqueUnits([
    product.selling_unit,
    ...(product.sellable_units || []),
    ...normalizeProductUnitMappings(product).map((mapping) => mapping.unit),
  ]);
};

export const getAdjacentProductSellableUnit = (
  product: ProductUnitShape,
  currentUnit: ProductUnit,
  direction: 1 | -1,
) => {
  const sellableUnits = getProductSellableUnits(product);
  if (sellableUnits.length <= 1) return sellableUnits[0] ?? normalizeUnit(currentUnit);

  const normalizedCurrentUnit = normalizeUnit(currentUnit);
  const currentIndex = sellableUnits.indexOf(normalizedCurrentUnit);
  if (currentIndex === -1) return sellableUnits[0];

  return sellableUnits[(currentIndex + direction + sellableUnits.length) % sellableUnits.length];
};

export const getProductDocumentUnits = (product: ProductUnitShape) => {
  return uniqueUnits([
    product.selling_unit,
    product.purchase_unit,
    ...(product.sellable_units || []),
    ...normalizeProductUnitMappings(product).map((mapping) => mapping.unit),
  ]);
};

export const buildSellableUnitsFromMappings = (product: ProductUnitShape) => {
  return getProductSellableUnits({
    ...product,
    sellable_units: product.sellable_units && product.sellable_units.length > 0
      ? product.sellable_units
      : [product.selling_unit],
  });
};
