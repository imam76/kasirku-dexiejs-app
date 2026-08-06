import {
  DEFAULT_CONVERSIONS,
  inferConversionUnitType,
  isLegacyGlobalPackageConversion,
  normalizeUnitKey,
} from '@/constants/units';
import type { CartItem, Product, ProductUnit, UnitConversion, WholesalePrice } from '@/types';
import { resolveProductUnitRatio } from '@/utils/productUnits';

// Global registry for unit conversions
let conversionRegistry: UnitConversion[] = DEFAULT_CONVERSIONS;

const normalizeConversion = (conversion: UnitConversion): UnitConversion => {
  const fromUnit = normalizeUnitKey(conversion.fromUnit);
  const toUnit = normalizeUnitKey(conversion.toUnit);
  const unitType = conversion.unitType ?? inferConversionUnitType(fromUnit, toUnit);

  return {
    ...conversion,
    fromUnit,
    toUnit,
    unitType,
    scope: conversion.scope ?? 'global',
    allowPriceFallback: conversion.allowPriceFallback ?? unitType === 'measurement',
    isDeprecated: conversion.isDeprecated || isLegacyGlobalPackageConversion({ ...conversion, fromUnit, toUnit }),
  };
};

/**
 * Update the global conversion registry
 */
export const setConversionRegistry = (conversions: UnitConversion[]) => {
  conversionRegistry = conversions.map(normalizeConversion);
};

const findConversionRatio = (from: ProductUnit, ke: ProductUnit): number | undefined => {
  const normalizedFrom = normalizeUnitKey(from);
  const normalizedTo = normalizeUnitKey(ke);
  if (normalizedFrom === normalizedTo) return 1;

  const conversion = conversionRegistry.find(c => c.fromUnit === normalizedFrom && c.toUnit === normalizedTo);
  if (conversion) return conversion.ratio;

  const reverseConversion = conversionRegistry.find(c => c.fromUnit === normalizedTo && c.toUnit === normalizedFrom);
  if (reverseConversion) return 1 / reverseConversion.ratio;

  return undefined;
};

export const hasConversionRatio = (from: ProductUnit, ke: ProductUnit): boolean => {
  return findConversionRatio(from, ke) !== undefined;
};

/**
 * Get conversion ratio between two units
 */
export const getConversionRatio = (from: ProductUnit, ke: ProductUnit): number => {
  return findConversionRatio(from, ke) ?? 1; // Fallback to 1 if not found
};

export const getConversionRatioForProduct = (product: Product, from: ProductUnit, ke: ProductUnit): number => {
  const resolution = resolveProductUnitRatio(product, from, ke, {
    globalConversions: conversionRegistry,
  });
  if (resolution.status === 'inconsistent') {
    throw new Error(`Konversi satuan produk ${product.name} saling bertentangan.`);
  }
  return resolution.status === 'resolved' ? resolution.ratio : 1;
};

export const hasConversionRatioForProduct = (product: Product, from: ProductUnit, ke: ProductUnit): boolean => {
  return resolveProductUnitRatio(product, from, ke, {
    globalConversions: conversionRegistry,
  }).status === 'resolved';
};

/**
 * Konversi nilai antar satuan dinamis
 */
export const konversiSatuan = (nilai: number, dari: ProductUnit, ke: ProductUnit): number => {
  if (dari === ke) return nilai;
  const ratio = getConversionRatio(dari, ke);
  return nilai * ratio;
};

export const konversiSatuanProduk = (
  nilai: number,
  product: Product,
  dari: ProductUnit,
  ke: ProductUnit,
): number => {
  if (dari === ke) return nilai;
  const ratio = getConversionRatioForProduct(product, dari, ke);
  return nilai * ratio;
};

/**
 * Normalisasi harga dari satu satuan ke satuan lain
 * Contoh: Harga 36000 per kg -> Normalisasi ke gram -> 36 per gram
 */
export const normalisasiHarga = (harga: number, dariSatuan: ProductUnit, keSatuan: ProductUnit): number => {
  if (dariSatuan === keSatuan) return harga;
  
  // Kita ingin tahu harga per 1 unit target.
  // Jika harga per 1 unit 'dari' adalah X, maka harga per 1 unit 'ke' adalah X / (1 unit 'dari' dalam 'ke')
  const satuUnitDariDalamKe = getConversionRatio(dariSatuan, keSatuan);
  return harga / satuUnitDariDalamKe;
};

export const normalisasiHargaProduk = (
  harga: number,
  product: Product,
  dariSatuan: ProductUnit,
  keSatuan: ProductUnit,
): number => {
  if (dariSatuan === keSatuan) return harga;

  const satuUnitDariDalamKe = getConversionRatioForProduct(product, dariSatuan, keSatuan);
  return harga / satuUnitDariDalamKe;
};

/**
 * Hitung total harga jual berdasarkan produk dan jumlah (quantity)
 */
export const hitungHargaJual = (product: Product, quantity: number, unit?: ProductUnit): number => {
  const pricePerUnit = getPrice(product, quantity, unit);
  return pricePerUnit * quantity;
};

/** Satuan yang dipakai oleh min_quantity sebuah tier grosir. */
const getTierUnit = (product: Product, tier: WholesalePrice): ProductUnit => (
  tier.unit || product.selling_unit
);

/**
 * Satuan yang dipakai oleh nominal harga tier. Tier baru memakai unit yang
 * dipilih. Baris lama tanpa unit tetap dibaca sebagai harga per purchase_unit
 * agar data historis tidak berubah arti, kecuali bundle yang sejak dulu memakai
 * selling_unit.
 */
const getTierPriceUnit = (product: Product, tier: WholesalePrice): ProductUnit => (
  (tier.unit || tier.price_type === 'bundle') ? getTierUnit(product, tier) : product.purchase_unit
);

/**
 * Tier yang satuannya tidak punya persamaan konversi ke satuan target tidak bisa
 * dihargai. Memakainya berarti diam-diam menganggap 1 pcs = 1 box, jadi tier
 * seperti itu diabaikan dan harga jatuh ke harga dasar.
 */
const getUsableTiers = (product: Product, targetUnit: ProductUnit): WholesalePrice[] => (
  (product.wholesale_prices || []).filter((tier) => (
    hasConversionRatioForProduct(product, getTierUnit(product, tier), targetUnit) &&
    hasConversionRatioForProduct(product, getTierPriceUnit(product, tier), targetUnit)
  ))
);

/** Harga satuan sebuah tier, dinormalisasi ke satuan target. */
const getTierPricePerUnit = (product: Product, tier: WholesalePrice, targetUnit: ProductUnit): number => {
  const priceUnit = getTierPriceUnit(product, tier);
  const pricePerTierUnit = tier.price_type === 'bundle'
    ? tier.price / tier.min_quantity
    : tier.price;

  return normalisasiHargaProduk(pricePerTierUnit, product, priceUnit, targetUnit);
};

/** Harga jual dasar per satuan target, tanpa memperhitungkan tier grosir. */
export const getBasePrice = (product: Product, unit?: ProductUnit): number => {
  const targetUnit = unit || product.selling_unit;
  return normalisasiHargaProduk(product.selling_price, product, product.purchase_unit, targetUnit);
};

export const getPrice = (product: Product, quantity: number, unit?: ProductUnit): number => {
  const targetUnit = unit || product.selling_unit;
  const usableTiers = getUsableTiers(product, targetUnit);

  if (usableTiers.length > 0) {
    const sortedTiers = [...usableTiers].sort((a, b) => {
      const thresholdA = konversiSatuanProduk(a.min_quantity, product, getTierUnit(product, a), targetUnit);
      const thresholdB = konversiSatuanProduk(b.min_quantity, product, getTierUnit(product, b), targetUnit);

      return thresholdB - thresholdA;
    });
    const match = sortedTiers.find((tier) => {
      const quantityInTierUnit = konversiSatuanProduk(
        quantity,
        product,
        targetUnit,
        getTierUnit(product, tier),
      );

      return quantityInTierUnit >= tier.min_quantity;
    });

    if (match) return getTierPricePerUnit(product, match, targetUnit);
  }

  return getBasePrice(product, targetUnit);
};

/** Harga grosir termurah per satuan target, untuk petunjuk "grosir mulai Rp X". */
export const getLowestWholesalePrice = (product: Product, unit?: ProductUnit): number | undefined => {
  const targetUnit = unit || product.selling_unit;
  const tierPrices = getUsableTiers(product, targetUnit)
    .map((tier) => getTierPricePerUnit(product, tier, targetUnit))
    .filter((price) => Number.isFinite(price));

  return tierPrices.length > 0 ? Math.min(...tierPrices) : undefined;
};

export type ProductDisplayPricing = {
  /** Harga jual dasar per satuan jual — nominal yang sama dengan Master Data. */
  basePrice: number;
  /** Harga tier termurah, hanya diisi bila benar-benar lebih murah dari basePrice. */
  wholesaleFromPrice?: number;
};

/**
 * Harga untuk katalog. Persamaan konversi yang saling bertentangan tidak boleh
 * menjatuhkan seluruh halaman, jadi kembalikan harga jual apa adanya dan biarkan
 * form produk yang melaporkan konfliknya.
 */
export const getProductDisplayPricing = (product: Product, unit?: ProductUnit): ProductDisplayPricing => {
  try {
    const basePrice = getBasePrice(product, unit);
    const wholesaleFromPrice = getLowestWholesalePrice(product, unit);

    return wholesaleFromPrice !== undefined && wholesaleFromPrice < basePrice
      ? { basePrice, wholesaleFromPrice }
      : { basePrice };
  } catch {
    return { basePrice: product.selling_price };
  }
};

export const getPurchasePrice = (product: Product, unit?: ProductUnit): number => {
  const targetUnit = unit || product.purchase_unit;
  return normalisasiHargaProduk(product.purchase_price, product, product.purchase_unit, targetUnit);
};

/**
 * Materialize the implicit unit used by wholesale rows written before tiers
 * stored their own unit. Legacy unit-price rows stored a price per purchase
 * unit while their threshold used the selling unit, so the price must be
 * converted before the unit is persisted explicitly.
 */
export const materializeWholesalePriceUnits = (
  product: Product,
  globalConversions: ReadonlyArray<Pick<UnitConversion, 'fromUnit' | 'toUnit' | 'ratio'>> = conversionRegistry,
): NonNullable<Product['wholesale_prices']> => {
  return (product.wholesale_prices || []).map((price) => {
    if (price.unit) return { ...price };

    const unit = product.selling_unit || product.purchase_unit;
    const priceType = price.price_type || 'unit';
    if (priceType === 'bundle') {
      return { ...price, unit, price_type: priceType };
    }

    const resolution = resolveProductUnitRatio(product, product.purchase_unit, unit, {
      globalConversions,
    });
    const normalizedPrice = resolution.status === 'resolved'
      ? price.price / resolution.ratio
      : price.price;

    return {
      ...price,
      unit,
      price: normalizedPrice,
      price_type: priceType,
    };
  });
};

export const getCartItemOriginalPrice = (item: CartItem): number => {
  return getPrice(item.product, item.quantity, item.unit);
};

export const getCartItemPrice = (item: CartItem): number => {
  return getCartItemOriginalPrice(item);
};
