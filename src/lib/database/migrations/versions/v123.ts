import type {
  AccountingFiscalYear,
  CashierSession,
  ChartOfAccount,
  CompanyProfileSetting,
  Department,
  FixedAsset,
  FixedAssetDepreciationRun,
  PaymentMethodMaster,
  PosStockDiscrepancy,
  Product,
  Project,
  Promo,
  Warehouse,
} from '@/types';
import { normalizeStoredTimestamp } from '@/utils/timestamps';
import type { KasirkuDB } from '../../KasirkuDB';

export function registerMigrationV123(db: KasirkuDB) {
  db.version(123).stores({}).upgrade(async (migration) => {
    await migration.table<CompanyProfileSetting>('companyProfileSetting').toCollection().modify((setting) => {
      setting.created_at = normalizeStoredTimestamp(setting.created_at) ?? setting.created_at;
      setting.updated_at = normalizeStoredTimestamp(setting.updated_at) ?? setting.updated_at;
    });

    await migration.table<PosStockDiscrepancy>('posStockDiscrepancies').toCollection().modify((discrepancy) => {
      discrepancy.created_at = normalizeStoredTimestamp(discrepancy.created_at) ?? discrepancy.created_at;
      discrepancy.updated_at = normalizeStoredTimestamp(discrepancy.updated_at) ?? discrepancy.updated_at;
      discrepancy.reviewed_at = normalizeStoredTimestamp(discrepancy.reviewed_at);
      discrepancy.last_synced_at = normalizeStoredTimestamp(discrepancy.last_synced_at);
      discrepancy.remote_updated_at = normalizeStoredTimestamp(discrepancy.remote_updated_at);
    });

    await migration.table<PaymentMethodMaster>('paymentMethods').toCollection().modify((method) => {
      method.created_at = normalizeStoredTimestamp(method.created_at) ?? method.created_at;
      method.updated_at = normalizeStoredTimestamp(method.updated_at) ?? method.updated_at;
      method.last_synced_at = normalizeStoredTimestamp(method.last_synced_at);
      method.remote_updated_at = normalizeStoredTimestamp(method.remote_updated_at);
    });

    await migration.table<Warehouse>('warehouses').toCollection().modify((warehouse) => {
      warehouse.created_at = normalizeStoredTimestamp(warehouse.created_at) ?? warehouse.created_at;
      warehouse.updated_at = normalizeStoredTimestamp(warehouse.updated_at) ?? warehouse.updated_at;
      warehouse.last_synced_at = normalizeStoredTimestamp(warehouse.last_synced_at);
      warehouse.remote_updated_at = normalizeStoredTimestamp(warehouse.remote_updated_at);
    });

    await migration.table<Department>('departments').toCollection().modify((department) => {
      department.created_at = normalizeStoredTimestamp(department.created_at) ?? department.created_at;
      department.updated_at = normalizeStoredTimestamp(department.updated_at) ?? department.updated_at;
      department.last_synced_at = normalizeStoredTimestamp(department.last_synced_at);
      department.remote_updated_at = normalizeStoredTimestamp(department.remote_updated_at);
    });

    await migration.table<AccountingFiscalYear>('accountingFiscalYears').toCollection().modify((fiscalYear) => {
      fiscalYear.created_at = normalizeStoredTimestamp(fiscalYear.created_at) ?? fiscalYear.created_at;
      fiscalYear.updated_at = normalizeStoredTimestamp(fiscalYear.updated_at) ?? fiscalYear.updated_at;
      fiscalYear.closed_at = normalizeStoredTimestamp(fiscalYear.closed_at);
      fiscalYear.reopened_at = normalizeStoredTimestamp(fiscalYear.reopened_at);
      fiscalYear.deleted_at = normalizeStoredTimestamp(fiscalYear.deleted_at);
      fiscalYear.last_synced_at = normalizeStoredTimestamp(fiscalYear.last_synced_at);
      fiscalYear.remote_updated_at = normalizeStoredTimestamp(fiscalYear.remote_updated_at);
    });

    await migration.table<FixedAsset>('fixedAssets').toCollection().modify((asset) => {
      asset.created_at = normalizeStoredTimestamp(asset.created_at) ?? asset.created_at;
      asset.updated_at = normalizeStoredTimestamp(asset.updated_at) ?? asset.updated_at;
      asset.deleted_at = normalizeStoredTimestamp(asset.deleted_at);
      asset.last_synced_at = normalizeStoredTimestamp(asset.last_synced_at);
      asset.remote_updated_at = normalizeStoredTimestamp(asset.remote_updated_at);
    });

    await migration.table<FixedAssetDepreciationRun>('fixedAssetDepreciationRuns').toCollection().modify((run) => {
      run.created_at = normalizeStoredTimestamp(run.created_at) ?? run.created_at;
      run.updated_at = normalizeStoredTimestamp(run.updated_at) ?? run.updated_at;
      run.posted_at = normalizeStoredTimestamp(run.posted_at);
      run.reversed_at = normalizeStoredTimestamp(run.reversed_at);
      run.deleted_at = normalizeStoredTimestamp(run.deleted_at);
      run.last_synced_at = normalizeStoredTimestamp(run.last_synced_at);
      run.remote_updated_at = normalizeStoredTimestamp(run.remote_updated_at);
    });

    await migration.table('fixedAssetDepreciationRunLines').toCollection().modify((line: { created_at: string }) => {
      line.created_at = normalizeStoredTimestamp(line.created_at) ?? line.created_at;
    });

    await migration.table<ChartOfAccount>('chartOfAccounts').toCollection().modify((account) => {
      account.created_at = normalizeStoredTimestamp(account.created_at) ?? account.created_at;
      account.updated_at = normalizeStoredTimestamp(account.updated_at) ?? account.updated_at;
      account.last_synced_at = normalizeStoredTimestamp(account.last_synced_at);
      account.remote_updated_at = normalizeStoredTimestamp(account.remote_updated_at);
    });

    await migration.table<CashierSession>('cashierSessions').toCollection().modify((session) => {
      session.created_at = normalizeStoredTimestamp(session.created_at) ?? session.created_at;
      session.updated_at = normalizeStoredTimestamp(session.updated_at) ?? session.updated_at;
      session.opened_at = normalizeStoredTimestamp(session.opened_at) ?? session.opened_at;
      session.closed_at = normalizeStoredTimestamp(session.closed_at);
      session.last_synced_at = normalizeStoredTimestamp(session.last_synced_at);
      session.remote_updated_at = normalizeStoredTimestamp(session.remote_updated_at);
    });

    await migration.table<Project>('projects').toCollection().modify((project) => {
      project.created_at = normalizeStoredTimestamp(project.created_at) ?? project.created_at;
      project.updated_at = normalizeStoredTimestamp(project.updated_at) ?? project.updated_at;
      project.last_synced_at = normalizeStoredTimestamp(project.last_synced_at);
      project.remote_updated_at = normalizeStoredTimestamp(project.remote_updated_at);
    });

    await migration.table<Promo>('promos').toCollection().modify((promo) => {
      promo.created_at = normalizeStoredTimestamp(promo.created_at) ?? promo.created_at;
      promo.updated_at = normalizeStoredTimestamp(promo.updated_at) ?? promo.updated_at;
      promo.start_at = normalizeStoredTimestamp(promo.start_at ?? undefined) ?? promo.start_at;
      promo.end_at = normalizeStoredTimestamp(promo.end_at ?? undefined) ?? promo.end_at;
      promo.last_synced_at = normalizeStoredTimestamp(promo.last_synced_at);
      promo.remote_updated_at = normalizeStoredTimestamp(promo.remote_updated_at);
    });

    await migration.table<Product>('products').toCollection().modify((product) => {
      product.created_at = normalizeStoredTimestamp(product.created_at) ?? product.created_at;
      product.updated_at = normalizeStoredTimestamp(product.updated_at) ?? product.updated_at;
      product.last_synced_at = normalizeStoredTimestamp(product.last_synced_at);
      product.remote_updated_at = normalizeStoredTimestamp(product.remote_updated_at);
    });
  });
}
