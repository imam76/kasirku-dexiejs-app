import { Product, ProductUnit } from '@/types';

/**
 * Konversi nilai antar satuan berat (gram, kg, ons)
 */
export const konversiSatuan = (nilai: number, dari: ProductUnit, ke: ProductUnit): number => {
  if (dari === ke) return nilai;

  // Konversi semuanya ke gram dulu sebagai base
  let nilaiGram = nilai;
  if (dari === 'kg') nilaiGram = nilai * 1000;
  else if (dari === 'ons') nilaiGram = nilai * 100;
  
  // Konversi dari gram ke unit target
  if (ke === 'kg') return nilaiGram / 1000;
  if (ke === 'ons') return nilaiGram / 100;
  if (ke === 'gram') return nilaiGram;

  return nilai; // Jika satuan bukan berat (pcs, ikat, dll)
};

/**
 * Normalisasi harga dari satu satuan ke satuan lain
 * Contoh: Harga 36000 per kg -> Normalisasi ke gram -> 36 per gram
 */
export const normalisasiHarga = (harga: number, dariSatuan: ProductUnit, keSatuan: ProductUnit): number => {
  if (dariSatuan === keSatuan) return harga;

  // Jika konversi antar satuan berat
  const beratUnits: ProductUnit[] = ['gram', 'kg', 'ons'];
  if (beratUnits.includes(dariSatuan) && beratUnits.includes(keSatuan)) {
    // Kita ingin tahu harga per 1 unit target.
    // Jika harga per 1000g (1kg) adalah 36000, maka harga per 1g adalah 36000/1000.
    // Rasio konversi: 1 unit 'dari' = X unit 'ke'
    const satuUnitDariDalamKe = konversiSatuan(1, dariSatuan, keSatuan);
    return harga / satuUnitDariDalamKe;
  }

  return harga;
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
