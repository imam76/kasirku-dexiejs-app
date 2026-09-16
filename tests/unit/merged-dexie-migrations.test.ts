import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import type { Product } from '@/types';
import {
  migrateProductUnitRecord,
  migrateProductUnitSyncPayload,
} from '@/lib/database/migrations/versions/v110';

const readMigration = (version: number) => readFileSync(
  new URL(`../../src/lib/database/migrations/versions/v${version}.ts`, import.meta.url),
  'utf8',
);

describe('merged Dexie migration order', () => {
  test('keeps accounting v106 and moves restaurant migrations to unique later versions', () => {
    const migration106 = readMigration(106);
    const migration107 = readMigration(107);
    const migration108 = readMigration(108);
    const migration109 = readMigration(109);
    const migration110 = readMigration(110);

    expect(migration106).toContain('db.version(106)');
    expect(migration106).toContain('applyLegacyInventoryOpeningBalanceCompatibility');
    expect(migration107).toContain('db.version(107)');
    expect(migration107).toContain('restaurantSessions');
    expect(migration108).toContain('db.version(108)');
    expect(migration108).toContain('restaurantTables');
    expect(migration109).toContain('db.version(109)');
    expect(migration109).toContain('product_type');
    expect(migration110).toContain('db.version(110)');
    expect(migration110).toContain('normalizeProductUnitMappings');
  });

  test('adds bounded ledger and report indexes after the POS read models', () => {
    const migration136 = readMigration(136);

    expect(migration136).toContain('db.version(136)');
    expect(migration136).toContain('[account_id+entry_date+id]');
    expect(migration136).toContain('[type+created_at+id]');
    expect(migration136).toContain('BACKFILL_BATCH_SIZE');
    expect(migration136).toContain('entriesTable.bulkGet(entryIds)');
  });

  test('adds keyset indexes for transaction and cash-bank history', () => {
    const migration137 = readMigration(137);

    expect(migration137).toContain('db.version(137)');
    expect(migration137).toContain('[type+document_date+id]');
    expect(migration137).toContain('[account_id+created_at+id]');
    expect(migration137).toContain('[cash_account_id+statement_date+id]');
    expect(migration137).toContain('reversal_of_transfer_group_id');
  });

  test('adds cursor-ready product list projections after transaction indexes', () => {
    const migration138 = readMigration(138);

    expect(migration138).toContain('db.version(138)');
    expect(migration138).toContain("[name+id]");
    expect(migration138).toContain('[category+name+id]');
    expect(migration138).toContain('[created_at+id]');
    expect(migration138).toContain('*search_keys');
    expect(migration138).toContain('PRODUCT_BACKFILL_BATCH_SIZE');
  });

  test('migrates legacy product and pending-sync equations losslessly and idempotently', () => {
    const legacyProduct = {
      id: 'legacy-product',
      name: 'Produk Legacy',
      purchase_unit: 'pcs',
      selling_unit: 'pcs',
      purchase_price: 1_000,
      selling_price: 2_000,
      stock: 12,
      product_type: 'FINISHED_GOOD',
      is_visible_in_pos: true,
      unit_mappings: [{ unit: 'dus', base_unit: 'pcs', ratio: 12 }],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    } as unknown as Product;
    const migrated = migrateProductUnitRecord(legacyProduct);

    expect(migrated.sellable_units).toEqual(['pcs', 'dus']);
    expect(migrated.unit_mappings).toEqual([{
      from_quantity: 1,
      from_unit: 'dus',
      to_quantity: 12,
      to_unit: 'pcs',
    }]);
    expect(migrateProductUnitRecord(migrated)).toEqual(migrated);

    const migratedPayload = migrateProductUnitSyncPayload({
      id: legacyProduct.id,
      purchase_unit: 'pcs',
      selling_unit: 'pcs',
      unit_mappings: [{ unit: 'dus', base_unit: 'pcs', ratio: 12 }],
    });
    expect(migratedPayload).toMatchObject({
      sellable_units: ['pcs', 'dus'],
      unit_mappings: migrated.unit_mappings,
    });
    expect(migrateProductUnitSyncPayload(migratedPayload)).toEqual(migratedPayload);

    const invalidLegacyProduct = {
      ...legacyProduct,
      unit_mappings: [{ unit: 'dus', base_unit: 'pcs', ratio: 0 }],
    } as unknown as Product;
    expect(migrateProductUnitRecord(invalidLegacyProduct)).toMatchObject({
      sellable_units: ['pcs'],
      unit_mappings: [],
    });
  });
});
