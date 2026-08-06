import { inferConversionUnitType, normalizeUnitKey } from '@/constants/units';
import type {
  Product,
  ProductUnit,
  ProductUnitMapping,
  UnitConversion,
} from '@/types';

type ProductUnitShape = Pick<Product, 'purchase_unit' | 'selling_unit' | 'sellable_units'> & {
  unit_mappings?: unknown;
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

const isPositiveFinite = (value: number) => Number.isFinite(value) && value > 0;

const parsePositiveFinite = (value: unknown) => {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const numeric = Number(value);
  return isPositiveFinite(numeric) ? numeric : undefined;
};

const areEquivalentRatios = (left: number, right: number) => (
  Math.abs(left - right) <= 1e-9 * Math.max(1, Math.abs(left), Math.abs(right))
);

type ExplicitProductUnitMappingShape = {
  from_quantity: unknown;
  from_unit: unknown;
  to_quantity: unknown;
  to_unit: unknown;
};

type LegacyProductUnitMappingShape = {
  unit: unknown;
  base_unit: unknown;
  ratio: unknown;
  /**
   * Pasangan angka apa adanya seperti yang diketik pengguna: `qty unit =
   * base_qty base_unit`. Baris lama yang hanya punya `ratio` dibaca sebagai
   * `qty: 1`.
   */
  qty?: unknown;
  base_qty?: unknown;
};

const isExplicitProductUnitMapping = (
  mapping: unknown,
): mapping is ExplicitProductUnitMappingShape => {
  if (!mapping || typeof mapping !== 'object') return false;

  return (
    'from_quantity' in mapping &&
    'from_unit' in mapping &&
    'to_quantity' in mapping &&
    'to_unit' in mapping
  );
};

const isLegacyProductUnitMapping = (
  mapping: unknown,
): mapping is LegacyProductUnitMappingShape => {
  if (!mapping || typeof mapping !== 'object') return false;

  return 'unit' in mapping && 'base_unit' in mapping && 'ratio' in mapping;
};

export const getLegacyProductMappingUnits = (unitMappings: unknown): ProductUnit[] => {
  if (!Array.isArray(unitMappings)) return [];

  return uniqueUnits(unitMappings.map((mapping) => {
    if (!isLegacyProductUnitMapping(mapping) || typeof mapping.unit !== 'string') return undefined;
    const hasPair = parsePositiveFinite(mapping.qty) !== undefined
      && parsePositiveFinite(mapping.base_qty) !== undefined;
    if (!hasPair && parsePositiveFinite(mapping.ratio) === undefined) return undefined;
    return normalizeUnitKey(mapping.unit) || undefined;
  }));
};

export const normalizeProductUnitMapping = (
  mapping: unknown,
  fallbackBaseUnit: ProductUnit = 'pcs',
): ProductUnitMapping | undefined => {
  if (isExplicitProductUnitMapping(mapping)) {
    const fromQuantity = parsePositiveFinite(mapping.from_quantity);
    const toQuantity = parsePositiveFinite(mapping.to_quantity);
    if (typeof mapping.from_unit !== 'string' || typeof mapping.to_unit !== 'string') return undefined;

    const fromUnit = normalizeUnitKey(mapping.from_unit);
    const toUnit = normalizeUnitKey(mapping.to_unit);

    if (fromQuantity === undefined || toQuantity === undefined || !fromUnit || !toUnit) {
      return undefined;
    }

    return {
      from_quantity: fromQuantity,
      from_unit: fromUnit,
      to_quantity: toQuantity,
      to_unit: toUnit,
    };
  }

  if (isLegacyProductUnitMapping(mapping)) {
    if (typeof mapping.unit !== 'string') return undefined;

    const fromUnit = normalizeUnitKey(mapping.unit);
    const rawBaseUnit = typeof mapping.base_unit === 'string' ? mapping.base_unit : '';
    const toUnit = normalizeUnitKey(rawBaseUnit || fallbackBaseUnit);

    if (!fromUnit || !toUnit) return undefined;

    // Pasangan `qty`/`base_qty` menang atas `ratio`, karena pasangan itulah
    // angka asli yang diketik pengguna. Lewat `ratio` saja, "12 pcs = 1 pack"
    // sudah terlanjur jadi 0.08333333 dan tidak pernah kembali bulat.
    const qty = parsePositiveFinite(mapping.qty);
    const baseQty = parsePositiveFinite(mapping.base_qty);

    if (qty !== undefined && baseQty !== undefined) {
      return {
        from_quantity: qty,
        from_unit: fromUnit,
        to_quantity: baseQty,
        to_unit: toUnit,
      };
    }

    const ratio = parsePositiveFinite(mapping.ratio);
    if (ratio === undefined) return undefined;

    return {
      from_quantity: 1,
      from_unit: fromUnit,
      to_quantity: ratio,
      to_unit: toUnit,
    };
  }

  return undefined;
};

export const normalizeProductUnitMappings = (product: ProductUnitShape): ProductUnitMapping[] => {
  const fallbackBaseUnit = normalizeUnit(product.purchase_unit);
  const seenRatios = new Map<string, number>();

  const mappings = Array.isArray(product.unit_mappings) ? product.unit_mappings : [];

  return mappings
    .map((mapping) => normalizeProductUnitMapping(mapping, fallbackBaseUnit))
    .filter((mapping): mapping is ProductUnitMapping => Boolean(mapping))
    .filter((mapping) => {
      if (mapping.from_unit === mapping.to_unit) return false;

      const [firstUnit, secondUnit] = [mapping.from_unit, mapping.to_unit].sort();
      const key = `${firstUnit}:${secondUnit}`;
      const directRatio = mapping.to_quantity / mapping.from_quantity;
      const normalizedRatio = mapping.from_unit === firstUnit ? directRatio : 1 / directRatio;
      const seenRatio = seenRatios.get(key);

      if (seenRatio !== undefined && areEquivalentRatios(seenRatio, normalizedRatio)) return false;
      if (seenRatio === undefined) seenRatios.set(key, normalizedRatio);
      return true;
    });
};

export type ProductUnitRatioResolution =
  | { status: 'resolved'; ratio: number }
  | { status: 'disconnected' }
  | { status: 'inconsistent' };

type ProductUnitRatioOptions = {
  globalConversions?: ReadonlyArray<Pick<UnitConversion, 'fromUnit' | 'toUnit' | 'ratio'>>;
};

export const resolveProductUnitRatio = (
  product: ProductUnitShape,
  fromUnit: ProductUnit,
  toUnit: ProductUnit,
  { globalConversions = [] }: ProductUnitRatioOptions = {},
): ProductUnitRatioResolution => {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (from === to) return { status: 'resolved', ratio: 1 };

  const mappings = normalizeProductUnitMappings(product);
  const graph = new Map<ProductUnit, Array<{ unit: ProductUnit; ratio: number }>>();

  const addEdge = (edgeFrom: ProductUnit, edgeTo: ProductUnit, ratio: number) => {
    const edges = graph.get(edgeFrom) || [];
    edges.push({ unit: edgeTo, ratio });
    graph.set(edgeFrom, edges);
  };

  mappings.forEach((mapping) => {
    const directRatio = mapping.to_quantity / mapping.from_quantity;
    if (!isPositiveFinite(directRatio)) return;
    addEdge(mapping.from_unit, mapping.to_unit, directRatio);
    addEdge(mapping.to_unit, mapping.from_unit, 1 / directRatio);
  });

  globalConversions.forEach((conversion) => {
    const globalFromUnit = normalizeUnitKey(conversion.fromUnit);
    const globalToUnit = normalizeUnitKey(conversion.toUnit);
    const ratio = Number(conversion.ratio);
    if (
      !globalFromUnit ||
      !globalToUnit ||
      globalFromUnit === globalToUnit ||
      !isPositiveFinite(ratio) ||
      inferConversionUnitType(globalFromUnit, globalToUnit) === 'package'
    ) return;

    addEdge(globalFromUnit, globalToUnit, ratio);
    addEdge(globalToUnit, globalFromUnit, 1 / ratio);
  });

  const queue: ProductUnit[] = [from];
  const ratios = new Map<ProductUnit, number>([[from, 1]]);

  for (let index = 0; index < queue.length; index += 1) {
    const currentUnit = queue[index];
    const currentRatio = ratios.get(currentUnit);
    if (currentRatio === undefined) continue;

    for (const edge of graph.get(currentUnit) || []) {
      const candidateRatio = currentRatio * edge.ratio;
      if (!isPositiveFinite(candidateRatio)) return { status: 'inconsistent' };

      const knownRatio = ratios.get(edge.unit);
      if (knownRatio !== undefined) {
        // More than one path to the same unit must describe the same equation.
        // Marking it inconsistent is safer than choosing an arbitrary price/stock ratio.
        if (!areEquivalentRatios(knownRatio, candidateRatio)) return { status: 'inconsistent' };
        continue;
      }

      ratios.set(edge.unit, candidateRatio);
      queue.push(edge.unit);
    }
  }

  const ratio = ratios.get(to);
  return ratio === undefined
    ? { status: 'disconnected' }
    : { status: 'resolved', ratio };
};

export const getProductUnitRatio = (
  product: ProductUnitShape,
  fromUnit: ProductUnit,
  toUnit: ProductUnit,
  options: ProductUnitRatioOptions = {},
): number | undefined => {
  const resolution = resolveProductUnitRatio(product, fromUnit, toUnit, options);
  return resolution.status === 'resolved' ? resolution.ratio : undefined;
};

export const getProductSellableUnits = (product: ProductUnitShape) => {
  return uniqueUnits([
    product.selling_unit,
    ...(product.sellable_units || []),
    ...getLegacyProductMappingUnits(product.unit_mappings),
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
    ...normalizeProductUnitMappings(product).flatMap((mapping) => [mapping.from_unit, mapping.to_unit]),
  ]);
};

/** Satuan yang terpilih otomatis saat produk masuk keranjang atau dokumen. */
export const getProductDefaultUnit = (product: ProductUnitShape): ProductUnit => {
  const sellableUnits = getProductSellableUnits(product);
  const sellingUnit = normalizeUnitKey(product.selling_unit);

  if (sellingUnit && sellableUnits.includes(sellingUnit)) return sellingUnit;
  return sellableUnits[0] ?? normalizeUnit(product.purchase_unit);
};

/**
 * Ratio yang tersimpan sebagai float (mis. 1/12) harus bisa kembali jadi angka
 * bulat yang dulu diketik pengguna, jadi hasil perkalian yang cuma meleset di
 * digit terakhir dibulatkan.
 */
const NEAR_INTEGER_TOLERANCE = 1e-9;

const snapToInteger = (value: number) => {
  const rounded = Math.round(value);
  const scale = Math.max(1, Math.abs(value));
  return Math.abs(value - rounded) <= NEAR_INTEGER_TOLERANCE * scale ? rounded : value;
};

/**
 * Konversi jumlah antar satuan produk. Bedanya dengan `jumlah * ratio` mentah
 * kelihatan saat satuan dasarnya kemasan: ratio pcs→pack adalah 1/12, dan 12
 * pcs harus kembali tepat 1 pack, bukan 0.999999. Mengembalikan `undefined`
 * kalau satuannya tidak nyambung atau konversinya saling bertentangan.
 */
export const convertProductQuantity = (
  product: ProductUnitShape,
  quantity: number,
  fromUnit: ProductUnit,
  toUnit: ProductUnit,
  options: ProductUnitRatioOptions = {},
): number | undefined => {
  const ratio = getProductUnitRatio(product, fromUnit, toUnit, options);
  if (ratio === undefined) return undefined;

  return snapToInteger(quantity * ratio);
};

export const buildSellableUnitsFromMappings = (product: ProductUnitShape) => {
  return getProductSellableUnits({
    ...product,
    sellable_units: product.sellable_units && product.sellable_units.length > 0
      ? product.sellable_units
      : [product.selling_unit],
  });
};
