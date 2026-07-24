import type { KasirkuDB } from '../../KasirkuDB';

const isSystemAccumulatedDepreciationAccount = (account: {
  id: string;
  name: string;
  is_system: boolean;
  normal_balance: string;
}) => account.is_system && account.normal_balance === 'DEBIT' && (
  account.id === 'accumulated-depreciation' ||
  account.id === 'template-accumulated-depreciation' ||
  /akumulasi penyusutan|accumulated depreciation/i.test(account.name)
);

export function registerMigrationV102(db: KasirkuDB) {
  db.version(102).stores({
    fixedAssets: 'id, &asset_code, name, category, is_active, available_for_use_date, asset_account_id, department_id, project_id, updated_at, sync_status',
    fixedAssetDepreciationRuns: 'id, &run_number, period_id, status, period_start, period_end, posting_date, journal_entry_id, updated_at, sync_status',
    fixedAssetDepreciationRunLines: 'id, run_id, asset_id, [run_id+asset_id]',
  }).upgrade(async (transaction) => {
    const accounts = await transaction.table('chartOfAccounts').toArray();
    const corrected = accounts
      .filter(isSystemAccumulatedDepreciationAccount)
      .map((account) => ({
        ...account,
        normal_balance: 'CREDIT',
        updated_at: new Date().toISOString(),
        sync_status: 'pending',
      }));

    if (corrected.length > 0) {
      await transaction.table('chartOfAccounts').bulkPut(corrected);
    }
  });
}
