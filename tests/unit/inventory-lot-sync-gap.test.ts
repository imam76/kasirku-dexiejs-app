import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { buildInventoryLotOutboxItem } from '../../src/services/syncQueueService';
import type { InventoryLot } from '../../src/types';

const readSource = (relativePath: string) => readFileSync(
  new URL(`../../${relativePath}`, import.meta.url),
  'utf8',
);

describe('inventory lot sync gap protection', () => {
  test('seeds a new remote lot from received quantity instead of an already-consumed balance', () => {
    const lot: InventoryLot = {
      id: 'lot-parent-1',
      product_id: 'product-1',
      product_name: 'Product 1',
      source_type: 'PURCHASE_RECEIPT',
      source_id: 'purchase-1',
      source_line_id: 'purchase-line-1',
      quantity_received: 10,
      quantity_remaining: 4,
      cost_per_unit: 1_000,
      cost_status: 'FINAL',
      received_at: '2026-08-28T00:00:00.000Z',
      created_at: '2026-08-28T00:00:00.000Z',
      updated_at: '2026-08-28T00:01:00.000Z',
      sync_status: 'pending',
    };

    const queueItem = buildInventoryLotOutboxItem(lot, 'create');

    expect(queueItem.payload).toMatchObject({
      quantity_received: 10,
      quantity_remaining: 10,
    });
  });

  test('marks locally-created and reconstructed opening lots pending', () => {
    const postingSource = readSource('src/services/openingInventoryBalanceService.ts');
    const readSourceText = readSource('src/services/openingBalanceReadService.ts');

    expect(postingSource).toMatch(
      /lotsToCreate\.push\([\s\S]*?source_type:\s*'OPENING'[\s\S]*?sync_status:\s*'pending'/,
    );
    expect(readSourceText).toMatch(
      /const lot: InventoryLot = \{[\s\S]*?source_type:\s*'OPENING'[\s\S]*?sync_status:\s*'pending'/,
    );
  });

  test('normalizes legacy backup lot ledgers before restoring them', () => {
    const backupRestoreSource = readSource('src/utils/backupRestore.ts');

    expect(backupRestoreSource).toContain('normalizeStoredInventoryLot(lot)');
    expect(backupRestoreSource).toContain(
      'normalizeStoredInventoryLotConsumption(consumption)',
    );
    expect(backupRestoreSource).toContain("sync_status: lot.sync_status ?? 'pending'");
    expect(backupRestoreSource).toContain(
      "sync_status: consumption.sync_status ?? 'pending'",
    );
  });

  test('recovers existing status-less rows in the latest Dexie migration', () => {
    const migrationsSource = readSource('src/lib/database/migrations.ts');
    const migrationSource = readSource('src/lib/database/migrations/versions/v129.ts');

    expect(migrationsSource).toContain("import { registerMigrationV129 } from './migrations/versions/v129'");
    expect(migrationsSource).toContain('registerMigrationV129(this)');
    expect(migrationSource).toContain("db.version(129).stores({})");
    expect(migrationSource).toContain("table<InventoryLot>('inventoryLots')");
    expect(migrationSource).toContain(
      "table<InventoryLotConsumption>('inventoryLotConsumptions')",
    );
    expect(migrationSource).toContain("table<SyncQueueItem>('syncQueue')");
    expect(migrationSource).toContain("equals('inventoryLotConsumptions')");
    expect(migrationSource).toContain("queueItem.status = 'pending'");
  });

  test('ensures the parent lot remotely and prioritizes it before consumption', () => {
    const queueSource = readSource('src/services/syncQueueService.ts');

    expect(queueSource).toContain(
      'const localLot = await db.inventoryLots.get(queueItem.payload.lot_id)',
    );
    expect(queueSource).toContain(
      'await inventoryLotPostgresAdapter.upsert(mapInventoryLotToRemoteDto(localLot))',
    );
    expect(queueSource).toContain(
      'if (queueItem.entity === INVENTORY_LOT_ENTITY) return 1',
    );
    expect(queueSource).toContain(
      'if (queueItem.entity === INVENTORY_LOT_CONSUMPTION_ENTITY) return 4',
    );
  });
});
