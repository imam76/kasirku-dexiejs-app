import {
  DEFAULT_CONVERSIONS,
  inferConversionUnitType,
  isLegacyGlobalPackageConversion,
  normalizeUnitKey,
} from '@/constants/units';
import type { CartItem, Product, ProductUnit, UnitConversion } from '@/types';
import { getProductUnitRatio } from '@/utils/productUnits';

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
  const unitType = inferConversionUnitType(from, ke);
  const globalRatio = findConversionRatio(from, ke);

  if (unitType !== 'package' && globalRatio !== undefined) {
    return globalRatio;
  }

  return getProductUnitRatio(product, from, ke) ?? (unitType !== 'package' ? globalRatio : undefined) ?? 1;
};

export const hasConversionRatioForProduct = (product: Product, from: ProductUnit, ke: ProductUnit): boolean => {
  const unitType = inferConversionUnitType(from, ke);
  if (unitType !== 'package' && hasConversionRatio(from, ke)) return true;
  return getProductUnitRatio(product, from, ke) !== undefined;
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

export const getPrice = (product: Product, quantity: number, unit?: ProductUnit): number => {
  const targetUnit = unit || product.selling_unit;
  
  // 1. Tentukan harga dasar per SELLING_UNIT
  // Default: ambil dari selling_price (per purchase_unit) lalu normalisasi ke selling_unit
  let priceInSellingUnit = normalisasiHargaProduk(product.selling_price, product, product.purchase_unit, product.selling_unit);

  if (product.wholesale_prices && product.wholesale_prices.length > 0) {
    // Untuk cek tier grosir, konversi quantity ke selling_unit
    const quantityInSellingUnit = konversiSatuanProduk(quantity, product, targetUnit, product.selling_unit);
    
    const sortedPrices = [...product.wholesale_prices].sort((a, b) => b.min_quantity - a.min_quantity);
    const match = sortedPrices.find(p => quantityInSellingUnit >= p.min_quantity);

    if (match) {
      if (match.price_type === 'bundle') {
        // Jika paket, harga di DB adalah total untuk min_quantity. Jadi harga per selling_unit = total / qty
        priceInSellingUnit = match.price / match.min_quantity;
      } else {
        // Jika unit, harga di DB adalah per purchase_unit. Normalisasi ke selling_unit
        priceInSellingUnit = normalisasiHargaProduk(match.price, product, product.purchase_unit, product.selling_unit);
      }
    }
  }
  
  // 2. Normalisasi dari selling_unit ke target unit (jika berbeda, misal dari gram ke ons)
  return normalisasiHargaProduk(priceInSellingUnit, product, product.selling_unit, targetUnit);
};

export const getPurchasePrice = (product: Product, unit?: ProductUnit): number => {
  const targetUnit = unit || product.purchase_unit;
  return normalisasiHargaProduk(product.purchase_price, product, product.purchase_unit, targetUnit);
};

export const getCartItemOriginalPrice = (item: CartItem): number => {
  return getPrice(item.product, item.quantity, item.unit);
};

export const getCartItemPrice = (item: CartItem): number => {
  return item.custom_price ?? getCartItemOriginalPrice(item);
};
