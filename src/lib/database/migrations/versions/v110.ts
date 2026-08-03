import type { Product, ProductUnit, SyncQueueItem } from '@/types';
import { getProductSellableUnits, normalizeProductUnitMappings } from '@/utils/productUnits';
import type { KasirkuDB } from '../../KasirkuDB';

const normalizeMappings = (unitMappings: unknown, purchaseUnit: ProductUnit) => (
  normalizeProductUnitMappings({
    purchase_unit: purchaseUnit,
    selling_unit: purchaseUnit,
    sellable_units: [],
    unit_mappings: unitMappings,
  })
);

export const migrateProductUnitRecord = (product: Product): Product => {
  if (!Array.isArray(product.unit_mappings)) return product;

  return {
    ...product,
    sellable_units: getProductSellableUnits(product),
    unit_mappings: normalizeMappings(product.unit_mappings, product.purchase_unit || 'pcs'),
  };
};

export const migrateProductUnitSyncPayload = (payload: unknown): unknown => {
  if (!payload || typeof payload !== 'object') return payload;

  const productPayload = payload as Record<string, unknown>;
  if (!Array.isArray(productPayload.unit_mappings)) return payload;

  const purchaseUnit = typeof productPayload.purchase_unit === 'string' ? productPayload.purchase_unit : 'pcs';
  const sellingUnit = typeof productPayload.selling_unit === 'string' ? productPayload.selling_unit : purchaseUnit;
  return {
    ...productPayload,
    sellable_units: getProductSellableUnits({
      purchase_unit: purchaseUnit,
      selling_unit: sellingUnit,
      sellable_units: Array.isArray(productPayload.sellable_units)
        ? productPayload.sellable_units.filter((unit): unit is string => typeof unit === 'string')
        : [],
      unit_mappings: productPayload.unit_mappings,
    }),
    unit_mappings: normalizeMappings(productPayload.unit_mappings, purchaseUnit),
  };
};

export function registerMigrationV110(db: KasirkuDB) {
  db.version(110).stores({}).upgrade(async (transaction) => {
    await transaction.table<Product>('products').toCollection().modify((product) => {
      const migratedProduct = migrateProductUnitRecord(product);
      product.sellable_units = migratedProduct.sellable_units;
      product.unit_mappings = migratedProduct.unit_mappings;
    });

    await transaction.table<SyncQueueItem>('syncQueue').toCollection().modify((queueItem) => {
      if (queueItem.entity !== 'products') return;
      queueItem.payload = migrateProductUnitSyncPayload(queueItem.payload);
    });
  });
}
