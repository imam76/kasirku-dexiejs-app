import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildProductSyncQueueItem } from '../../src/services/syncQueueService';
import type { Product } from '../../src/types';

const repoRoot = process.cwd();

const createProduct = (stock: number): Product => ({
  id: 'product-sync-authority',
  name: 'Product Sync Authority',
  purchase_unit: 'pcs',
  selling_unit: 'pcs',
  purchase_price: 1_000,
  selling_price: 2_000,
  stock,
  product_type: 'FINISHED_GOOD',
  is_visible_in_pos: true,
  sellable_units: ['pcs'],
  unit_mappings: [],
  created_at: '2026-08-28T00:00:00.000Z',
  updated_at: '2026-08-28T00:00:00.000Z',
  sync_status: 'pending',
});

describe('stock sync authority', () => {
  test('product queue preserves remote stock by default', () => {
    const queueItem = buildProductSyncQueueItem(createProduct(8), 'update');
    expect(queueItem.payload).toMatchObject({
      stock: 8,
      preserve_stock: true,
    });
  });

  test('keeps an explicit opt-out only for controlled legacy bootstrap', () => {
    const queueItem = buildProductSyncQueueItem(createProduct(8), 'create', {
      preserveStock: false,
    });
    expect(queueItem.payload).toMatchObject({
      stock: 8,
      preserve_stock: false,
    });
  });

  test('routes every operational stock writer through the stock-safe helper', () => {
    const stockWriterFiles = [
      'checkoutService.ts',
      'productionService.ts',
      'purchaseDocumentService.ts',
      'salesDocumentService.ts',
      'salesReturnService.ts',
      'stockOpnameService.ts',
      'transactionVoidService.ts',
    ];

    for (const file of stockWriterFiles) {
      const source = readFileSync(join(repoRoot, 'src', 'services', file), 'utf8');
      expect(source).toContain('enqueueStockAffectedProductsForSync');
      expect(source).not.toContain('enqueuePendingProductsForSync');
    }
  });

  test('protects legacy queue payloads and zeroes ledger-owned remote inserts', () => {
    const syncQueueSource = readFileSync(
      join(repoRoot, 'src', 'services', 'syncQueueService.ts'),
      'utf8',
    );
    const productModelSource = readFileSync(
      join(repoRoot, 'src-tauri', 'src', 'models', 'product.rs'),
      'utf8',
    );
    const productRepositorySource = readFileSync(
      join(repoRoot, 'src-tauri', 'src', 'repositories', 'product_repository.rs'),
      'utf8',
    );

    expect(syncQueueSource).toContain('payload.preserve_stock !== false');
    expect(productModelSource).toContain('default = "default_preserve_stock"');
    expect(productRepositorySource).toContain(
      'resolve_product_insert_stock(input.stock, preserve_stock)',
    );
    expect(productRepositorySource).toContain('.bind(insert_stock)');
  });
});
