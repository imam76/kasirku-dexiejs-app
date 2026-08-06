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

/**
 * Ratio yang tersimpan sebagai float (mis. 0.08333333 dari 1/12) harus bisa
 * kembali jadi angka bulat yang dulu diketik pengguna, jadi hasil pembagian
 * yang cuma meleset di digit terakhir dibulatkan.
 */
const NEAR_INTEGER_TOLERANCE = 1e-6;

const snapToInteger = (value: number) => {
  const rounded = Math.round(value);
  const scale = Math.max(1, Math.abs(value));
  return Math.abs(value - rounded) <= NEAR_INTEGER_TOLERANCE * scale ? rounded : value;
};

export interface UnitMappingPair {
  qty: number;
  base_qty: number;
  ratio: number;
}

/**
 * Menerjemahkan satu ratio jadi pasangan angka yang enak diketik: sisi yang
 * lebih kecil selalu dapat angka 1, jadi `ratio: 12` jadi "1 unit = 12 dasar"
 * dan `ratio: 1/12` jadi "12 unit = 1 dasar" — bukan 0.0833.
 */
export const buildUnitMappingPair = (ratio: number): UnitMappingPair => {
  if (!Number.isFinite(ratio) || ratio <= 0) return { qty: 1, base_qty: 0, ratio: 0 };
  if (ratio >= 1) {
    const baseQty = snapToInteger(ratio);
    return { qty: 1, base_qty: baseQty, ratio: baseQty };
  }

  const qty = snapToInteger(1 / ratio);
  return { qty, base_qty: 1, ratio: 1 / qty };
};

/**
 * Sumber kebenaran satu baris konversi adalah pasangan `qty`/`base_qty` kalau
 * ada; baris lama yang cuma menyimpan `ratio` dibaca sebagai `1 unit = ratio`.
 */
export const resolveUnitMappingPair = (
  mapping: Pick<ProductUnitMapping, 'ratio' | 'qty' | 'base_qty'>,
): UnitMappingPair => {
  const qty = Number(mapping.qty);
  const baseQty = Number(mapping.base_qty);

  if (Number.isFinite(qty) && qty > 0 && Number.isFinite(baseQty) && baseQty > 0) {
    return { qty, base_qty: baseQty, ratio: baseQty / qty };
  }

  return buildUnitMappingPair(Number(mapping.ratio));
};

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

/** Baris konversi yang pasangan angkanya sudah pasti terisi. */
export type NormalizedProductUnitMapping = ProductUnitMapping & { qty: number; base_qty: number };

export const normalizeProductUnitMappings = (product: ProductUnitShape): NormalizedProductUnitMapping[] => {
  const fallbackBaseUnit = normalizeUnit(product.purchase_unit);
  const seen = new Set<string>();

  return (product.unit_mappings || [])
    .map((mapping) => {
      const pair = resolveUnitMappingPair(mapping);

      return {
        unit: normalizeUnit(mapping.unit),
        base_unit: normalizeUnit(mapping.base_unit || fallbackBaseUnit),
        ratio: pair.ratio,
        qty: pair.qty,
        base_qty: pair.base_qty,
      };
    })
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
 * Konversi jumlah antar satuan produk lewat perkalian silang, bukan lewat
 * `jumlah * ratio`. Bedanya kelihatan saat satuan dasarnya kemasan besar:
 * `getProductUnitRatio` harus menyerahkan 1/12 sebagai float, sedangkan di sini
 * pembagiannya cuma sekali di akhir sehingga 12 pcs kembali jadi tepat 1 pack.
 * Mengembalikan `undefined` kalau salah satu satuan tidak punya konversi.
 */
export const convertProductQuantity = (
  product: ProductUnitShape,
  quantity: number,
  fromUnit: ProductUnit,
  toUnit: ProductUnit,
): number | undefined => {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (from === to) return quantity;

  const mappings = normalizeProductUnitMappings(product);
  const baseUnits = uniqueUnits([product.purchase_unit, ...mappings.map((mapping) => mapping.base_unit)]);

  const findPair = (unit: string, baseUnit: string): UnitMappingPair | undefined => {
    if (unit === baseUnit) return { qty: 1, base_qty: 1, ratio: 1 };
    return mappings.find((mapping) => mapping.unit === unit && mapping.base_unit === baseUnit);
  };

  for (const baseUnit of baseUnits) {
    const fromPair = findPair(from, baseUnit);
    const toPair = findPair(to, baseUnit);

    if (fromPair && toPair) {
      return (quantity * fromPair.base_qty * toPair.qty) / (fromPair.qty * toPair.base_qty);
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

    const pair = buildUnitMappingPair(ratio);
    unitMappings.push({ unit, base_unit: baseUnit, ratio: pair.ratio, qty: pair.qty, base_qty: pair.base_qty });
    mappedUnits.add(unit);
  }

  return { unitMappings, droppedUnits };
};
