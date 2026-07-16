import type * as DatabaseTypes from '@/types';
import type { KasirkuDB } from '../../KasirkuDB';
import * as UnitConstants from '@/constants/units';
import * as MigrationSeeds from '../../seeds';

export function registerMigrationsV001ToV020(db: KasirkuDB) {
  db.version(1).stores({
    products: 'id, name, sku, created_at',
    transactions: 'id, transaction_number, created_at',
    transactionItems: 'id, transaction_id, product_id',
    stockPurchases: 'id, product_id, created_at'
  });

  db.version(2).stores({
    transactionItems: 'id, transaction_id, product_id, created_at'
  });

  db.version(3).stores({
    profitLogs: 'id, transaction_id, created_at',
    profitBalance: 'id'
  });

  db.version(4).stores({
    profitLogs: 'id, transaction_id, type, created_at'
  });

  db.version(5).stores({
    shoppingNotes: 'id, created_at'
  });

  db.version(6).stores({
    financeTransactions: 'id, type, category, created_at, reference_id',
    financeBalance: 'id'
  });

  db.version(7).stores({
    unitConversions: 'id, fromUnit, toUnit'
  });

  db.version(8).stores({
    transactions: 'id, transaction_number, payment_method, created_at'
  });

  db.version(9).stores({
    products: 'id, name, sku, created_at'
  });

  db.version(10).stores({
    units: 'id, name, type'
  }).upgrade(async (tx) => {
    const conversions = await tx.table<DatabaseTypes.UnitConversion, string>('unitConversions').toArray();
    const units = new Map(UnitConstants.DEFAULT_UNITS.map((unit) => [unit.id, unit]));

    conversions.forEach((conversion) => {
      if (!units.has(conversion.fromUnit)) {
        units.set(conversion.fromUnit, UnitConstants.createUnitDefinition(conversion.fromUnit));
      }
      if (!units.has(conversion.toUnit)) {
        units.set(conversion.toUnit, UnitConstants.createUnitDefinition(conversion.toUnit));
      }
    });

    await tx.table<DatabaseTypes.UnitDefinition, string>('units').bulkPut(Array.from(units.values()));
  });

  db.version(11).stores({
    authUsers: 'id, role, is_active, created_at',
    authSessions: 'id, user_id, last_active_at',
    activityLogs: 'id, user_id, action, entity, created_at'
  });

  db.version(12).stores({
    promos: 'id, active, type, applies_to, voucher_code, priority, start_at, end_at, created_at'
  });

  db.version(13).stores({
    contacts: 'id, name, contact_type, phone, email, is_active, created_at'
  });

  db.version(14).stores({
    departments: 'id, name, code, is_active, created_at'
  });

  db.version(15).stores({
    projects: 'id, name, code, status, contact_id, department_id, is_active, start_date, end_date, created_at'
  });

  db.version(16).stores({
    taxes: 'id, name, code, rate_type, calculation_mode, is_default, is_active, effective_from, effective_to, created_at'
  });

  db.version(17).stores({
    salesDocuments: 'id, document_number, type, status, contact_id, customer_name, document_date, due_date, payment_status, source_document_id, project_id, department_id, tax_id, created_at',
    salesDocumentItems: 'id, document_id, product_id'
  });

  db.version(18).stores({
    salesReturns: 'id, return_number, status, source_type, source_id, source_document_type, contact_id, customer_name, document_date, resolution, created_at',
    salesReturnItems: 'id, return_id, source_item_id, product_id'
  });

  db.version(19).stores({
    financeTransactions: 'id, type, category, account_id, created_at, reference_id',
    chartOfAccounts: 'id, code, name, type, parent_id, is_postable, is_system, is_active, created_at',
    financeAccountMappings: 'id, key, category, account_id, created_at',
    accountingProfileSetting: 'id, accounting_profile, industry_extension, updated_at',
    enabledModules: 'id, code, is_enabled, source, updated_at'
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const seed = MigrationSeeds.buildAccountingSeed(now);
    const chartOfAccounts = tx.table<DatabaseTypes.ChartOfAccount, string>('chartOfAccounts');
    const financeAccountMappings = tx.table<DatabaseTypes.FinanceAccountMapping, string>('financeAccountMappings');
    const accountingProfileSetting = tx.table<DatabaseTypes.AccountingProfileSetting, string>('accountingProfileSetting');
    const enabledModules = tx.table<DatabaseTypes.EnabledModule, string>('enabledModules');

    if (await chartOfAccounts.count() === 0) {
      await chartOfAccounts.bulkPut(seed.accounts);
    }

    if (await financeAccountMappings.count() === 0) {
      await financeAccountMappings.bulkPut(seed.mappings);
    }

    if (!await accountingProfileSetting.get('default')) {
      await accountingProfileSetting.put(seed.profileSetting);
    }

    if (await enabledModules.count() === 0) {
      await enabledModules.bulkPut(seed.enabledModules);
    }
  });

  db.version(20).stores({
    journalEntries: 'id, entry_number, entry_date, status, source_type, source_id, source_event, reversed_entry_id, created_at',
    journalEntryLines: 'id, journal_entry_id, account_id, account_code, account_type, created_at'
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const seed = MigrationSeeds.buildAccountingSeed(now);
    const chartOfAccounts = tx.table<DatabaseTypes.ChartOfAccount, string>('chartOfAccounts');
    const enabledModules = tx.table<DatabaseTypes.EnabledModule, string>('enabledModules');

    const accounts = await chartOfAccounts.toArray();
    const accountCodes = new Set(accounts.map((account) => account.code));
    const accountIds = new Set(accounts.map((account) => account.id));
    const missingAccounts = seed.accounts.filter((account) => {
      return !accountCodes.has(account.code) && !accountIds.has(account.id);
    });

    if (missingAccounts.length > 0) {
      await chartOfAccounts.bulkPut(missingAccounts);
    }

    const modules = await enabledModules.toArray();
    const moduleCodes = new Set(modules.map((module) => module.code));
    const missingModules = seed.enabledModules.filter((module) => !moduleCodes.has(module.code));

    if (missingModules.length > 0) {
      await enabledModules.bulkPut(missingModules);
    }
  });
}
