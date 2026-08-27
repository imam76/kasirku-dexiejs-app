import type {
  AccountingPeriod,
  CashBankReconciliation,
  ClosingRun,
  Currency,
  CurrencyRate,
  EmployeeSalaryComponent,
  EmploymentContract,
  FiscalYearClosingRun,
  HrPosition,
  SalaryComponent,
  StockMutation,
  StockOpname,
  StockOpnameItem,
  Tax,
} from '@/types';
import { normalizeStoredTimestamp } from '@/utils/timestamps';
import type { KasirkuDB } from '../../KasirkuDB';

export function registerMigrationV124(db: KasirkuDB) {
  db.version(124).stores({}).upgrade(async (migration) => {
    await migration.table<AccountingPeriod>('accountingPeriods').toCollection().modify((period) => {
      period.created_at = normalizeStoredTimestamp(period.created_at) ?? period.created_at;
      period.updated_at = normalizeStoredTimestamp(period.updated_at) ?? period.updated_at;
      period.locked_at = normalizeStoredTimestamp(period.locked_at);
      period.closed_at = normalizeStoredTimestamp(period.closed_at);
      period.reopened_at = normalizeStoredTimestamp(period.reopened_at);
      period.deleted_at = normalizeStoredTimestamp(period.deleted_at);
      period.last_synced_at = normalizeStoredTimestamp(period.last_synced_at);
      period.remote_updated_at = normalizeStoredTimestamp(period.remote_updated_at);
    });

    await migration.table<CashBankReconciliation>('cashBankReconciliations').toCollection().modify((reconciliation) => {
      reconciliation.created_at = normalizeStoredTimestamp(reconciliation.created_at) ?? reconciliation.created_at;
      reconciliation.updated_at = normalizeStoredTimestamp(reconciliation.updated_at) ?? reconciliation.updated_at;
      reconciliation.voided_at = normalizeStoredTimestamp(reconciliation.voided_at);
      reconciliation.last_synced_at = normalizeStoredTimestamp(reconciliation.last_synced_at);
      reconciliation.remote_updated_at = normalizeStoredTimestamp(reconciliation.remote_updated_at);
    });

    await migration.table<ClosingRun>('closingRuns').toCollection().modify((run) => {
      run.created_at = normalizeStoredTimestamp(run.created_at) ?? run.created_at;
      run.updated_at = normalizeStoredTimestamp(run.updated_at) ?? run.updated_at;
      run.posted_at = normalizeStoredTimestamp(run.posted_at);
      run.reversed_at = normalizeStoredTimestamp(run.reversed_at);
      run.deleted_at = normalizeStoredTimestamp(run.deleted_at);
      run.last_synced_at = normalizeStoredTimestamp(run.last_synced_at);
      run.remote_updated_at = normalizeStoredTimestamp(run.remote_updated_at);
    });

    await migration.table<FiscalYearClosingRun>('fiscalYearClosingRuns').toCollection().modify((run) => {
      run.created_at = normalizeStoredTimestamp(run.created_at) ?? run.created_at;
      run.updated_at = normalizeStoredTimestamp(run.updated_at) ?? run.updated_at;
      run.posted_at = normalizeStoredTimestamp(run.posted_at);
      run.reversed_at = normalizeStoredTimestamp(run.reversed_at);
      run.deleted_at = normalizeStoredTimestamp(run.deleted_at);
      run.last_synced_at = normalizeStoredTimestamp(run.last_synced_at);
      run.remote_updated_at = normalizeStoredTimestamp(run.remote_updated_at);
    });

    await migration.table<HrPosition>('hrPositions').toCollection().modify((position) => {
      position.created_at = normalizeStoredTimestamp(position.created_at) ?? position.created_at;
      position.updated_at = normalizeStoredTimestamp(position.updated_at) ?? position.updated_at;
      position.last_synced_at = normalizeStoredTimestamp(position.last_synced_at);
      position.remote_updated_at = normalizeStoredTimestamp(position.remote_updated_at);
    });

    await migration.table<EmploymentContract>('employmentContracts').toCollection().modify((contract) => {
      contract.created_at = normalizeStoredTimestamp(contract.created_at) ?? contract.created_at;
      contract.updated_at = normalizeStoredTimestamp(contract.updated_at) ?? contract.updated_at;
      contract.last_synced_at = normalizeStoredTimestamp(contract.last_synced_at);
      contract.remote_updated_at = normalizeStoredTimestamp(contract.remote_updated_at);
    });

    await migration.table<SalaryComponent>('salaryComponents').toCollection().modify((component) => {
      component.created_at = normalizeStoredTimestamp(component.created_at) ?? component.created_at;
      component.updated_at = normalizeStoredTimestamp(component.updated_at) ?? component.updated_at;
      component.last_synced_at = normalizeStoredTimestamp(component.last_synced_at);
      component.remote_updated_at = normalizeStoredTimestamp(component.remote_updated_at);
    });

    await migration.table<EmployeeSalaryComponent>('employeeSalaryComponents').toCollection().modify((component) => {
      component.created_at = normalizeStoredTimestamp(component.created_at) ?? component.created_at;
      component.updated_at = normalizeStoredTimestamp(component.updated_at) ?? component.updated_at;
      component.last_synced_at = normalizeStoredTimestamp(component.last_synced_at);
      component.remote_updated_at = normalizeStoredTimestamp(component.remote_updated_at);
    });

    await migration.table<Tax>('taxes').toCollection().modify((tax) => {
      tax.created_at = normalizeStoredTimestamp(tax.created_at) ?? tax.created_at;
      tax.updated_at = normalizeStoredTimestamp(tax.updated_at) ?? tax.updated_at;
      tax.last_synced_at = normalizeStoredTimestamp(tax.last_synced_at);
      tax.remote_updated_at = normalizeStoredTimestamp(tax.remote_updated_at);
    });

    await migration.table<StockMutation>('stockMutations').toCollection().modify((mutation) => {
      mutation.occurred_at = normalizeStoredTimestamp(mutation.occurred_at) ?? mutation.occurred_at;
      mutation.created_at = normalizeStoredTimestamp(mutation.created_at) ?? mutation.created_at;
    });

    await migration.table<Currency>('currencies').toCollection().modify((currency) => {
      currency.created_at = normalizeStoredTimestamp(currency.created_at) ?? currency.created_at;
      currency.updated_at = normalizeStoredTimestamp(currency.updated_at) ?? currency.updated_at;
      currency.last_synced_at = normalizeStoredTimestamp(currency.last_synced_at);
      currency.remote_updated_at = normalizeStoredTimestamp(currency.remote_updated_at);
    });

    await migration.table<CurrencyRate>('currencyRates').toCollection().modify((rate) => {
      rate.created_at = normalizeStoredTimestamp(rate.created_at) ?? rate.created_at;
      rate.updated_at = normalizeStoredTimestamp(rate.updated_at) ?? rate.updated_at;
      rate.fetched_at = normalizeStoredTimestamp(rate.fetched_at);
      rate.last_synced_at = normalizeStoredTimestamp(rate.last_synced_at);
      rate.remote_updated_at = normalizeStoredTimestamp(rate.remote_updated_at);
    });

    await migration.table<StockOpname>('stockOpnames').toCollection().modify((opname) => {
      opname.created_at = normalizeStoredTimestamp(opname.created_at) ?? opname.created_at;
      opname.updated_at = normalizeStoredTimestamp(opname.updated_at) ?? opname.updated_at;
      opname.counted_at = normalizeStoredTimestamp(opname.counted_at) ?? opname.counted_at;
      opname.reviewed_at = normalizeStoredTimestamp(opname.reviewed_at);
      opname.posted_at = normalizeStoredTimestamp(opname.posted_at);
      opname.cancelled_at = normalizeStoredTimestamp(opname.cancelled_at);
      opname.last_synced_at = normalizeStoredTimestamp(opname.last_synced_at);
      opname.remote_updated_at = normalizeStoredTimestamp(opname.remote_updated_at);
    });

    await migration.table<StockOpnameItem>('stockOpnameItems').toCollection().modify((item) => {
      item.created_at = normalizeStoredTimestamp(item.created_at) ?? item.created_at;
      item.updated_at = normalizeStoredTimestamp(item.updated_at) ?? item.updated_at;
    });
  });
}
