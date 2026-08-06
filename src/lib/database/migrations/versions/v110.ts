import { normalizeUnitKey } from '@/constants/units';
import type { Product, ProductUnit, UnitConversion } from '@/types';
import { buildUnitMappingsFromLegacyUnits, getProductDefaultUnit, getProductUnits } from '@/utils/productUnits';
import type { KasirkuDB } from '../../KasirkuDB';

/**
 * Satuan transaksi sekarang hanya berasal dari satuan dasar plus baris
 * `unit_mappings`. Kolom lama `sellable_units` boleh memuat satuan tanpa ratio,
 * dan satuan seperti itu membuat pembelian 1 box tercatat 1 pcs karena konversi
 * jatuh ke 1. Migrasi ini mengangkat satuan lama menjadi baris konversi
 * eksplisit selama rationya bisa diambil dari konversi global, dan membuang
 * satuan yang rationya memang tidak pernah diketahui.
 */
export function registerMigrationV110(db: KasirkuDB) {
  db.version(110).stores({}).upgrade(async (transaction) => {
    const conversions = await transaction.table<UnitConversion, string>('unitConversions').toArray();

    const resolveGlobalRatio = (unit: ProductUnit, baseUnit: ProductUnit): number | undefined => {
      const from = normalizeUnitKey(unit);
      const to = normalizeUnitKey(baseUnit);
      if (!from || !to) return undefined;
      if (from === to) return 1;

      const direct = conversions.find(
        (conversion) => normalizeUnitKey(conversion.fromUnit) === from && normalizeUnitKey(conversion.toUnit) === to,
      );
      if (direct && Number(direct.ratio) > 0) return Number(direct.ratio);

      const reverse = conversions.find(
        (conversion) => normalizeUnitKey(conversion.fromUnit) === to && normalizeUnitKey(conversion.toUnit) === from,
      );
      if (reverse && Number(reverse.ratio) > 0) return 1 / Number(reverse.ratio);

      return undefined;
    };

    await transaction.table<Product>('products').toCollection().modify((product) => {
      const { unitMappings } = buildUnitMappingsFromLegacyUnits(product, resolveGlobalRatio);

      product.unit_mappings = unitMappings;
      product.sellable_units = getProductUnits({
        purchase_unit: product.purchase_unit,
        unit_mappings: unitMappings,
      });
      product.selling_unit = getProductDefaultUnit({
        purchase_unit: product.purchase_unit,
        selling_unit: product.selling_unit,
        unit_mappings: unitMappings,
      });
    });
  });
}
