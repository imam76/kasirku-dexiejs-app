import { Product, ProductUnit, UnitConversion } from '@/types';

// Global registry for unit conversions
let conversionRegistry: UnitConversion[] = [
  { id: 'kg-gram', fromUnit: 'kg', toUnit: 'gram', ratio: 1000, isPreset: true, label: '1 kg = 1000 gram' },
  { id: 'gram-kg', fromUnit: 'gram', toUnit: 'kg', ratio: 0.001, isPreset: true, label: '1 gram = 0.001 kg' },
  { id: 'ons-gram', fromUnit: 'ons', toUnit: 'gram', ratio: 100, isPreset: true, label: '1 ons = 100 gram' },
  { id: 'kg-ons', fromUnit: 'kg', toUnit: 'ons', ratio: 10, isPreset: true, label: '1 kg = 10 ons' },
];

/**
 * Update the global conversion registry
 */
export const setConversionRegistry = (conversions: UnitConversion[]) => {
  conversionRegistry = conversions;
};

/**
 * Get conversion ratio between two units
 */
export const getConversionRatio = (from: ProductUnit, ke: ProductUnit): number => {
  if (from === ke) return 1;
  
  const conversion = conversionRegistry.find(c => c.fromUnit === from && c.toUnit === ke);
  if (conversion) return conversion.ratio;

  // Try reverse conversion
  const reverseConversion = conversionRegistry.find(c => c.fromUnit === ke && c.toUnit === from);
  if (reverseConversion) return 1 / reverseConversion.ratio;

  return 1; // Fallback to 1 if not found
};

/**
 * Konversi nilai antar satuan dinamis
 */
export const konversiSatuan = (nilai: number, dari: ProductUnit, ke: ProductUnit): number => {
  if (dari === ke) return nilai;
  const ratio = getConversionRatio(dari, ke);
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
  let priceInSellingUnit = normalisasiHarga(product.selling_price, product.purchase_unit, product.selling_unit);

  if (product.wholesale_prices && product.wholesale_prices.length > 0) {
    // Untuk cek tier grosir, konversi quantity ke selling_unit
    const quantityInSellingUnit = konversiSatuan(quantity, targetUnit, product.selling_unit);
    
    const sortedPrices = [...product.wholesale_prices].sort((a, b) => b.min_quantity - a.min_quantity);
    const match = sortedPrices.find(p => quantityInSellingUnit >= p.min_quantity);

    if (match) {
      if (match.price_type === 'bundle') {
        // Jika paket, harga di DB adalah total untuk min_quantity. Jadi harga per selling_unit = total / qty
        priceInSellingUnit = match.price / match.min_quantity;
      } else {
        // Jika unit, harga di DB adalah per purchase_unit. Normalisasi ke selling_unit
        priceInSellingUnit = normalisasiHarga(match.price, product.purchase_unit, product.selling_unit);
      }
    }
  }
  
  // 2. Normalisasi dari selling_unit ke target unit (jika berbeda, misal dari gram ke ons)
  return normalisasiHarga(priceInSellingUnit, product.selling_unit, targetUnit);
};
