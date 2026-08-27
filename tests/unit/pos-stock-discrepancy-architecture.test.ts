import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const checkoutSource = readFileSync(
  new URL('../../src/services/checkoutService.ts', import.meta.url),
  'utf8',
);
const serverMigration = readFileSync(
  new URL('../../src-tauri/migrations/0087_pos_stock_discrepancies.sql', import.meta.url),
  'utf8',
);
const stockMutationRepository = readFileSync(
  new URL('../../src-tauri/src/repositories/stock_mutation_repository.rs', import.meta.url),
  'utf8',
);

describe('POS stock discrepancy architecture', () => {
  test('rechecks current stock and persists business records with transactional outbox', () => {
    expect(checkoutSource).toContain('preparePhysicalStockDiscrepancies');
    expect(checkoutSource).toContain('db.posStockDiscrepancies');
    expect(checkoutSource).toContain('db.stockMutations');
    expect(checkoutSource).toContain('db.syncQueue');
    expect(checkoutSource).toContain('buildTransactionBundleOutboxItem');
    expect(checkoutSource).toContain('buildInventoryLotOutboxItem');
    expect(checkoutSource).toContain('buildInventoryLotConsumptionOutboxItem');
  });

  test('creates only an estimated lot for the exact shortage and preserves remote stock snapshots', () => {
    expect(checkoutSource).toContain('quantityReceived: row.shortageQuantity');
    expect(checkoutSource).toContain("costStatus: 'ESTIMATED'");
    expect(checkoutSource).toContain('quantityDelta: row.shortageQuantity');
    expect(checkoutSource).toContain('enqueueStockAffectedProductsForSync(touchedProductIds)');
  });

  test('keeps stock mutation retry idempotent on the server', () => {
    expect(stockMutationRepository).toContain('mutation_already_exists');
    expect(stockMutationRepository).toContain('ON CONFLICT (id) DO NOTHING');
    expect(stockMutationRepository).toContain('matches_idempotent_payload');
  });

  test('creates a constrained realtime review table and grants review only to supervisors', () => {
    expect(serverMigration).toContain('CREATE TABLE IF NOT EXISTS pos_stock_discrepancies');
    expect(serverMigration).toContain("observation = 'PHYSICAL_ITEM_PRESENT'");
    expect(serverMigration).toContain("status IN ('PENDING_REVIEW', 'REVIEWED', 'NEEDS_INVESTIGATION')");
    expect(serverMigration).toContain('shortage_quantity > 0');
    expect(serverMigration).toContain("role.code IN ('OWNER', 'ADMIN')");
    expect(serverMigration).toContain('CREATE TRIGGER kasirku_notify_data_change');
  });
});
