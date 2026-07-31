import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const readSource = (relativePath: string) => readFileSync(
  new URL(`../../${relativePath}`, import.meta.url),
  'utf8',
);

const readExportedFunction = (source: string, functionName: string) => {
  const start = source.indexOf(`export const ${functionName}`);
  if (start < 0) return { start, source: '' };
  const nextExport = source.indexOf('\nexport const ', start + 1);
  return {
    start,
    source: source.slice(start, nextExport > start ? nextExport : undefined),
  };
};

const inventoryService = readSource('src/services/openingInventoryBalanceService.ts');
const openingBalanceService = readSource('src/services/openingBalanceService.ts');
const openingBalanceReadService = readSource('src/services/openingBalanceReadService.ts');
const stockManagementHook = readSource('src/hooks/useStockManagement.tsx');
const stockManagementPage = readSource('src/view/master-data/products/StockManagement.tsx');
const openingInventoryMigration = readSource(
  'src-tauri/migrations/0067_opening_inventory_balances.sql',
);
const stockMutationRepository = readSource(
  'src-tauri/src/repositories/stock_mutation_repository.rs',
);
const openingBalanceRepository = readSource(
  'src-tauri/src/repositories/opening_balance_repository.rs',
);
const journalEntryRepository = readSource(
  'src-tauri/src/repositories/journal_entry_repository.rs',
);
const accountingSettingRepository = readSource(
  'src-tauri/src/repositories/accounting_setting_repository.rs',
);
const inventoryOpeningBalanceRepository = readSource(
  'src-tauri/src/repositories/inventory_opening_balance_repository.rs',
);
const openingBalanceModel = readSource(
  'src-tauri/src/models/opening_balance.rs',
);
const inventoryOpeningBalanceCommands = readSource(
  'src-tauri/src/commands/opening_balance_commands.rs',
);
const tauriLib = readSource('src-tauri/src/lib.rs');
const postgresAdapter = readSource('src/services/postgresAdapter.ts');
const syncQueueService = readSource('src/services/syncQueueService.ts');

describe('inventory opening-balance accounting controls', () => {
  test('keeps a saved draft free from stock, FIFO, and journal side effects', () => {
    const draftStart = inventoryService.indexOf(
      'export const saveInventoryOpeningBalanceDraft',
    );
    const postStart = inventoryService.indexOf(
      'export const postInventoryOpeningBalance',
    );
    const draftSource = inventoryService.slice(draftStart, postStart);

    expect(draftStart).toBeGreaterThan(-1);
    expect(postStart).toBeGreaterThan(draftStart);
    expect(draftSource).not.toContain('db.products.put');
    expect(draftSource).not.toContain('db.inventoryLots');
    expect(draftSource).not.toContain('postOpeningBalanceSourceJournal');
    expect(draftSource).toContain("status: 'DRAFT'");
  });

  test('posts an exact stock snapshot, FIFO opening lots, and a balanced journal atomically', () => {
    const postStart = inventoryService.indexOf(
      'export const postInventoryOpeningBalance',
    );
    const postSource = inventoryService.slice(postStart);

    expect(postSource).toContain('db.products');
    expect(postSource).toContain('db.inventoryLots');
    expect(postSource).toContain('db.openingBalanceBatches');
    expect(postSource).toContain('db.openingBalanceLines');
    expect(postSource).toContain('db.journalEntries');
    expect(postSource).toContain('db.journalEntryLines');
    expect(postSource).toContain('stock: targetQuantity');
    expect(postSource).toContain("source_type: 'OPENING'");
    expect(postSource).toContain('enqueueInventoryOpeningBalancePostingSync');
    expect(postSource).toContain('db.syncQueue');
    expect(postSource).toContain('account: context.inventoryAccount');
    expect(postSource).toContain('account: context.equityAccount');
    expect(postSource).not.toContain('recordStockPurchase');
    expect(postSource).not.toContain('financeTransactions');
  });

  test('reserves inventory account 1200 for the dedicated module and blocks unsafe generic reversal', () => {
    expect(openingBalanceService).toContain("module: 'INVENTORY'");
    expect(openingBalanceService).toContain("codes: ['1200']");
    expect(openingBalanceService).toContain(
      "existingBatch.module === 'INVENTORY'",
    );
    expect(openingBalanceService).toContain(
      'stok dan lot FIFO ikut terdampak',
    );
  });

  test('round-trips inventory line fields and restores FIFO lots on another device', () => {
    [
      'product_id',
      'product_sku',
      'product_name',
      'quantity',
      'unit_cost',
      'inventory_lot_id',
    ].forEach((field) => {
      expect(openingBalanceReadService).toContain(field);
    });
    expect(openingBalanceReadService).toContain('restoreInventoryOpeningLots');
    expect(openingBalanceReadService).toContain("source_type: 'OPENING'");
  });

  test('enforces inventory line integrity in PostgreSQL and exact opening-stock convergence', () => {
    expect(openingInventoryMigration).toContain(
      'chk_opening_balance_lines_inventory_fields',
    );
    expect(openingInventoryMigration).toContain(
      'uq_opening_balance_lines_inventory_batch_product',
    );
    expect(stockMutationRepository).toContain(
      'WHEN $1 = \'OPENING_BALANCE\' THEN COALESCE($2, stock + $3)',
    );
    expect(stockMutationRepository).toContain(
      'source_quantity non-negatif',
    );
  });

  test('removes the legacy unjournaled opening-stock write path', () => {
    expect(stockManagementHook).not.toContain('PRODUCT_OPENING_STOCK_CREATED');
    expect(stockManagementHook).not.toContain("sourceType: 'OPENING'");
    expect(stockManagementPage).toContain(
      "to: '/finance/opening-balances/inventory'",
    );
  });

  test('uses one composite queue entity for a posted inventory opening balance', () => {
    const enqueueFunction = readExportedFunction(
      syncQueueService,
      'enqueueInventoryOpeningBalancePostingSync',
    );

    expect(enqueueFunction.start).toBeGreaterThan(-1);
    expect(syncQueueService).toContain(
      "const INVENTORY_OPENING_BALANCE_POSTING_ENTITY = 'inventoryOpeningBalancePostings'",
    );
    expect(syncQueueService).toContain(
      'isRemoteInventoryOpeningBalancePostingBundleDto',
    );
    expect(syncQueueService).toContain(
      'inventoryOpeningBalancePostgresAdapter.post',
    );
    expect(enqueueFunction.source).toContain(
      'entity: INVENTORY_OPENING_BALANCE_POSTING_ENTITY',
    );
    expect(enqueueFunction.source).toContain(
      'mapInventoryOpeningBalancePostingBundleToRemoteDto',
    );
    expect(enqueueFunction.source).not.toContain('entity: STOCK_MUTATION_ENTITY');
    expect(enqueueFunction.source).not.toContain('entity: JOURNAL_ENTRY_ENTITY');
    expect(enqueueFunction.source).not.toContain('entity: OPENING_BALANCE_ENTITY');
    expect(syncQueueService).not.toContain(
      'enqueueInventoryOpeningStockSnapshotsForSync',
    );
  });

  test('rebuilds a pending inventory posting through the same composite queue', () => {
    const pendingFunction = readExportedFunction(
      syncQueueService,
      'enqueuePendingOpeningBalancesForSync',
    );
    const pendingJournalFunction = readExportedFunction(
      syncQueueService,
      'enqueuePendingJournalEntriesForSync',
    );
    const pendingSettingsFunction = readExportedFunction(
      syncQueueService,
      'enqueuePendingAccountingSettingsForSync',
    );

    expect(pendingFunction.start).toBeGreaterThan(-1);
    expect(pendingFunction.source).toContain("batch.module === 'INVENTORY'");
    expect(pendingFunction.source).toContain(
      'enqueueInventoryOpeningBalancePostingSync',
    );
    expect(pendingFunction.source).not.toContain(
      'enqueueInventoryOpeningStockSnapshotsForSync',
    );
    expect(pendingJournalFunction.start).toBeGreaterThan(-1);
    expect(pendingJournalFunction.source).toContain("'OPENING_BALANCE'");
    expect(pendingJournalFunction.source).toContain(
      "'INVENTORY_OPENING_BALANCE_POSTED'",
    );
    expect(pendingSettingsFunction.start).toBeGreaterThan(-1);
    expect(pendingSettingsFunction.source).toContain(
      'hasPendingInventoryOpeningPosting',
    );
    expect(pendingSettingsFunction.source).toContain(
      'setting.is_ready && hasPendingInventoryOpeningPosting',
    );
  });

  test('wires the composite posting DTO through the adapter and registered Tauri command', () => {
    expect(openingBalanceModel).toContain(
      'pub struct InventoryOpeningBalancePostingBundleDto',
    );
    expect(openingBalanceModel).toContain('OpeningBalanceBundleDto');
    expect(openingBalanceModel).toContain('JournalEntryBundleDto');
    expect(openingBalanceModel).toContain('Vec<StockMutationDto>');
    expect(openingBalanceModel).toContain('Option<GeneralLedgerSettingDto>');
    expect(postgresAdapter).toContain(
      'export interface RemoteInventoryOpeningBalancePostingBundleDto',
    );
    expect(postgresAdapter).toContain(
      'export const inventoryOpeningBalancePostgresAdapter',
    );
    expect(postgresAdapter).toContain(
      "'postgres_post_inventory_opening_balance_bundle'",
    );
    expect(inventoryOpeningBalanceCommands).toContain(
      'pub async fn postgres_post_inventory_opening_balance_bundle',
    );
    expect(inventoryOpeningBalanceCommands).toContain(
      'inventory_opening_balance_repository::post_inventory_opening_balance_bundle',
    );
    expect(tauriLib).toContain(
      'commands::opening_balance_commands::postgres_post_inventory_opening_balance_bundle',
    );
  });

  test('commits the journal, opening bundle, and stock snapshots in one PostgreSQL transaction', () => {
    const postStart = inventoryOpeningBalanceRepository.indexOf(
      'pub async fn post_inventory_opening_balance_bundle',
    );
    const postSource = inventoryOpeningBalanceRepository.slice(postStart);
    const beginIndex = postSource.indexOf('let mut tx = pool.begin().await?');
    const journalIndex = postSource.indexOf(
      'upsert_journal_entry_bundle_in_tx',
    );
    const openingIndex = postSource.indexOf(
      'upsert_opening_balance_bundle_in_tx',
    );
    const mutationIndex = postSource.indexOf(
      'upsert_stock_mutation_in_tx',
    );
    const settingIndex = postSource.indexOf(
      'upsert_general_ledger_setting_in_tx',
    );
    const terminalBatchStatusIndex = postSource.indexOf(
      'opening_balance.batch.status != "POSTED"',
    );
    const terminalJournalStatusIndex = postSource.indexOf(
      'journal_entry.entry.status != "POSTED"',
    );
    const commitIndex = postSource.indexOf('tx.commit().await?');

    expect(postStart).toBeGreaterThan(-1);
    expect(beginIndex).toBeGreaterThan(-1);
    expect(journalIndex).toBeGreaterThan(beginIndex);
    expect(openingIndex).toBeGreaterThan(beginIndex);
    expect(mutationIndex).toBeGreaterThan(beginIndex);
    expect(settingIndex).toBeGreaterThan(beginIndex);
    expect(terminalBatchStatusIndex).toBeGreaterThan(beginIndex);
    expect(terminalJournalStatusIndex).toBeGreaterThan(beginIndex);
    expect(commitIndex).toBeGreaterThan(journalIndex);
    expect(commitIndex).toBeGreaterThan(openingIndex);
    expect(commitIndex).toBeGreaterThan(mutationIndex);
    expect(commitIndex).toBeGreaterThan(settingIndex);
    expect(commitIndex).toBeGreaterThan(terminalBatchStatusIndex);
    expect(commitIndex).toBeGreaterThan(terminalJournalStatusIndex);
    expect(postSource.slice(journalIndex, journalIndex + 200)).toContain('&mut tx');
    expect(postSource.slice(openingIndex, openingIndex + 200)).toContain('&mut tx');
    expect(postSource.slice(mutationIndex, mutationIndex + 200)).toContain('&mut tx');
    expect(postSource.slice(settingIndex, settingIndex + 200)).toContain('&mut tx');
    expect(openingBalanceRepository).toMatch(
      /pub\(crate\)\s+async fn upsert_opening_balance_bundle_in_tx[\s\S]{0,300}?tx:\s*&mut Transaction<'_, Postgres>/,
    );
    expect(journalEntryRepository).toMatch(
      /pub\(crate\)\s+async fn upsert_journal_entry_bundle_in_tx[\s\S]{0,300}?tx:\s*&mut Transaction<'_, Postgres>/,
    );
    expect(stockMutationRepository).toMatch(
      /pub\(crate\)\s+async fn upsert_stock_mutation_in_tx[\s\S]{0,300}?tx:\s*&mut Transaction<'_, Postgres>/,
    );
    expect(accountingSettingRepository).toMatch(
      /pub\(crate\)\s+async fn upsert_general_ledger_setting_in_tx[\s\S]{0,300}?tx:\s*&mut Transaction<'_, Postgres>/,
    );
  });

  test('does not fan out a posted inventory opening into separate accounting queues', () => {
    const postStart = inventoryService.indexOf(
      'export const postInventoryOpeningBalance',
    );
    const postSource = inventoryService.slice(postStart);

    expect(postStart).toBeGreaterThan(-1);
    expect(postSource).toContain(
      'enqueueInventoryOpeningBalancePostingSync',
    );
    expect(postSource).not.toContain('enqueueStockMutations(');
    expect(postSource).not.toContain(
      'enqueueInventoryOpeningStockSnapshotsForSync(',
    );
    expect(postSource).not.toContain('enqueueOpeningBalanceBundleSync(');
    expect(postSource).not.toContain('enqueueJournalEntryBundleSync(');
    expect(postSource).not.toContain('enqueueGeneralLedgerSettingSync(');
    expect(postSource).toContain('scheduleSync: false');
  });
});
