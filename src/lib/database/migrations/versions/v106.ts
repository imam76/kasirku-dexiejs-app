import type {
  AccountingInitialSetupSetting,
  GeneralLedgerSetting,
  InventoryLot,
  OpeningBalanceBatch,
  Product,
} from '@/types';
import type { KasirkuDB } from '../../KasirkuDB';

export const LEGACY_INVENTORY_OPENING_BALANCE_SKIP_NOTE = [
  'Migrasi kompatibilitas v106:',
  'saldo awal persediaan ditandai dilewati karena General Ledger sudah aktif sebelum fitur tersedia dan tidak ditemukan saldo stok produk maupun saldo lot.',
  'Batch ini hanya menjaga status readiness lama dan tidak membuat saldo atau jurnal persediaan.',
].join(' ');

interface BuildLegacyInventoryOpeningBalanceSkipInput {
  ledger?: Pick<GeneralLedgerSetting, 'is_ready' | 'activated_at' | 'cutoff_date'>;
  setup?: Pick<AccountingInitialSetupSetting, 'cutoff_date' | 'current_period_start'>;
  hasInventoryBatch: boolean;
  hasInventoryBalance: boolean;
  now: string;
}

export const buildLegacyInventoryOpeningBalanceSkipBatch = ({
  ledger,
  setup,
  hasInventoryBatch,
  hasInventoryBalance,
  now,
}: BuildLegacyInventoryOpeningBalanceSkipInput): OpeningBalanceBatch | undefined => {
  const wasLedgerReadyOrActive = Boolean(ledger?.is_ready || ledger?.activated_at);
  const cutoffDate = setup?.cutoff_date ?? ledger?.cutoff_date;
  if (
    !wasLedgerReadyOrActive
    || !cutoffDate
    || hasInventoryBatch
    || hasInventoryBalance
  ) {
    return undefined;
  }

  const cutoffKey = cutoffDate.slice(0, 10);
  return {
    id: `opening-balance-inventory-${cutoffKey}`,
    batch_number: `OB-${cutoffKey.replace(/-/g, '')}-INVENTORY-R1`,
    company_id: 'default',
    module: 'INVENTORY',
    cutoff_date: cutoffDate,
    accounting_start_date: setup?.current_period_start,
    status: 'SKIPPED',
    revision_number: 1,
    total_debit: 0,
    total_credit: 0,
    skipped_at: now,
    notes: LEGACY_INVENTORY_OPENING_BALANCE_SKIP_NOTE,
    version: 1,
    created_at: now,
    updated_at: now,
    sync_status: 'pending',
    sync_error: undefined,
  };
};

export function registerMigrationV106(db: KasirkuDB) {
  // Dexie menjalankan callback upgrade hanya untuk database yang sudah ada.
  // Database baru di v106 tidak menerima batch SKIPPED kompatibilitas ini.
  db.version(106).stores({}).upgrade(async (transaction) => {
    const ledger = await transaction
      .table<GeneralLedgerSetting, string>('generalLedgerSetting')
      .get('default');
    if (!ledger?.is_ready && !ledger?.activated_at) return;

    const batchTable = transaction.table<OpeningBalanceBatch, string>('openingBalanceBatches');
    const [setup, existingInventoryBatch, productWithStock, lotWithBalance] = await Promise.all([
      transaction
        .table<AccountingInitialSetupSetting, string>('accountingInitialSetupSetting')
        .get('default'),
      batchTable.where('module').equals('INVENTORY').first(),
      transaction
        .table<Product, string>('products')
        .filter((product) => Math.abs(Number(product.stock || 0)) > 1e-6)
        .first(),
      transaction
        .table<InventoryLot, string>('inventoryLots')
        .filter((lot) => Math.abs(Number(lot.quantity_remaining || 0)) > 1e-6)
        .first(),
    ]);
    const batch = buildLegacyInventoryOpeningBalanceSkipBatch({
      ledger,
      setup,
      hasInventoryBatch: Boolean(existingInventoryBatch),
      hasInventoryBalance: Boolean(productWithStock || lotWithBalance),
      now: new Date().toISOString(),
    });

    if (batch) await batchTable.put(batch);
  });
}
