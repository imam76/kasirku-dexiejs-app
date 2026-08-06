import { normalizeUnitKey } from '@/constants/units';
import type { ProductUnit, ProductUnitMapping } from '@/types';

/**
 * Satuan sebuah produk selalu berasal dari dua sumber saja: satuan dasar
 * (`purchase_unit`) dan baris konversi di `unit_mappings`. Satuan yang tidak
 * punya baris konversi tidak boleh muncul di transaksi mana pun, karena
 * rationya tidak diketahui dan stok akan tercatat salah.
 */
type ProductUnitShape = {
  purchase_unit?: ProductUnit;
  selling_unit?: ProductUnit;
  unit_mappings?: ProductUnitMapping[];
};

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
    .filter((mapping) => mapping.unit !== mapping.base_unit)
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

/**
 * Satu-satunya daftar satuan yang boleh dipakai produk ini, dipakai bersama
 * oleh POS, penjualan, pembelian, dan stok masuk.
 */
export const getProductUnits = (product: ProductUnitShape) => {
  return uniqueUnits([
    normalizeUnit(product.purchase_unit),
    ...normalizeProductUnitMappings(product).map((mapping) => mapping.unit),
  ]);
};

/** Satuan yang terpilih otomatis saat produk masuk keranjang/dokumen. */
export const getProductDefaultUnit = (product: ProductUnitShape): ProductUnit => {
  const units = getProductUnits(product);
  const sellingUnit = normalizeUnitKey(product.selling_unit);

  if (sellingUnit && units.includes(sellingUnit)) return sellingUnit;
  return units[0] ?? normalizeUnit(product.purchase_unit);
};

export const getAdjacentProductUnit = (
  product: ProductUnitShape,
  currentUnit: ProductUnit,
  direction: 1 | -1,
) => {
  const units = getProductUnits(product);
  if (units.length <= 1) return units[0] ?? normalizeUnit(currentUnit);

  const normalizedCurrentUnit = normalizeUnit(currentUnit);
  const currentIndex = units.indexOf(normalizedCurrentUnit);
  if (currentIndex === -1) return units[0];

  return units[(currentIndex + direction + units.length) % units.length];
};

export interface LegacyUnitMappingInput extends ProductUnitShape {
  /** Kolom lama yang menyimpan satuan tanpa ratio eksplisit. */
  sellable_units?: ProductUnit[];
}

export interface LegacyUnitMappingResult {
  unitMappings: ProductUnitMapping[];
  /** Satuan lama yang rationya tidak bisa ditentukan, jadi tidak ikut dibawa. */
  droppedUnits: ProductUnit[];
}

/**
 * Mengangkat satuan dari kolom lama `sellable_units` menjadi baris konversi
 * eksplisit. Ratio diambil dari konversi global (mis. 1 kg = 1000 gram) lewat
 * `resolveRatio`; satuan yang tidak punya ratio tidak dibawa, karena dulu ia
 * jatuh ke ratio 1 dan membuat stok tercatat salah.
 */
export const buildUnitMappingsFromLegacyUnits = (
  product: LegacyUnitMappingInput,
  resolveRatio: (unit: ProductUnit, baseUnit: ProductUnit) => number | undefined,
): LegacyUnitMappingResult => {
  const baseUnit = normalizeUnit(product.purchase_unit);
  const unitMappings = normalizeProductUnitMappings(product);
  const mappedUnits = new Set(unitMappings.map((mapping) => mapping.unit));
  const droppedUnits: ProductUnit[] = [];

  const legacyUnits = uniqueUnits([product.selling_unit, ...(product.sellable_units || [])]);

  for (const unit of legacyUnits) {
    if (unit === baseUnit || mappedUnits.has(unit)) continue;

    const ratio = Number(resolveRatio(unit, baseUnit));
    if (!Number.isFinite(ratio) || ratio <= 0) {
      droppedUnits.push(unit);
      continue;
    }

    unitMappings.push({ unit, base_unit: baseUnit, ratio });
    mappedUnits.add(unit);
  }

  return { unitMappings, droppedUnits };
};
