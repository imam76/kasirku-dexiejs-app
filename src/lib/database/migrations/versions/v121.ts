import type { SyncCursor } from '@/types';
import type { KasirkuDB } from '../../KasirkuDB';

const UPDATED_AT_CURSOR_ENTITIES = [
  'accountingFiscalYears',
  'accountingPeriods',
  'financeAccountMappings',
  'cashBankReconciliations',
  'cashierSessions',
  'chartOfAccounts',
  'closingRuns',
  'contacts',
  'cooperativeAreas',
  'cooperativeMembers',
  'cooperativeSavingTransactions',
  'cooperativeMemberSavingBalances',
  'cooperativeLoans',
  'cooperativeLoanInstallments',
  'cooperativeLoanPayments',
  'employees',
  'employeeAreas',
  'employeeCollectionSchedules',
  'financeTransactions',
  'fiscalYearClosingRuns',
  'fixedAssets',
  'fixedAssetDepreciationRuns',
  'hrPositions',
  'employmentContracts',
  'salaryComponents',
  'employeeSalaryComponents',
  'inventoryLots',
  'journalEntries',
  'openingBalanceBatches',
  'payrollRuns',
  'employeeCashAdvances',
  'posStockDiscrepancies',
  'products',
  'productionOrders',
  'promos',
  'purchaseDocuments',
  'salesDocuments',
  'stockOpnames',
  'transactions',
];

/**
 * Timestamp-only delta cursors could permanently skip rows tied at a page boundary. Resetting the
 * affected checkpoints forces one idempotent full backfill after upgrading. Each refreshed page writes the
 * new composite cursor immediately, so the backfill can safely resume after an interruption. Keep
 * unrelated cursors intact, notably the already-composite purchase-cost reconciliation cursor.
 */
export function registerMigrationV121(db: KasirkuDB) {
  db.version(121).stores({
    syncCursors: 'entity',
  }).upgrade(async (migration) => {
    await migration.table<SyncCursor>('syncCursors').bulkDelete(UPDATED_AT_CURSOR_ENTITIES);
  });
}
