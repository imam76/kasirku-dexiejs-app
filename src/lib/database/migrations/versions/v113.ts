import { normalizeUnitKey } from '@/constants/units';
import type { Product, UnitConversion } from '@/types';
import { getProductSellableUnits, normalizeProductUnitMappings, resolveProductUnitRatio } from '@/utils/productUnits';
import type { KasirkuDB } from '../../KasirkuDB';

/**
 * Kolom `sellable_units` boleh memuat satuan yang tidak punya konversi ke
 * satuan utama sama sekali. Satuan seperti itu dulu jatuh ke ratio 1, sehingga
 * pembelian 1 box tercatat sebagai 1 pcs dan stoknya salah sejak baris pertama.
 *
 * v110 hanya menormalkan bentuk baris konversi; ia tidak pernah menilai apakah
 * satuannya benar-benar nyambung. Migrasi ini yang membuang satuan tanpa jalur
 * konversi — termasuk yang jalurnya saling bertentangan — supaya daftar satuan
 * di kasir tidak pernah lagi memuat satuan yang stoknya tidak bisa dihitung.
 *
 * Sekalian menormalkan baris yang masih berbentuk lama. Database yang sempat
 * memakai branch pengembangan tidak pernah menjalankan v110 versi rilis, jadi
 * baris `{ unit, base_unit, ratio }` di sana perlu dijemput di sini.
 */
export function registerMigrationV113(db: KasirkuDB) {
  db.version(113).stores({}).upgrade(async (transaction) => {
    const globalConversions = await transaction
      .table<UnitConversion, string>('unitConversions')
      .toArray();

    await transaction.table<Product>('products').toCollection().modify((product) => {
      const unitMappings = normalizeProductUnitMappings(product);
      const candidate = { ...product, unit_mappings: unitMappings };
      const purchaseUnit = normalizeUnitKey(product.purchase_unit) || 'pcs';

      product.unit_mappings = unitMappings;
      product.sellable_units = getProductSellableUnits(candidate).filter((unit) => {
        if (normalizeUnitKey(unit) === purchaseUnit) return true;
        return resolveProductUnitRatio(candidate, unit, purchaseUnit, {
          globalConversions,
        }).status === 'resolved';
      });

      // Satuan jual default ikut dibuang kalau ia termasuk yang tidak nyambung,
      // jadi produknya kembali ke satuan utama alih-alih menunjuk satuan hilang.
      if (!product.sellable_units.includes(normalizeUnitKey(product.selling_unit))) {
        product.selling_unit = product.sellable_units[0] ?? purchaseUnit;
      }
    });
  });
}
