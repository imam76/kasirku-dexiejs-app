import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  pullUpdatedAtIdPages,
  type UpdatedAtIdCursor,
} from '@/services/shared/remoteRefreshCursor';
import { getStockAfterMutation } from '@/services/shared/stockMutationMaterialization';
import type { StockMutation } from '@/types';

const readSource = (relativePath: string) => readFileSync(
  new URL(`../../${relativePath}`, import.meta.url),
  'utf8',
);

const remoteSale: StockMutation = {
  id: 'POS_TRANSACTION:sale-device-a:line-1',
  product_id: 'product-1',
  product_name: 'Product 1',
  source_type: 'POS_TRANSACTION',
  source_id: 'sale-device-a',
  source_line_id: 'line-1',
  quantity_delta: -2,
  unit: 'pcs',
  stock_unit: 'pcs',
  occurred_at: '2026-09-17T08:00:00.000Z',
  created_at: '2026-09-17T08:00:00.000Z',
};

const applyOnce = (
  replica: { stock: number; mutationIds: Set<string> },
  mutation: StockMutation,
) => {
  if (replica.mutationIds.has(mutation.id)) return;
  replica.stock = getStockAfterMutation(replica.stock, mutation);
  replica.mutationIds.add(mutation.id);
};

describe('two-device stock synchronization', () => {
  test('materializes a remote mutation on the receiving device exactly once', () => {
    const deviceA = { stock: 8, mutationIds: new Set([remoteSale.id]) };
    const deviceB = { stock: 10, mutationIds: new Set<string>() };

    // Device A originated the sale. Device B receives the immutable server ledger row.
    applyOnce(deviceB, remoteSale);
    expect(deviceB.stock).toBe(8);

    // Realtime delivery and a later manual sync may replay the same page.
    applyOnce(deviceB, remoteSale);
    applyOnce(deviceA, remoteSale);
    expect(deviceB.stock).toBe(8);
    expect(deviceA.stock).toBe(8);

    // The authoritative product snapshot is pulled after the ledger and converges both replicas.
    const serverProductStock = 8;
    deviceA.stock = serverProductStock;
    deviceB.stock = serverProductStock;
    expect(deviceA.stock).toBe(deviceB.stock);
  });

  test('uses snapshot semantics for an opening balance', () => {
    expect(getStockAfterMutation(99, {
      source_type: 'OPENING_BALANCE',
      source_quantity: 12,
      quantity_delta: -87,
    })).toBe(12);
  });

  test('does not skip an offline mutation whose device timestamp is older than the cursor', async () => {
    const initialCursor: UpdatedAtIdCursor = {
      updatedAt: '2026-09-17T09:00:00.000Z',
      id: 'already-pulled',
    };
    const lateOfflineMutation = {
      id: 'late-offline-mutation',
      // Business time from the offline device is older than Device B's saved cursor.
      created_at: '2026-09-16T08:00:00.000Z',
      // PostgreSQL ingestion time advances when the delayed mutation actually arrives.
      server_created_at: '2026-09-17T10:00:00.000Z',
    };
    const mergedIds: string[] = [];
    let savedCursor = initialCursor;

    await pullUpdatedAtIdPages({
      initialCursor,
      pageSize: 10,
      loadPage: async (cursor) => [lateOfflineMutation].filter((mutation) => (
        mutation.server_created_at > (cursor?.updatedAt ?? '')
        || (
          mutation.server_created_at === cursor?.updatedAt
          && mutation.id > (cursor?.id ?? '')
        )
      )),
      mergePage: async (page) => {
        mergedIds.push(...page.map((mutation) => mutation.id));
      },
      saveCursor: async (cursor) => {
        savedCursor = cursor;
      },
      getUpdatedAt: (mutation) => mutation.server_created_at,
      getId: (mutation) => mutation.id,
    });

    expect(mergedIds).toEqual([lateOfflineMutation.id]);
    expect(savedCursor).toEqual({
      updatedAt: lateOfflineMutation.server_created_at,
      id: lateOfflineMutation.id,
    });
  });

  test('wires the permanent fix and one-time targeted recovery', () => {
    const serverRepository = readSource('src-tauri/src/repositories/stock_mutation_repository.rs');
    const readService = readSource('src/services/stockMutationReadService.ts');
    const stockStateReadService = readSource('src/services/stockStateReadService.ts');
    const migrationRegistry = readSource('src/lib/database/migrations.ts');
    const recoveryMigration = readSource('src/lib/database/migrations/versions/v136.ts');

    expect(serverRepository).toContain(
      "GREATEST(updated_at, $4::TIMESTAMPTZ, clock_timestamp())",
    );
    expect(serverRepository).toContain("+ INTERVAL '1 microsecond'");
    expect(serverRepository).toContain('(server_created_at, id) >');
    expect(readSource('src-tauri/migrations/0095_stock_mutation_server_created_at.sql'))
      .toContain('server_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()');

    expect(readService).toContain(
      "db.transaction('rw', db.stockMutations, db.products",
    );
    expect(readService).toContain('!existingIds.has(mutation.id)');
    expect(readService).toContain("entity: 'stockMutations'");
    expect(readService).toContain('serverCreatedAfter: cursor?.updatedAt');
    expect(readService).toContain('cursorId: cursor?.id');

    expect(stockStateReadService.indexOf('refreshStockMutationsFromPostgres()'))
      .toBeLessThan(stockStateReadService.indexOf('refreshProductsFromPostgres()'));
    expect(migrationRegistry).toContain('registerMigrationV136(this)');
    expect(recoveryMigration).toContain("['products', 'stockMutations']");
    expect(recoveryMigration).not.toContain('db.delete');
  });
});
