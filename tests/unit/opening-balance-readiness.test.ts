import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { getAccountingBaselineLockViolation } from '../../src/services/accountingInitialSetupService';
import {
  LEGACY_INVENTORY_OPENING_BALANCE_SKIP_NOTE,
  buildLegacyInventoryOpeningBalanceSkipBatch,
} from '../../src/lib/database/migrations/versions/v106';

const now = '2026-07-31T10:00:00.000Z';
const setup = {
  cutoff_date: '2026-01-01',
  current_period_start: '2026-01-01',
};
const openingBalanceServiceSource = readFileSync(
  new URL('../../src/services/openingBalanceService.ts', import.meta.url),
  'utf8',
);
const accountingInitialSetupServiceSource = readFileSync(
  new URL('../../src/services/accountingInitialSetupService.ts', import.meta.url),
  'utf8',
);

describe('inventory opening-balance readiness compatibility', () => {
  test('auto-skips inventory only for an already-ready legacy ledger with zero inventory', () => {
    const batch = buildLegacyInventoryOpeningBalanceSkipBatch({
      ledger: {
        is_ready: true,
        cutoff_date: '2026-01-01T00:00:00.000',
      },
      setup,
      hasInventoryBatch: false,
      hasInventoryBalance: false,
      now,
    });

    expect(batch).toMatchObject({
      id: 'opening-balance-inventory-2026-01-01',
      batch_number: 'OB-20260101-INVENTORY-R1',
      module: 'INVENTORY',
      status: 'SKIPPED',
      cutoff_date: '2026-01-01',
      accounting_start_date: '2026-01-01',
      total_debit: 0,
      total_credit: 0,
      skipped_at: now,
      notes: LEGACY_INVENTORY_OPENING_BALANCE_SKIP_NOTE,
      sync_status: 'pending',
    });
  });

  test('does not auto-skip a new/inactive ledger or overwrite an inventory batch', () => {
    expect(buildLegacyInventoryOpeningBalanceSkipBatch({
      ledger: { is_ready: false },
      setup,
      hasInventoryBatch: false,
      hasInventoryBalance: false,
      now,
    })).toBeUndefined();

    expect(buildLegacyInventoryOpeningBalanceSkipBatch({
      ledger: { is_ready: true },
      setup,
      hasInventoryBatch: true,
      hasInventoryBalance: false,
      now,
    })).toBeUndefined();

    expect(buildLegacyInventoryOpeningBalanceSkipBatch({
      ledger: { is_ready: true },
      setup,
      hasInventoryBatch: false,
      hasInventoryBalance: true,
      now,
    })).toBeUndefined();
  });

  test('locks cutoff and inventory policy once the ledger is ready', () => {
    const existingSetup = {
      cutoff_date: '2026-01-01',
      inventory_policy: 'PERPETUAL_INVENTORY' as const,
    };
    const existingLedger = {
      is_ready: true,
      cutoff_date: '2026-01-01T00:00:00.000',
      inventory_policy: 'PERPETUAL_INVENTORY' as const,
    };

    expect(getAccountingBaselineLockViolation({
      existingSetup,
      existingLedger,
      requestedCutoffDate: '2026-02-01',
      requestedInventoryPolicy: 'PERPETUAL_INVENTORY',
    })).toContain('Cutoff sudah terkunci');

    expect(getAccountingBaselineLockViolation({
      existingSetup,
      existingLedger,
      requestedCutoffDate: '2026-01-01',
      requestedInventoryPolicy: 'CASH_FLOW_ONLY',
    })).toContain('Policy persediaan sudah terkunci');

    expect(getAccountingBaselineLockViolation({
      existingSetup,
      existingLedger,
      requestedCutoffDate: '2026-01-01',
      requestedInventoryPolicy: 'PERPETUAL_INVENTORY',
    })).toBeUndefined();
  });

  test('locks the baseline when a posted opening batch exists even before GL readiness', () => {
    const violation = getAccountingBaselineLockViolation({
      existingSetup: {
        cutoff_date: '2026-01-01',
        inventory_policy: 'PERPETUAL_INVENTORY',
      },
      existingLedger: {
        is_ready: false,
        inventory_policy: 'PERPETUAL_INVENTORY',
      },
      lockedOpeningBatch: {
        module: 'INVENTORY',
        cutoff_date: '2026-01-01',
        status: 'POSTED',
      },
      requestedCutoffDate: '2026-02-01',
      requestedInventoryPolicy: 'PERPETUAL_INVENTORY',
    });

    expect(violation).toContain('saldo awal INVENTORY sudah POSTED');
  });

  test('checks product and FIFO balances inside the inventory skip transaction', () => {
    const skipStart = openingBalanceServiceSource.indexOf(
      'export const markOpeningBalanceModuleSkipped',
    );
    const skipSource = openingBalanceServiceSource.slice(skipStart);
    const transactionStart = skipSource.indexOf("db.transaction('rw'");
    const balanceGuard = skipSource.indexOf("if (module === 'INVENTORY')", transactionStart);
    const batchWrite = skipSource.indexOf('db.openingBalanceBatches.put(batch)', transactionStart);

    expect(skipStart).toBeGreaterThan(-1);
    expect(transactionStart).toBeGreaterThan(-1);
    expect(skipSource).toContain('db.products');
    expect(skipSource).toContain('db.inventoryLots');
    expect(skipSource).toContain('db.inventoryLotConsumptions');
    expect(skipSource).toContain('db.transactionItems');
    expect(skipSource).toContain('db.stockPurchases');
    expect(skipSource).toContain('Math.abs(Number(product.stock || 0)) > 1e-6');
    expect(skipSource).toContain('Math.abs(Number(lot.quantity_remaining || 0)) > 1e-6');
    expect(skipSource).toContain(
      'Saldo awal persediaan tidak dapat dilewati karena sudah ada pergerakan stok setelah cutoff.',
    );
    expect(balanceGuard).toBeGreaterThan(transactionStart);
    expect(batchWrite).toBeGreaterThan(balanceGuard);
  });

  test('does not mark the ledger ready until perpetual inventory opening is complete', () => {
    expect(openingBalanceServiceSource).toContain(
      "inventoryPolicy !== 'PERPETUAL_INVENTORY'",
    );
    expect(openingBalanceServiceSource).toContain(
      'isReady: inventoryOpeningComplete',
    );
  });

  test('enabling the General Ledger module does not activate it before opening balances', () => {
    const helperStart = accountingInitialSetupServiceSource.indexOf(
      'const upsertGeneralLedgerSetting',
    );
    const helperEnd = accountingInitialSetupServiceSource.indexOf(
      '\nconst findOrCreateCurrentPeriod',
      helperStart,
    );
    const helperSource = accountingInitialSetupServiceSource.slice(helperStart, helperEnd);

    expect(helperStart).toBeGreaterThan(-1);
    expect(helperSource).toContain(
      'is_ready: existingSetting?.is_ready ?? false',
    );
    expect(helperSource).toContain(
      'activated_at: existingSetting?.activated_at',
    );
    expect(helperSource).not.toContain(
      "selectedSetupModules.includes('GENERAL_LEDGER')",
    );
  });
});
