import type {
  AccountingProfileSetting,
  AuthUser,
  CashierSession,
  CashBankReconciliation,
  ChartOfAccount,
  CompanyProfileSetting,
  Contact,
  CooperativeLoan,
  CooperativeLoanInstallment,
  CooperativeLoanPayment,
  CooperativeLoanCollectionEvent,
  CooperativeMember,
  CooperativeMemberSavingBalance,
  CooperativeSavingTransaction,
  CooperativeSettings,
  Currency,
  CurrencyRate,
  Department,
  EnabledModule,
  Employee,
  EmployeeArea,
  EmployeeCashAdvance,
  EmployeeCollectionSchedule,
  FinanceAccountMapping,
  FinanceTransaction,
  GeneralLedgerSetting,
  InventoryLot,
  JournalEntry,
  JournalEntryLine,
  MembershipSetting,
  Product,
  Project,
  PurchaseDocument,
  PurchaseDocumentItem,
  PurchaseInvoicePayment,
  PayrollRun,
  PayrollRunItem,
  Role,
  RolePermission,
  SalesDocument,
  SalesDocumentItem,
  SalesInvoicePayment,
  SyncQueueItem,
  Tax,
  TransactionItem,
  UnitConversion,
  UnitDefinition,
  Warehouse,
} from '@/types';
import dayjs from '@/lib/dayjs';
import { createUnitDefinition, DEFAULT_UNITS } from '@/constants/units';
import { DEFAULT_CHART_OF_ACCOUNTS, DEFAULT_FINANCE_ACCOUNT_MAPPINGS } from '@/constants/chartOfAccounts';
import { FINANCE_CATEGORIES } from '@/constants/finance';
import { BASE_CURRENCY_CODE, buildBaseCurrency, buildBaseCurrencyRate } from '@/constants/currencies';
import { buildSystemRolePermissions, buildSystemRoles, resolveLegacyRoleId, resolveLegacyRoleName } from '@/auth/roleSeed';
import type { KasirkuDB } from './KasirkuDB';
import { buildAccountingSeed, buildDefaultCompanyProfileSetting } from './seeds';

export function registerDatabaseMigrations(this: KasirkuDB) {
  this.version(1).stores({
    products: 'id, name, sku, created_at',
    transactions: 'id, transaction_number, created_at',
    transactionItems: 'id, transaction_id, product_id',
    stockPurchases: 'id, product_id, created_at'
  });
  this.version(2).stores({
    transactionItems: 'id, transaction_id, product_id, created_at'
  });
  this.version(3).stores({
    profitLogs: 'id, transaction_id, created_at',
    profitBalance: 'id'
  });
  this.version(4).stores({
    profitLogs: 'id, transaction_id, type, created_at'
  });
  this.version(5).stores({
    shoppingNotes: 'id, created_at'
  });
  this.version(6).stores({
    financeTransactions: 'id, type, category, created_at, reference_id',
    financeBalance: 'id'
  });
  this.version(7).stores({
    unitConversions: 'id, fromUnit, toUnit'
  });

  this.version(8).stores({
    transactions: 'id, transaction_number, payment_method, created_at'
  });

  this.version(9).stores({
    products: 'id, name, sku, created_at'
  });

  this.version(10).stores({
    units: 'id, name, type'
  }).upgrade(async (tx) => {
    const conversions = await tx.table<UnitConversion, string>('unitConversions').toArray();
    const units = new Map(DEFAULT_UNITS.map((unit) => [unit.id, unit]));

    conversions.forEach((conversion) => {
      if (!units.has(conversion.fromUnit)) {
        units.set(conversion.fromUnit, createUnitDefinition(conversion.fromUnit));
      }
      if (!units.has(conversion.toUnit)) {
        units.set(conversion.toUnit, createUnitDefinition(conversion.toUnit));
      }
    });

    await tx.table<UnitDefinition, string>('units').bulkPut(Array.from(units.values()));
  });

  this.version(11).stores({
    authUsers: 'id, role, is_active, created_at',
    authSessions: 'id, user_id, last_active_at',
    activityLogs: 'id, user_id, action, entity, created_at'
  });

  this.version(12).stores({
    promos: 'id, active, type, applies_to, voucher_code, priority, start_at, end_at, created_at'
  });

  this.version(13).stores({
    contacts: 'id, name, contact_type, phone, email, is_active, created_at'
  });

  this.version(14).stores({
    departments: 'id, name, code, is_active, created_at'
  });

  this.version(15).stores({
    projects: 'id, name, code, status, contact_id, department_id, is_active, start_date, end_date, created_at'
  });

  this.version(16).stores({
    taxes: 'id, name, code, rate_type, calculation_mode, is_default, is_active, effective_from, effective_to, created_at'
  });

  this.version(17).stores({
    salesDocuments: 'id, document_number, type, status, contact_id, customer_name, document_date, due_date, payment_status, source_document_id, project_id, department_id, tax_id, created_at',
    salesDocumentItems: 'id, document_id, product_id'
  });

  this.version(18).stores({
    salesReturns: 'id, return_number, status, source_type, source_id, source_document_type, contact_id, customer_name, document_date, resolution, created_at',
    salesReturnItems: 'id, return_id, source_item_id, product_id'
  });

  this.version(19).stores({
    financeTransactions: 'id, type, category, account_id, created_at, reference_id',
    chartOfAccounts: 'id, code, name, type, parent_id, is_postable, is_system, is_active, created_at',
    financeAccountMappings: 'id, key, category, account_id, created_at',
    accountingProfileSetting: 'id, accounting_profile, industry_extension, updated_at',
    enabledModules: 'id, code, is_enabled, source, updated_at'
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const seed = buildAccountingSeed(now);
    const chartOfAccounts = tx.table<ChartOfAccount, string>('chartOfAccounts');
    const financeAccountMappings = tx.table<FinanceAccountMapping, string>('financeAccountMappings');
    const accountingProfileSetting = tx.table<AccountingProfileSetting, string>('accountingProfileSetting');
    const enabledModules = tx.table<EnabledModule, string>('enabledModules');

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

  this.version(20).stores({
    journalEntries: 'id, entry_number, entry_date, status, source_type, source_id, source_event, reversed_entry_id, created_at',
    journalEntryLines: 'id, journal_entry_id, account_id, account_code, account_type, created_at'
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const seed = buildAccountingSeed(now);
    const chartOfAccounts = tx.table<ChartOfAccount, string>('chartOfAccounts');
    const enabledModules = tx.table<EnabledModule, string>('enabledModules');

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

  this.version(21).stores({
    generalLedgerSetting: 'id, is_ready, cutoff_date, inventory_policy, opening_balance_journal_id, activated_at, updated_at'
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const seed = buildAccountingSeed(now);
    const generalLedgerSetting = tx.table<GeneralLedgerSetting, string>('generalLedgerSetting');

    if (!await generalLedgerSetting.get('default')) {
      await generalLedgerSetting.put(seed.generalLedgerSetting);
    }
  });

  this.version(22).stores({
    salesInvoicePayments: 'id, sales_document_id, paid_at, status, finance_transaction_id, created_at'
  }).upgrade(async (tx) => {
    const documents = await tx.table<SalesDocument, string>('salesDocuments')
      .where('type')
      .equals('SALES_INVOICE')
      .toArray();
    const payments = documents
      .filter((document) => Number(document.paid_amount || 0) > 0)
      .map((document) => {
        const paidAt = document.paid_at || document.updated_at || document.created_at;

        return {
          id: crypto.randomUUID(),
          sales_document_id: document.id,
          document_number: document.document_number,
          contact_id: document.contact_id,
          customer_name: document.customer_name,
          amount: Number(document.paid_amount || 0),
          paid_at: paidAt,
          payment_method: document.payment_method,
          cash_account_id: document.cash_account_id,
          cash_account_code: document.cash_account_code,
          cash_account_name: document.cash_account_name,
          finance_transaction_id: document.finance_transaction_id,
          status: 'ACTIVE' as const,
          notes: 'Migrasi dari aggregate pembayaran invoice lama.',
          created_at: paidAt,
          updated_at: document.updated_at || paidAt,
        };
      });

    if (payments.length > 0) {
      await tx.table<SalesInvoicePayment, string>('salesInvoicePayments').bulkAdd(payments);
    }
  });

  this.version(23).stores({
    purchaseDocuments: 'id, document_number, type, status, contact_id, supplier_name, document_date, due_date, payment_status, source_document_id, project_id, department_id, tax_id, created_at',
    purchaseDocumentItems: 'id, document_id, product_id'
  });

  this.version(24).stores({
    warehouses: 'id, name, code, is_active, created_at'
  });

  this.version(25).stores({}).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const seed = buildAccountingSeed(now);
    const chartOfAccounts = tx.table<ChartOfAccount, string>('chartOfAccounts');
    const accounts = await chartOfAccounts.toArray();
    const accountCodes = new Set(accounts.map((account) => account.code));
    const accountIds = new Set(accounts.map((account) => account.id));
    const missingAccounts = seed.accounts.filter((account) => {
      return !accountCodes.has(account.code) && !accountIds.has(account.id);
    });

    if (missingAccounts.length > 0) {
      await chartOfAccounts.bulkPut(missingAccounts);
    }
  });

  this.version(26).stores({
    purchaseInvoicePayments: 'id, purchase_document_id, paid_at, status, finance_transaction_id, created_at'
  }).upgrade(async (tx) => {
    const documents = await tx.table<PurchaseDocument, string>('purchaseDocuments')
      .where('type')
      .equals('PURCHASE_INVOICE')
      .toArray();
    const payments = documents
      .filter((document) => Number(document.paid_amount || 0) > 0)
      .map((document) => {
        const paidAt = document.paid_at || document.updated_at || document.created_at;

        return {
          id: crypto.randomUUID(),
          purchase_document_id: document.id,
          document_number: document.document_number,
          contact_id: document.contact_id,
          supplier_name: document.supplier_name || '',
          amount: Number(document.paid_amount || 0),
          paid_at: paidAt,
          payment_method: document.payment_method,
          cash_account_id: document.cash_account_id,
          cash_account_code: document.cash_account_code,
          cash_account_name: document.cash_account_name,
          finance_transaction_id: document.finance_transaction_id,
          status: 'ACTIVE' as const,
          notes: 'Migrasi dari aggregate pembayaran purchase invoice lama.',
          created_at: paidAt,
          updated_at: document.updated_at || paidAt,
        };
      });

    if (payments.length > 0) {
      await tx.table<PurchaseInvoicePayment, string>('purchaseInvoicePayments').bulkAdd(payments);
    }
  });

  this.version(27).stores({
    departments: 'id, name, code, is_active, sync_status, created_at'
  }).upgrade(async (tx) => {
    const departments = await tx.table<Department, string>('departments').toArray();
    const departmentsWithoutSyncStatus = departments
      .filter((department) => !department.sync_status)
      .map((department) => ({
        ...department,
        sync_status: 'pending' as const,
      }));

    if (departmentsWithoutSyncStatus.length > 0) {
      await tx.table<Department, string>('departments').bulkPut(departmentsWithoutSyncStatus);
    }
  });

  this.version(28).stores({
    syncQueue: 'id, entity, entity_id, operation, status, created_at, updated_at'
  });

  this.version(29).stores({
    projects: 'id, name, code, status, contact_id, department_id, is_active, sync_status, start_date, end_date, created_at'
  }).upgrade(async (tx) => {
    const projects = await tx.table<Project, string>('projects').toArray();
    const projectsWithoutSyncStatus = projects
      .filter((project) => !project.sync_status)
      .map((project) => ({
        ...project,
        sync_status: 'pending' as const,
      }));

    if (projectsWithoutSyncStatus.length > 0) {
      await tx.table<Project, string>('projects').bulkPut(projectsWithoutSyncStatus);
    }
  });

  this.version(30).stores({
    taxes: 'id, name, code, rate_type, calculation_mode, is_default, is_active, sync_status, effective_from, effective_to, created_at'
  }).upgrade(async (tx) => {
    const taxes = await tx.table<Tax, string>('taxes').toArray();
    const taxesWithoutSyncStatus = taxes
      .filter((tax) => !tax.sync_status)
      .map((tax) => ({
        ...tax,
        sync_status: 'pending' as const,
      }));

    if (taxesWithoutSyncStatus.length > 0) {
      await tx.table<Tax, string>('taxes').bulkPut(taxesWithoutSyncStatus);
    }
  });

  this.version(31).stores({
    contacts: 'id, name, contact_type, phone, email, is_active, sync_status, created_at',
    warehouses: 'id, name, code, is_active, sync_status, created_at',
    products: 'id, name, sku, category, sync_status, created_at'
  }).upgrade(async (tx) => {
    const contacts = await tx.table<Contact, string>('contacts').toArray();
    const contactsWithoutSyncStatus = contacts
      .filter((contact) => !contact.sync_status)
      .map((contact) => ({
        ...contact,
        sync_status: 'pending' as const,
      }));

    const warehouses = await tx.table<Warehouse, string>('warehouses').toArray();
    const warehousesWithoutSyncStatus = warehouses
      .filter((warehouse) => !warehouse.sync_status)
      .map((warehouse) => ({
        ...warehouse,
        sync_status: 'pending' as const,
      }));

    const products = await tx.table<Product, string>('products').toArray();
    const productsWithoutSyncStatus = products
      .filter((product) => !product.sync_status)
      .map((product) => ({
        ...product,
        sync_status: 'pending' as const,
      }));

    if (contactsWithoutSyncStatus.length > 0) {
      await tx.table<Contact, string>('contacts').bulkPut(contactsWithoutSyncStatus);
    }
    if (warehousesWithoutSyncStatus.length > 0) {
      await tx.table<Warehouse, string>('warehouses').bulkPut(warehousesWithoutSyncStatus);
    }
    if (productsWithoutSyncStatus.length > 0) {
      await tx.table<Product, string>('products').bulkPut(productsWithoutSyncStatus);
    }
  });

  this.version(32).stores({
    authUsers: 'id, role, is_active, sync_status, created_at'
  }).upgrade(async (tx) => {
    const authUsers = await tx.table<AuthUser, string>('authUsers').toArray();
    const authUsersWithoutSyncStatus = authUsers
      .filter((user) => !user.sync_status)
      .map((user) => ({
        ...user,
        sync_status: 'pending' as const,
      }));

    if (authUsersWithoutSyncStatus.length > 0) {
      await tx.table<AuthUser, string>('authUsers').bulkPut(authUsersWithoutSyncStatus);
    }
  });

  this.version(33).stores({
    salesDocuments: 'id, document_number, type, status, contact_id, customer_name, document_date, due_date, payment_status, source_document_id, project_id, department_id, tax_id, sync_status, updated_at, created_at'
  }).upgrade(async (tx) => {
    const salesDocuments = await tx.table<SalesDocument, string>('salesDocuments').toArray();
    const salesDocumentsWithoutSyncStatus = salesDocuments
      .filter((document) => !document.sync_status || !document.version)
      .map((document) => ({
        ...document,
        version: document.version ?? 1,
        sync_status: document.sync_status ?? 'pending' as const,
      }));

    if (salesDocumentsWithoutSyncStatus.length > 0) {
      await tx.table<SalesDocument, string>('salesDocuments').bulkPut(salesDocumentsWithoutSyncStatus);
    }
  });

  this.version(34).stores({
    purchaseDocuments: 'id, document_number, type, status, contact_id, supplier_name, document_date, due_date, payment_status, source_document_id, project_id, department_id, tax_id, sync_status, updated_at, created_at'
  }).upgrade(async (tx) => {
    const purchaseDocuments = await tx.table<PurchaseDocument, string>('purchaseDocuments').toArray();
    const purchaseDocumentsWithoutSyncStatus = purchaseDocuments
      .filter((document) => !document.sync_status || !document.version)
      .map((document) => ({
        ...document,
        version: document.version ?? 1,
        sync_status: document.sync_status ?? 'pending' as const,
      }));

    if (purchaseDocumentsWithoutSyncStatus.length > 0) {
      await tx.table<PurchaseDocument, string>('purchaseDocuments').bulkPut(purchaseDocumentsWithoutSyncStatus);
    }
  });

  this.version(35).stores({
    financeTransactions: 'id, type, category, account_id, cash_account_id, transfer_group_id, sync_status, updated_at, created_at, reference_id'
  }).upgrade(async (tx) => {
    const financeTransactions = await tx.table<FinanceTransaction, string>('financeTransactions').toArray();
    const financeTransactionsWithoutSyncStatus = financeTransactions
      .filter((transaction) => !transaction.sync_status || !transaction.version || !transaction.updated_at)
      .map((transaction) => ({
        ...transaction,
        version: transaction.version ?? 1,
        updated_at: transaction.updated_at ?? transaction.created_at,
        sync_status: transaction.sync_status ?? 'pending' as const,
      }));

    if (financeTransactionsWithoutSyncStatus.length > 0) {
      await tx.table<FinanceTransaction, string>('financeTransactions').bulkPut(financeTransactionsWithoutSyncStatus);
    }
  });

  this.version(36).stores({
    journalEntries: 'id, entry_number, entry_date, status, source_type, source_id, source_event, reversed_entry_id, sync_status, updated_at, created_at',
    journalEntryLines: 'id, journal_entry_id, account_id, account_code, account_type, created_at'
  }).upgrade(async (tx) => {
    const journalEntries = await tx.table<JournalEntry, string>('journalEntries').toArray();
    const journalEntriesWithoutSyncStatus = journalEntries
      .filter((entry) => !entry.sync_status || !entry.version || !entry.updated_at)
      .map((entry) => ({
        ...entry,
        version: entry.version ?? 1,
        updated_at: entry.updated_at ?? entry.created_at,
        sync_status: entry.sync_status ?? 'pending' as const,
      }));

    if (journalEntriesWithoutSyncStatus.length > 0) {
      await tx.table<JournalEntry, string>('journalEntries').bulkPut(journalEntriesWithoutSyncStatus);
    }
  });

  this.version(37).stores({
    currencies: 'id, code, name, is_base, is_active, sync_status, updated_at, created_at',
    currencyRates: 'id, currency_code, base_currency_code, rate_date, source, sync_status, updated_at, created_at',
    salesDocuments: 'id, document_number, type, status, contact_id, customer_name, document_date, due_date, payment_status, source_document_id, project_id, department_id, tax_id, currency_code, sync_status, updated_at, created_at',
    salesDocumentItems: 'id, document_id, product_id, currency_code',
    purchaseDocuments: 'id, document_number, type, status, contact_id, supplier_name, document_date, due_date, payment_status, source_document_id, project_id, department_id, tax_id, currency_code, sync_status, updated_at, created_at',
    purchaseDocumentItems: 'id, document_id, product_id, currency_code',
    inventoryLots: 'id, product_id, quantity_remaining, received_at, source_type, created_at'
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();

    // ===== Currency setup =====
    const currencyTable = tx.table<Currency, string>('currencies');
    const currencyRateTable = tx.table<CurrencyRate, string>('currencyRates');

    if (!await currencyTable.get(BASE_CURRENCY_CODE)) {
      await currencyTable.put(buildBaseCurrency(now));
    }

    if (await currencyRateTable.where('currency_code').equals(BASE_CURRENCY_CODE).count() === 0) {
      await currencyRateTable.put(buildBaseCurrencyRate(now));
    }

    // ===== Sales documents =====
    const salesDocuments = await tx.table<SalesDocument, string>('salesDocuments').toArray();
    const salesDocumentsWithoutCurrency = salesDocuments
      .filter((document) => !document.currency_code || !document.exchange_rate)
      .map((document) => ({
        ...document,
        currency_code: document.currency_code ?? BASE_CURRENCY_CODE,
        currency_name: document.currency_name ?? 'Rupiah Indonesia',
        currency_symbol: document.currency_symbol ?? 'Rp',
        base_currency_code: document.base_currency_code ?? BASE_CURRENCY_CODE,
        exchange_rate: document.exchange_rate ?? 1,
        exchange_rate_source: document.exchange_rate_source ?? 'SYSTEM' as const,
        exchange_rate_basis: document.exchange_rate_basis ?? 'MID' as const,
        exchange_rate_date: document.exchange_rate_date ?? document.document_date,
        foreign_subtotal_amount: document.foreign_subtotal_amount ?? document.subtotal_amount,
        foreign_discount_amount: document.foreign_discount_amount ?? document.discount_amount,
        foreign_tax_amount: document.foreign_tax_amount ?? document.tax_amount,
        foreign_total_amount: document.foreign_total_amount ?? document.total_amount,
      }));
    if (salesDocumentsWithoutCurrency.length > 0) {
      await tx.table<SalesDocument, string>('salesDocuments').bulkPut(salesDocumentsWithoutCurrency);
    }

    // ===== Sales document items =====
    const salesItems = await tx.table<SalesDocumentItem, string>('salesDocumentItems').toArray();
    const salesItemsWithoutCurrency = salesItems
      .filter((item) => !item.currency_code || !item.exchange_rate)
      .map((item) => ({
        ...item,
        currency_code: item.currency_code ?? BASE_CURRENCY_CODE,
        exchange_rate: item.exchange_rate ?? 1,
        exchange_rate_source: item.exchange_rate_source ?? 'SYSTEM' as const,
        exchange_rate_basis: item.exchange_rate_basis ?? 'MID' as const,
        exchange_rate_date: item.exchange_rate_date ?? item.created_at.slice(0, 10),
        foreign_price: item.foreign_price ?? item.price,
        foreign_discount_amount: item.foreign_discount_amount ?? item.discount_amount,
        foreign_tax_base_amount: item.foreign_tax_base_amount ?? item.tax_base_amount,
        foreign_tax_amount: item.foreign_tax_amount ?? item.tax_amount,
        foreign_subtotal: item.foreign_subtotal ?? item.subtotal,
        foreign_total_amount: item.foreign_total_amount ?? item.total_amount,
      }));
    if (salesItemsWithoutCurrency.length > 0) {
      await tx.table<SalesDocumentItem, string>('salesDocumentItems').bulkPut(salesItemsWithoutCurrency);
    }

    // ===== Purchase documents =====
    const purchaseDocuments = await tx.table<PurchaseDocument, string>('purchaseDocuments').toArray();
    const purchaseDocumentsWithoutCurrency = purchaseDocuments
      .filter((document) => !document.currency_code || !document.exchange_rate)
      .map((document) => ({
        ...document,
        currency_code: document.currency_code ?? BASE_CURRENCY_CODE,
        currency_name: document.currency_name ?? 'Rupiah Indonesia',
        currency_symbol: document.currency_symbol ?? 'Rp',
        base_currency_code: document.base_currency_code ?? BASE_CURRENCY_CODE,
        exchange_rate: document.exchange_rate ?? 1,
        exchange_rate_source: document.exchange_rate_source ?? 'SYSTEM' as const,
        exchange_rate_basis: document.exchange_rate_basis ?? 'MID' as const,
        exchange_rate_date: document.exchange_rate_date ?? document.document_date,
        foreign_subtotal_amount: document.foreign_subtotal_amount ?? document.subtotal_amount,
        foreign_discount_amount: document.foreign_discount_amount ?? document.discount_amount,
        foreign_tax_amount: document.foreign_tax_amount ?? document.tax_amount,
        foreign_total_amount: document.foreign_total_amount ?? document.total_amount,
      }));
    if (purchaseDocumentsWithoutCurrency.length > 0) {
      await tx.table<PurchaseDocument, string>('purchaseDocuments').bulkPut(purchaseDocumentsWithoutCurrency);
    }

    // ===== Purchase items =====
    const purchaseItems = await tx.table<PurchaseDocumentItem, string>('purchaseDocumentItems').toArray();
    const purchaseItemsWithoutCurrency = purchaseItems
      .filter((item) => !item.currency_code || !item.exchange_rate)
      .map((item) => ({
        ...item,
        currency_code: item.currency_code ?? BASE_CURRENCY_CODE,
        exchange_rate: item.exchange_rate ?? 1,
        exchange_rate_source: item.exchange_rate_source ?? 'SYSTEM' as const,
        exchange_rate_basis: item.exchange_rate_basis ?? 'MID' as const,
        exchange_rate_date: item.exchange_rate_date ?? item.created_at.slice(0, 10),
        foreign_price: item.foreign_price ?? item.price,
        foreign_discount_amount: item.foreign_discount_amount ?? item.discount_amount,
        foreign_tax_base_amount: item.foreign_tax_base_amount ?? item.tax_base_amount,
        foreign_tax_amount: item.foreign_tax_amount ?? item.tax_amount,
        foreign_subtotal: item.foreign_subtotal ?? item.subtotal,
        foreign_total_amount: item.foreign_total_amount ?? item.total_amount,
      }));
    if (purchaseItemsWithoutCurrency.length > 0) {
      await tx.table<PurchaseDocumentItem, string>('purchaseDocumentItems').bulkPut(purchaseItemsWithoutCurrency);
    }

    // ===== Inventory opening lots =====
    const products = await tx.table<Product, string>('products').toArray();
    const openingLots: InventoryLot[] = products
      .filter((product) => Number(product.stock || 0) > 0 && Number(product.purchase_price || 0) > 0)
      .map((product) => ({
        id: crypto.randomUUID(),
        product_id: product.id,
        product_name: product.name,
        sku: product.sku,
        source_type: 'OPENING' as const,
        quantity_received: Number(product.stock),
        quantity_remaining: Number(product.stock),
        cost_per_unit: Number(product.purchase_price),
        received_at: product.created_at || now,
        created_at: now,
        updated_at: now,
      }));
    if (openingLots.length > 0) {
      await tx.table<InventoryLot, string>('inventoryLots').bulkAdd(openingLots);
    }
  });

  this.version(38).stores({
    cooperativeMembers: 'id, member_number, name, status, sync_status, updated_at, created_at',
    cooperativeSavingTransactions: 'id, member_id, member_number, saving_type, transaction_type, transaction_date, status, reversal_of_transaction_id, finance_transaction_id, journal_entry_id, sync_status, updated_at, created_at',
    cooperativeMemberSavingBalances: 'id, member_id, member_number, saving_type, sync_status, updated_at',
    cooperativeLoans: 'id, loan_number, member_id, member_number, status, application_date, disbursed_at, finance_transaction_id, journal_entry_id, sync_status, updated_at, created_at',
    cooperativeLoanInstallments: 'id, loan_id, loan_number, member_id, member_number, due_date, status, paid_at, sync_status, updated_at, created_at',
    cooperativeLoanPayments: 'id, payment_number, payment_type, loan_id, loan_number, installment_id, member_id, member_number, payment_date, status, reversal_of_payment_id, finance_transaction_id, journal_entry_id, sync_status, updated_at, created_at',
    cooperativeSettings: 'id, updated_at'
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const cooperativeSettings = tx.table<CooperativeSettings, string>('cooperativeSettings');

    if (!await cooperativeSettings.get('default')) {
      await cooperativeSettings.put({
        id: 'default',
        created_at: now,
        updated_at: now,
      });
    }
  });

  this.version(39).stores({
    companyProfileSetting: 'id, updated_at'
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const companyProfileSetting = tx.table<CompanyProfileSetting, string>('companyProfileSetting');

    if (!await companyProfileSetting.get('default')) {
      await companyProfileSetting.put(buildDefaultCompanyProfileSetting(now));
    }
  });

  this.version(40).stores({}).upgrade(async (tx) => {
    const markPendingCooperativeRecords = async <T extends { sync_status?: string; sync_error?: string }>(
      tableName: string,
    ) => {
      const table = tx.table<T, string>(tableName);
      const records = await table.toArray();
      const recordsWithoutSyncStatus = records
        .filter((record) => !record.sync_status)
        .map((record) => ({
          ...record,
          sync_status: 'pending' as const,
          sync_error: undefined,
        }));

      if (recordsWithoutSyncStatus.length > 0) {
        await table.bulkPut(recordsWithoutSyncStatus);
      }
    };

    await markPendingCooperativeRecords<CooperativeMember>('cooperativeMembers');
    await markPendingCooperativeRecords<CooperativeSavingTransaction>('cooperativeSavingTransactions');
    await markPendingCooperativeRecords<CooperativeMemberSavingBalance>('cooperativeMemberSavingBalances');
    await markPendingCooperativeRecords<CooperativeLoan>('cooperativeLoans');
    await markPendingCooperativeRecords<CooperativeLoanInstallment>('cooperativeLoanInstallments');
    await markPendingCooperativeRecords<CooperativeLoanPayment>('cooperativeLoanPayments');
  });

  this.version(41).stores({
    cooperativeMembers: 'id, member_number, name, area_id, status, sync_status, updated_at, created_at',
    cooperativeAreas: 'id, name, code, is_active, created_at',
    employees: 'id, name, user_id, is_active, created_at',
    employeeAreas: 'id, employee_id, area_id'
  });

  this.version(42).stores({
    authUsers: 'id, name, role, is_active, sync_status, created_at'
  });

  this.version(43).stores({
    authUsers: 'id, name, role, role_id, role_name, employee_id, is_active, sync_status, created_at',
    roles: 'id, name, code, is_system, is_owner, is_active, sync_status, updated_at, created_at',
    rolePermissions: 'id, [role_id+permission_code], role_id, permission_code, sync_status, updated_at, created_at'
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const roleTable = tx.table<Role, string>('roles');
    const rolePermissionTable = tx.table<RolePermission, string>('rolePermissions');
    const authUserTable = tx.table<AuthUser, string>('authUsers');

    const existingRoles = await roleTable.toArray();
    const existingRoleIds = new Set(existingRoles.map((role) => role.id));
    const missingSystemRoles = buildSystemRoles(now)
      .filter((role) => !existingRoleIds.has(role.id));

    if (missingSystemRoles.length > 0) {
      await roleTable.bulkPut(missingSystemRoles);
    }

    const existingRolePermissions = await rolePermissionTable.toArray();
    const existingRolePermissionIds = new Set(existingRolePermissions.map((permission) => permission.id));
    const missingSystemRolePermissions = buildSystemRolePermissions(now)
      .filter((permission) => !existingRolePermissionIds.has(permission.id));

    if (missingSystemRolePermissions.length > 0) {
      await rolePermissionTable.bulkPut(missingSystemRolePermissions);
    }

    const users = await authUserTable.toArray();
    const migratedUsers = users
      .filter((user) => !user.role_id && resolveLegacyRoleId(user.role))
      .map((user) => ({
        ...user,
        role_id: resolveLegacyRoleId(user.role),
        role_name: resolveLegacyRoleName(user.role),
      }));

    if (migratedUsers.length > 0) {
      await authUserTable.bulkPut(migratedUsers);
    }
  });

  this.version(44).stores({
    authUsers: 'id, name, email, role, role_id, role_name, employee_id, is_active, sync_status, created_at',
    employees: 'id, name, email, user_id, is_active, created_at',
  }).upgrade(async (tx) => {
    // Set default email for existing auth users who don't have one
    const authUsers = await tx.table<AuthUser, string>('authUsers').toArray();
    const authUsersWithoutEmail = authUsers
      .filter((user) => !user.email)
      .map((user) => ({
        ...user,
        email: `${user.name.toLowerCase().replace(/\s+/g, '')}@frayukti.com`,
        sync_status: 'pending' as const,
      }));

    if (authUsersWithoutEmail.length > 0) {
      await tx.table<AuthUser, string>('authUsers').bulkPut(authUsersWithoutEmail);
    }
  });

  this.version(45).stores({
    cooperativeLoanInstallments: 'id, loan_id, loan_number, member_id, member_number, due_date, status, collection_status, follow_up_date, paid_at, sync_status, updated_at, created_at',
  }).upgrade(async (tx) => {
    const installments = await tx.table<CooperativeLoanInstallment, string>('cooperativeLoanInstallments').toArray();
    const migratedInstallments = installments
      .filter((installment) => !installment.collection_status)
      .map((installment) => ({
        ...installment,
        collection_status: 'NONE' as const,
      }));

    if (migratedInstallments.length > 0) {
      await tx.table<CooperativeLoanInstallment, string>('cooperativeLoanInstallments').bulkPut(migratedInstallments);
    }
  });

  this.version(46).stores({
    purchaseDocuments: 'id, document_number, type, status, contact_id, supplier_name, document_date, due_date, payment_status, source_document_id, project_id, department_id, tax_id, cost_status, sync_status, updated_at, created_at',
    purchaseDocumentItems: 'id, document_id, product_id, cost_status',
    inventoryLots: 'id, product_id, quantity_remaining, cost_status, received_at, source_type, source_id, source_line_id, created_at',
    inventoryLotConsumptions: 'id, lot_id, product_id, source_type, source_id, source_line_id, created_at',
    purchaseCostReconciliations: 'id, purchase_document_id, supplier_invoice_number, created_at',
    purchaseCostReconciliationItems: 'id, reconciliation_id, purchase_document_item_id, product_id',
    transactionItems: 'id, transaction_id, product_id, hpp_status, created_at',
  }).upgrade(async (tx) => {
    const lots = await tx.table<InventoryLot, string>('inventoryLots').toArray();
    const migratedLots = lots
      .filter((lot) => !lot.cost_status)
      .map((lot) => ({
        ...lot,
        cost_status: 'FINAL' as const,
        final_cost_per_unit: lot.cost_per_unit,
      }));

    if (migratedLots.length > 0) {
      await tx.table<InventoryLot, string>('inventoryLots').bulkPut(migratedLots);
    }

    const transactionItems = await tx.table<TransactionItem, string>('transactionItems').toArray();
    const migratedTransactionItems = transactionItems
      .filter((item) => !item.hpp_status || !item.profit_status)
      .map((item) => ({
        ...item,
        hpp_status: item.hpp_status ?? 'FINAL' as const,
        profit_status: item.profit_status ?? 'FINAL' as const,
      }));

    if (migratedTransactionItems.length > 0) {
      await tx.table<TransactionItem, string>('transactionItems').bulkPut(migratedTransactionItems);
    }
  });

  this.version(47).stores({
    cashierSessions: 'id, session_number, status, cashier_user_id, opened_at, closed_at, balance_status, created_at, updated_at',
    transactions: 'id, transaction_number, payment_method, cashier_session_id, cashier_user_id, created_at',
  });

  this.version(48).stores({
    cooperativeLoans: 'id, loan_number, member_id, member_number, status, interest_calculation_type, billing_frequency, application_date, disbursed_at, finance_transaction_id, journal_entry_id, sync_status, updated_at, created_at',
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const loanTable = tx.table<CooperativeLoan, string>('cooperativeLoans');
    const loans = await loanTable.toArray();
    const migratedLoans = loans
      .filter((loan) => !loan.interest_calculation_type || !loan.billing_frequency || !loan.installment_count)
      .map((loan) => ({
        ...loan,
        interest_calculation_type: loan.interest_calculation_type ?? 'MONTHLY_RATE' as const,
        billing_frequency: loan.billing_frequency ?? 'MONTHLY' as const,
        installment_count: loan.installment_count ?? loan.tenor_months,
        loan_service_rate: loan.loan_service_rate ?? loan.interest_rate_per_month,
        loan_service_amount: loan.loan_service_amount ?? loan.total_interest_amount,
        admin_fee_rate: loan.admin_fee_rate ?? 0,
        admin_fee_amount: loan.admin_fee_amount ?? 0,
        mandatory_saving_rate: loan.mandatory_saving_rate ?? 0,
        mandatory_saving_amount: loan.mandatory_saving_amount ?? 0,
        deduction_method: loan.deduction_method ?? 'NONE' as const,
        net_disbursement_amount: loan.net_disbursement_amount ?? loan.principal_amount,
      }));

    if (migratedLoans.length > 0) {
      await loanTable.bulkPut(migratedLoans);
    }

    let adminIncomeAccountForMapping: ChartOfAccount | undefined;
    const adminIncomeAccountSeed = DEFAULT_CHART_OF_ACCOUNTS.find((account) => account.id === 'cooperative-loan-admin-income');
    if (adminIncomeAccountSeed) {
      const chartOfAccounts = tx.table<ChartOfAccount, string>('chartOfAccounts');
      const existingAccount = await chartOfAccounts.get(adminIncomeAccountSeed.id)
        ?? await chartOfAccounts.where('code').equals(adminIncomeAccountSeed.code).first();

      if (!existingAccount) {
        adminIncomeAccountForMapping = {
          ...adminIncomeAccountSeed,
          created_at: now,
          updated_at: now,
        };
        await chartOfAccounts.put(adminIncomeAccountForMapping);
      } else {
        adminIncomeAccountForMapping = existingAccount;
      }
    }

    const adminFeeMappingSeed = DEFAULT_FINANCE_ACCOUNT_MAPPINGS.find((mapping) => mapping.key === 'KSP_ADMIN_PINJAMAN');
    if (adminFeeMappingSeed) {
      const mappings = tx.table<FinanceAccountMapping, string>('financeAccountMappings');
      const existingMapping = await mappings.get(adminFeeMappingSeed.key);

      if (!existingMapping) {
        await mappings.put({
          ...adminFeeMappingSeed,
          id: adminFeeMappingSeed.key,
          account_id: adminIncomeAccountForMapping?.id ?? adminFeeMappingSeed.account_id,
          account_code: adminIncomeAccountForMapping?.code ?? adminFeeMappingSeed.account_code,
          account_name: adminIncomeAccountForMapping?.name ?? adminFeeMappingSeed.account_name,
          account_type: adminIncomeAccountForMapping?.type ?? adminFeeMappingSeed.account_type,
          created_at: now,
          updated_at: now,
        });
      }
    }

    const syncQueue = tx.table<SyncQueueItem, string>('syncQueue');
    const queueItems = await syncQueue.toArray();
    const migratedQueueItems = queueItems
      .filter((queueItem) => queueItem.entity === 'cooperativeLoans' && queueItem.payload && typeof queueItem.payload === 'object')
      .map((queueItem) => {
        const payload = queueItem.payload as Partial<CooperativeLoan>;
        return {
          ...queueItem,
          payload: {
            ...payload,
            interest_calculation_type: payload.interest_calculation_type ?? 'MONTHLY_RATE',
            billing_frequency: payload.billing_frequency ?? 'MONTHLY',
            installment_count: payload.installment_count ?? payload.tenor_months,
            loan_service_rate: payload.loan_service_rate ?? payload.interest_rate_per_month,
            loan_service_amount: payload.loan_service_amount ?? payload.total_interest_amount,
            admin_fee_rate: payload.admin_fee_rate ?? 0,
            admin_fee_amount: payload.admin_fee_amount ?? 0,
            mandatory_saving_rate: payload.mandatory_saving_rate ?? 0,
            mandatory_saving_amount: payload.mandatory_saving_amount ?? 0,
            deduction_method: payload.deduction_method ?? 'NONE',
            net_disbursement_amount: payload.net_disbursement_amount ?? payload.principal_amount,
          },
          updated_at: now,
        };
      });

    if (migratedQueueItems.length > 0) {
      await syncQueue.bulkPut(migratedQueueItems);
    }
  });

  this.version(49).stores({
    cooperativeMembers: 'id, member_number, name, area_id, officer_id, status, sync_status, updated_at, created_at',
  });

  this.version(50).stores({
    cooperativeFieldCashSessions: 'id, session_number, status, employee_id, cash_account_id, opened_at, closed_at, balance_status, created_at, updated_at',
    financeTransactions: 'id, type, category, account_id, cash_account_id, field_cash_session_id, field_employee_id, transfer_group_id, sync_status, updated_at, created_at, reference_id',
    employees: 'id, name, email, phone, user_id, login_role_id, field_cash_account_id, is_active, updated_at, created_at',
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const rolePermissionTable = tx.table<RolePermission, string>('rolePermissions');
    const existingRolePermissions = await rolePermissionTable.toArray();
    const existingRolePermissionIds = new Set(existingRolePermissions.map((permission) => permission.id));
    const missingSystemRolePermissions = buildSystemRolePermissions(now)
      .filter((permission) => !existingRolePermissionIds.has(permission.id));

    if (missingSystemRolePermissions.length > 0) {
      await rolePermissionTable.bulkPut(missingSystemRolePermissions);
    }

    const employees = await tx.table<Employee, string>('employees').toArray();
    const employeesWithFieldCashSnapshot = employees
      .filter((employee) => employee.field_cash_account_id && (!employee.field_cash_account_code || !employee.field_cash_account_name))
      .map(async (employee): Promise<Employee> => {
        const account = await tx.table<ChartOfAccount, string>('chartOfAccounts').get(employee.field_cash_account_id ?? '');
        return {
          ...employee,
          field_cash_account_code: employee.field_cash_account_code ?? account?.code,
          field_cash_account_name: employee.field_cash_account_name ?? account?.name,
          updated_at: employee.updated_at ?? now,
        };
      });

    if (employeesWithFieldCashSnapshot.length > 0) {
      await tx.table<Employee, string>('employees').bulkPut(await Promise.all(employeesWithFieldCashSnapshot));
    }
  });

  this.version(51).stores({
    cooperativeLoanPayments: 'id, payment_number, payment_type, loan_id, loan_number, installment_id, member_id, member_number, collector_id, received_by, payment_date, posted_at, status, reversal_of_payment_id, finance_transaction_id, journal_entry_id, sync_status, updated_at, created_at',
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const members = await tx.table<CooperativeMember, string>('cooperativeMembers').toArray();
    const memberById = new Map(members.map((member) => [member.id, member]));
    const payments = await tx.table<CooperativeLoanPayment, string>('cooperativeLoanPayments').toArray();
    const migratedPayments = payments
      .filter((payment) => !payment.posted_at || !payment.collector_id)
      .map((payment) => {
        const member = memberById.get(payment.member_id);
        const collectorId = payment.collector_id ?? member?.officer_id;
        return {
          ...payment,
          collector_id: collectorId,
          collector_name: payment.collector_name ?? (
            collectorId === member?.officer_id ? member?.officer_name : undefined
          ),
          collector_position: payment.collector_position ?? (
            collectorId === member?.officer_id ? member?.officer_position : undefined
          ),
          received_by: payment.received_by ?? payment.created_by,
          received_by_name: payment.received_by_name ?? payment.created_by_name,
          posted_at: payment.posted_at ?? payment.created_at,
        };
      });

    if (migratedPayments.length > 0) {
      await tx.table<CooperativeLoanPayment, string>('cooperativeLoanPayments').bulkPut(migratedPayments);
    }

    const syncQueue = tx.table<SyncQueueItem, string>('syncQueue');
    const queueItems = await syncQueue.toArray();
    const migratedQueueItems = queueItems
      .filter((queueItem) => queueItem.entity === 'cooperativeLoanPayments' && queueItem.payload && typeof queueItem.payload === 'object')
      .map((queueItem) => {
        const payload = queueItem.payload as Partial<CooperativeLoanPayment>;
        const member = payload.member_id ? memberById.get(payload.member_id) : undefined;
        const collectorId = payload.collector_id ?? member?.officer_id;
        return {
          ...queueItem,
          payload: {
            ...payload,
            collector_id: collectorId,
            collector_name: payload.collector_name ?? (
              collectorId === member?.officer_id ? member?.officer_name : undefined
            ),
            collector_position: payload.collector_position ?? (
              collectorId === member?.officer_id ? member?.officer_position : undefined
            ),
            received_by: payload.received_by ?? payload.created_by,
            received_by_name: payload.received_by_name ?? payload.created_by_name,
            posted_at: payload.posted_at ?? payload.created_at ?? now,
          },
          updated_at: now,
        };
      });

    if (migratedQueueItems.length > 0) {
      await syncQueue.bulkPut(migratedQueueItems);
    }
  });

  this.version(52).stores({
    employees: 'id, name, email, phone, user_id, login_role_id, field_cash_account_id, is_active, updated_at, created_at',
  });

  this.version(53).stores({
    stockOpnames: 'id, opname_number, status, counted_at, posted_at, warehouse_id, sync_status, updated_at, created_at',
    stockOpnameItems: 'id, opname_id, product_id, quantity_delta, created_at',
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const rolePermissionTable = tx.table<RolePermission, string>('rolePermissions');
    const existingRolePermissions = await rolePermissionTable.toArray();
    const existingRolePermissionIds = new Set(existingRolePermissions.map((permission) => permission.id));
    const missingSystemRolePermissions = buildSystemRolePermissions(now)
      .filter((permission) => !existingRolePermissionIds.has(permission.id));

    if (missingSystemRolePermissions.length > 0) {
      await rolePermissionTable.bulkPut(missingSystemRolePermissions);
    }
  });

  this.version(54).stores({
    stockOpnames: 'id, opname_number, status, counted_at, reviewed_at, posted_at, warehouse_id, sync_status, updated_at, created_at',
    stockOpnameItems: 'id, opname_id, product_id, quantity_delta, created_at',
  });

  this.version(55).stores({
    contacts: 'id, name, contact_type, phone, email, is_active, is_member, membership_number, sync_status, created_at',
    transactions: 'id, transaction_number, payment_method, cashier_session_id, cashier_user_id, member_contact_id, member_number, created_at',
    membershipPointTransactions: 'id, contact_id, membership_number, transaction_id, transaction_number, type, created_at',
    membershipSettings: 'id, updated_at',
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const membershipSettings = tx.table<MembershipSetting, string>('membershipSettings');

    if (!await membershipSettings.get('default')) {
      await membershipSettings.put({
        id: 'default',
        earning_amount: 1000,
        earning_points: 1,
        point_value: 1,
        redeem_enabled: true,
        created_at: now,
        updated_at: now,
      });
    }
  });

  this.version(56).stores({
    productRecipes: 'id, finished_product_id, finished_product_name, created_at, updated_at',
    productRecipeItems: 'id, recipe_id, material_product_id',
    productionOrders: 'id, production_number, status, finished_product_id, produced_at, sync_status, updated_at, created_at',
    productionOrderItems: 'id, production_order_id, material_product_id',
    productionOrderCosts: 'id, production_order_id',
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const rolePermissionTable = tx.table<RolePermission, string>('rolePermissions');
    const existingRolePermissions = await rolePermissionTable.toArray();
    const existingRolePermissionIds = new Set(existingRolePermissions.map((permission) => permission.id));
    const missingSystemRolePermissions = buildSystemRolePermissions(now)
      .filter((permission) => !existingRolePermissionIds.has(permission.id));

    if (missingSystemRolePermissions.length > 0) {
      await rolePermissionTable.bulkPut(missingSystemRolePermissions);
    }
  });

  this.version(57).stores({
    employeeCollectionSchedules: 'id, employee_id, area_id, weekday, [employee_id+area_id], [employee_id+area_id+weekday], is_active, effective_from, effective_until, updated_at, created_at',
    cooperativeLoans: 'id, loan_number, member_id, member_number, officer_id, area_id, collection_schedule_id, collection_weekday, status, interest_calculation_type, billing_frequency, application_date, disbursed_at, finance_transaction_id, journal_entry_id, sync_status, updated_at, created_at',
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const loanTable = tx.table<CooperativeLoan, string>('cooperativeLoans');
    const [loans, members, installments] = await Promise.all([
      loanTable.toArray(),
      tx.table<CooperativeMember, string>('cooperativeMembers').toArray(),
      tx.table<CooperativeLoanInstallment, string>('cooperativeLoanInstallments').toArray(),
    ]);
    const memberById = new Map(members.map((member) => [member.id, member]));
    const firstInstallmentByLoanId = new Map<string, CooperativeLoanInstallment>();

    installments.forEach((installment) => {
      const current = firstInstallmentByLoanId.get(installment.loan_id);
      if (
        !current ||
        installment.installment_number < current.installment_number ||
        (
          installment.installment_number === current.installment_number &&
          installment.due_date < current.due_date
        )
      ) {
        firstInstallmentByLoanId.set(installment.loan_id, installment);
      }
    });

    const migratedLoans = loans.flatMap((loan): CooperativeLoan[] => {
      if (loan.status !== 'DISBURSED' && loan.status !== 'PAID_OFF') return [];

      const member = memberById.get(loan.member_id);
      const officerId = loan.officer_id ?? member?.officer_id;
      const areaId = loan.area_id ?? member?.area_id;
      const firstInstallment = firstInstallmentByLoanId.get(loan.id);
      const firstDueDate = firstInstallment
        ? dayjs(firstInstallment.due_date).tz()
        : undefined;
      const dueDateWeekday = firstDueDate?.isValid()
        ? ((firstDueDate.day() || 7) as CooperativeLoan['collection_weekday'])
        : undefined;
      const migratedLoan: CooperativeLoan = {
        ...loan,
        officer_id: officerId,
        officer_name: loan.officer_name ?? (
          member && officerId === member.officer_id ? member.officer_name : undefined
        ),
        officer_position: loan.officer_position ?? (
          member && officerId === member.officer_id ? member.officer_position : undefined
        ),
        area_id: areaId,
        area_name: loan.area_name ?? (
          member && areaId === member.area_id ? member.area_name : undefined
        ),
        area_code: loan.area_code ?? (
          member && areaId === member.area_id ? member.area_code : undefined
        ),
        collection_weekday: loan.collection_weekday ?? dueDateWeekday,
      };
      const changed =
        migratedLoan.officer_id !== loan.officer_id ||
        migratedLoan.officer_name !== loan.officer_name ||
        migratedLoan.officer_position !== loan.officer_position ||
        migratedLoan.area_id !== loan.area_id ||
        migratedLoan.area_name !== loan.area_name ||
        migratedLoan.area_code !== loan.area_code ||
        migratedLoan.collection_weekday !== loan.collection_weekday;

      if (!changed) return [];
      return [{
        ...migratedLoan,
        sync_status: 'pending',
        sync_error: undefined,
        updated_at: now,
      }];
    });

    if (migratedLoans.length > 0) {
      await loanTable.bulkPut(migratedLoans);
    }
  });

  this.version(58).stores({
    authSessions: 'id, user_id, last_active_at, server_session_expires_at',
    cooperativeLoanPayments: 'id, payment_number, payment_type, loan_id, loan_number, installment_id, member_id, member_number, collector_id, received_by, payment_date, posted_at, status, reversal_of_payment_id, finance_transaction_id, journal_entry_id, idempotency_key, sync_status, updated_at, created_at',
    cooperativeLoanCollectionEvents: 'id, installment_id, loan_id, member_id, collection_status, contacted_at, actor_user_id, actor_employee_id, created_at',
  }).upgrade(async (tx) => {
    const installments = await tx
      .table<CooperativeLoanInstallment, string>('cooperativeLoanInstallments')
      .toArray();
    const events = installments.flatMap((installment): CooperativeLoanCollectionEvent[] => {
      if (
        !installment.collection_status ||
        installment.collection_status === 'NONE' ||
        !installment.collection_notes?.trim()
      ) {
        return [];
      }

      const contactedAt = installment.last_contacted_at ?? installment.updated_at;
      return [{
        id: `legacy-${installment.id}-${contactedAt}`,
        installment_id: installment.id,
        loan_id: installment.loan_id,
        loan_number: installment.loan_number,
        member_id: installment.member_id,
        member_number: installment.member_number,
        member_name: installment.member_name,
        collection_status: installment.collection_status,
        follow_up_date: installment.follow_up_date,
        collection_notes: installment.collection_notes,
        contacted_at: contactedAt,
        created_at: contactedAt,
        sync_status: 'pending',
      }];
    });

    if (events.length > 0) {
      await tx
        .table<CooperativeLoanCollectionEvent, string>('cooperativeLoanCollectionEvents')
        .bulkPut(events);
    }
  });

  this.version(59).stores({}).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const rolePermissionTable = tx.table<RolePermission, string>('rolePermissions');
    const existingPermissions = await rolePermissionTable.toArray();
    const existingIds = new Set(existingPermissions.map((permission) => permission.id));
    const legacyPermissionExpansions: Partial<Record<
      RolePermission['permission_code'],
      RolePermission['permission_code'][]
    >> = {
      STOCK_ACCESS: ['PRODUCT_MANAGE', 'UNIT_MANAGE'],
      SETTINGS_ACCESS: [
        'PROMO_MANAGE',
        'CONTACT_MANAGE',
        'WAREHOUSE_MANAGE',
        'CURRENCY_MANAGE',
        'AREA_MANAGE',
        'EMPLOYEE_MANAGE',
        'DEPARTMENT_MANAGE',
        'PROJECT_MANAGE',
        'TAX_MANAGE',
      ],
    };

    const migratedPermissions = existingPermissions.flatMap((legacyPermission) => (
      (legacyPermissionExpansions[legacyPermission.permission_code] ?? []).flatMap((permissionCode) => {
        const id = `${legacyPermission.role_id}:${permissionCode}`;
        if (existingIds.has(id)) return [];
        existingIds.add(id);

        return [{
          id,
          role_id: legacyPermission.role_id,
          permission_code: permissionCode,
          created_at: now,
          updated_at: now,
          sync_status: 'pending' as const,
        }];
      })
    ));

    const systemPermissions = buildSystemRolePermissions(now)
      .filter((permission) => !existingIds.has(permission.id));

    if (migratedPermissions.length > 0 || systemPermissions.length > 0) {
      await rolePermissionTable.bulkPut([
        ...migratedPermissions,
        ...systemPermissions,
      ]);
    }
  });

  this.version(60).stores({}).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const rolePermissionTable = tx.table<RolePermission, string>('rolePermissions');
    const existingPermissions = await rolePermissionTable.toArray();
    const existingIds = new Set(existingPermissions.map((permission) => permission.id));
    const documentPermissions: RolePermission['permission_code'][] = [
      'SALES_QUOTATION_MANAGE',
      'SALES_ORDER_MANAGE',
      'SALES_DELIVERY_MANAGE',
      'SALES_INVOICE_MANAGE',
      'PURCHASE_REQUEST_MANAGE',
      'PURCHASE_RFQ_MANAGE',
      'PURCHASE_ORDER_MANAGE',
      'PURCHASE_RECEIPT_MANAGE',
      'PURCHASE_INVOICE_MANAGE',
      'PURCHASE_RETURN_MANAGE',
    ];
    const migratedPermissions = existingPermissions
      .filter((permission) => permission.permission_code === 'FINANCE_ACCESS')
      .flatMap((legacyPermission) => documentPermissions.flatMap((permissionCode) => {
        const id = `${legacyPermission.role_id}:${permissionCode}`;
        if (existingIds.has(id)) return [];
        existingIds.add(id);

        return [{
          id,
          role_id: legacyPermission.role_id,
          permission_code: permissionCode,
          created_at: now,
          updated_at: now,
          sync_status: 'pending' as const,
        }];
      }));
    const systemPermissions = buildSystemRolePermissions(now)
      .filter((permission) => !existingIds.has(permission.id));

    if (migratedPermissions.length > 0 || systemPermissions.length > 0) {
      await rolePermissionTable.bulkPut([
        ...migratedPermissions,
        ...systemPermissions,
      ]);
    }
  });

  this.version(61).stores({}).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const rolePermissionTable = tx.table<RolePermission, string>('rolePermissions');
    const existingPermissions = await rolePermissionTable.toArray();
    const existingIds = new Set(existingPermissions.map((permission) => permission.id));
    const legacyPermissionExpansions: Partial<Record<
      RolePermission['permission_code'],
      RolePermission['permission_code'][]
    >> = {
      CASHIER_ACCESS: [
        'REPORT_POS_SALES_VIEW',
        'REPORT_DEPOSIT_VIEW',
        'REPORT_TRANSACTION_DETAIL_VIEW',
      ],
      STOCK_PURCHASE_ACCESS: ['REPORT_PURCHASE_VIEW'],
      FINANCE_ACCESS: [
        'REPORT_EXPENSE_VIEW',
        'REPORT_PAYROLL_VIEW',
        'REPORT_PROFIT_LOSS_VIEW',
        'REPORT_AGING_VIEW',
      ],
      STOCK_ACCESS: ['REPORT_STOCK_CARD_VIEW'],
      COOPERATIVE_REPORT_VIEW: [
        'COOPERATIVE_OVERVIEW_REPORT_VIEW',
        'COOPERATIVE_CASH_REPORT_VIEW',
        'COOPERATIVE_DAILY_TARGET_REPORT_VIEW',
        'COOPERATIVE_DAILY_STORTING_REPORT_VIEW',
        'COOPERATIVE_DAILY_DROP_REPORT_VIEW',
        'COOPERATIVE_WEEKLY_DROP_REPORT_VIEW',
        'COOPERATIVE_MEMBER_REGISTER_REPORT_VIEW',
        'COOPERATIVE_INSTALLMENT_BOOK_REPORT_VIEW',
        'COOPERATIVE_CASH_FLOW_REPORT_VIEW',
        'COOPERATIVE_LEDGER_REPORT_VIEW',
      ],
    };
    const migratedPermissions = existingPermissions.flatMap((legacyPermission) => (
      (legacyPermissionExpansions[legacyPermission.permission_code] ?? []).flatMap((permissionCode) => {
        const id = `${legacyPermission.role_id}:${permissionCode}`;
        if (existingIds.has(id)) return [];
        existingIds.add(id);

        return [{
          id,
          role_id: legacyPermission.role_id,
          permission_code: permissionCode,
          created_at: now,
          updated_at: now,
          sync_status: 'pending' as const,
        }];
      })
    ));
    const systemPermissions = buildSystemRolePermissions(now)
      .filter((permission) => !existingIds.has(permission.id));

    if (migratedPermissions.length > 0 || systemPermissions.length > 0) {
      await rolePermissionTable.bulkPut([
        ...migratedPermissions,
        ...systemPermissions,
      ]);
    }
  });

  this.version(62).stores({}).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const rolePermissionTable = tx.table<RolePermission, string>('rolePermissions');
    const existingPermissions = await rolePermissionTable.toArray();
    const existingIds = new Set(existingPermissions.map((permission) => permission.id));
    const migratedPermissions = existingPermissions
      .filter((permission) => permission.permission_code === 'COOPERATIVE_REPORT_VIEW')
      .flatMap((legacyPermission) => {
        const permissionCode: RolePermission['permission_code'] = 'COOPERATIVE_IPTW_REPORT_VIEW';
        const id = `${legacyPermission.role_id}:${permissionCode}`;
        if (existingIds.has(id)) return [];
        existingIds.add(id);

        return [{
          id,
          role_id: legacyPermission.role_id,
          permission_code: permissionCode,
          created_at: now,
          updated_at: now,
          sync_status: 'pending' as const,
        }];
      });
    const systemPermissions = buildSystemRolePermissions(now)
      .filter((permission) => !existingIds.has(permission.id));

    if (migratedPermissions.length > 0 || systemPermissions.length > 0) {
      await rolePermissionTable.bulkPut([
        ...migratedPermissions,
        ...systemPermissions,
      ]);
    }
  });

  this.version(63).stores({}).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const accountSeed = DEFAULT_CHART_OF_ACCOUNTS.find(
      (account) => account.id === 'cooperative-saving-interest-expense',
    );
    const mappingSeed = DEFAULT_FINANCE_ACCOUNT_MAPPINGS.find(
      (mapping) => mapping.key === FINANCE_CATEGORIES.KSP_SAVING_INTEREST_PAYOUT,
    );
    if (!accountSeed || !mappingSeed) return;

    const accountTable = tx.table<ChartOfAccount, string>('chartOfAccounts');
    const mappingTable = tx.table<FinanceAccountMapping, string>('financeAccountMappings');

    if (!await accountTable.get(accountSeed.id)) {
      await accountTable.put({
        ...accountSeed,
        created_at: now,
        updated_at: now,
      });
    }
    if (!await mappingTable.get(mappingSeed.key)) {
      await mappingTable.put({
        ...mappingSeed,
        id: mappingSeed.key,
        created_at: now,
        updated_at: now,
      });
    }
  });

  this.version(64).stores({
    payrollRuns: 'id, payroll_number, period_start, period_end, status, paid_at, finance_transaction_id, created_at, updated_at',
    payrollRunItems: 'id, payroll_run_id, employee_id',
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const chartOfAccounts = tx.table<ChartOfAccount, string>('chartOfAccounts');
    const financeAccountMappings = tx.table<FinanceAccountMapping, string>('financeAccountMappings');

    const salaryAccountSeed = DEFAULT_CHART_OF_ACCOUNTS.find((account) => account.id === 'salary-expense');
    if (salaryAccountSeed) {
      const existingSalaryAccount = await chartOfAccounts.get(salaryAccountSeed.id)
        ?? await chartOfAccounts.where('code').equals(salaryAccountSeed.code).first();

      if (!existingSalaryAccount) {
        await chartOfAccounts.put({
          ...salaryAccountSeed,
          created_at: now,
          updated_at: now,
        });
      }
    }

    const salaryMappingSeed = DEFAULT_FINANCE_ACCOUNT_MAPPINGS.find((mapping) => (
      mapping.key === FINANCE_CATEGORIES.PAYROLL
    ));
    if (salaryMappingSeed && !await financeAccountMappings.get(salaryMappingSeed.key)) {
      const salaryAccount = await chartOfAccounts.get(salaryMappingSeed.account_id)
        ?? await chartOfAccounts.where('code').equals(salaryMappingSeed.account_code).first();

      if (salaryAccount) {
        await financeAccountMappings.put({
          ...salaryMappingSeed,
          id: salaryMappingSeed.key,
          account_id: salaryAccount.id,
          account_code: salaryAccount.code,
          account_name: salaryAccount.name,
          account_type: salaryAccount.type,
          created_at: now,
          updated_at: now,
        });
      }
    }
  });

  this.version(65).stores({
    employeeCashAdvances: 'id, advance_number, employee_id, status, disbursed_at, finance_transaction_id, created_at, updated_at',
    employeeCashAdvanceRepayments: 'id, cash_advance_id, payroll_run_id, payroll_run_item_id, employee_id, status, [cash_advance_id+status], [payroll_run_id+status], created_at, updated_at',
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const chartOfAccounts = tx.table<ChartOfAccount, string>('chartOfAccounts');
    const financeAccountMappings = tx.table<FinanceAccountMapping, string>('financeAccountMappings');
    const payrollRuns = tx.table<PayrollRun, string>('payrollRuns');
    const payrollRunItems = tx.table<PayrollRunItem, string>('payrollRunItems');

    const cashAdvanceAccountSeed = DEFAULT_CHART_OF_ACCOUNTS.find((account) => (
      account.id === 'employee-cash-advance-receivable'
    ));
    if (cashAdvanceAccountSeed) {
      const existingCashAdvanceAccount = await chartOfAccounts.get(cashAdvanceAccountSeed.id)
        ?? await chartOfAccounts.where('code').equals(cashAdvanceAccountSeed.code).first();

      if (!existingCashAdvanceAccount) {
        await chartOfAccounts.put({
          ...cashAdvanceAccountSeed,
          created_at: now,
          updated_at: now,
        });
      }
    }

    const cashAdvanceMappingSeed = DEFAULT_FINANCE_ACCOUNT_MAPPINGS.find((mapping) => (
      mapping.key === FINANCE_CATEGORIES.EMPLOYEE_CASH_ADVANCE
    ));
    if (cashAdvanceMappingSeed && !await financeAccountMappings.get(cashAdvanceMappingSeed.key)) {
      const cashAdvanceAccount = await chartOfAccounts.get(cashAdvanceMappingSeed.account_id)
        ?? await chartOfAccounts.where('code').equals(cashAdvanceMappingSeed.account_code).first();

      if (cashAdvanceAccount) {
        await financeAccountMappings.put({
          ...cashAdvanceMappingSeed,
          id: cashAdvanceMappingSeed.key,
          account_id: cashAdvanceAccount.id,
          account_code: cashAdvanceAccount.code,
          account_name: cashAdvanceAccount.name,
          account_type: cashAdvanceAccount.type,
          created_at: now,
          updated_at: now,
        });
      }
    }

    const runUpdates = (await payrollRuns.toArray())
      .filter((run) => run.other_deduction_amount === undefined || run.cash_advance_deduction_amount === undefined)
      .map((run): PayrollRun => ({
        ...run,
        other_deduction_amount: Number(run.other_deduction_amount ?? run.deduction_amount ?? 0),
        cash_advance_deduction_amount: Number(run.cash_advance_deduction_amount ?? 0),
        deduction_amount: Number(run.deduction_amount ?? 0),
        updated_at: run.updated_at ?? now,
      }));

    if (runUpdates.length > 0) {
      await payrollRuns.bulkPut(runUpdates);
    }

    const itemUpdates = (await payrollRunItems.toArray())
      .filter((item) => item.other_deduction_amount === undefined || item.cash_advance_deduction_amount === undefined)
      .map((item): PayrollRunItem => ({
        ...item,
        other_deduction_amount: Number(item.other_deduction_amount ?? item.deduction_amount ?? 0),
        cash_advance_deduction_amount: Number(item.cash_advance_deduction_amount ?? 0),
        deduction_amount: Number(item.deduction_amount ?? 0),
        updated_at: item.updated_at ?? now,
      }));

    if (itemUpdates.length > 0) {
      await payrollRunItems.bulkPut(itemUpdates);
    }
  });

  this.version(66).stores({}).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const rolePermissionTable = tx.table<RolePermission, string>('rolePermissions');
    const existingPermissions = await rolePermissionTable.toArray();
    const existingIds = new Set(existingPermissions.map((permission) => permission.id));
    const payrollPermissionCode: RolePermission['permission_code'] = 'REPORT_PAYROLL_VIEW';
    const migratedPermissions = existingPermissions
      .filter((permission) => permission.permission_code === 'FINANCE_ACCESS')
      .flatMap((legacyPermission) => {
        const id = `${legacyPermission.role_id}:${payrollPermissionCode}`;
        if (existingIds.has(id)) return [];
        existingIds.add(id);

        return [{
          id,
          role_id: legacyPermission.role_id,
          permission_code: payrollPermissionCode,
          created_at: now,
          updated_at: now,
          sync_status: 'pending' as const,
        }];
      });
    const systemPermissions = buildSystemRolePermissions(now)
      .filter((permission) => !existingIds.has(permission.id));

    if (migratedPermissions.length > 0 || systemPermissions.length > 0) {
      await rolePermissionTable.bulkPut([
        ...migratedPermissions,
        ...systemPermissions,
      ]);
    }
  });

  this.version(67).stores({}).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const rolePermissionTable = tx.table<RolePermission, string>('rolePermissions');
    const existingPermissions = await rolePermissionTable.toArray();
    const existingIds = new Set(existingPermissions.map((permission) => permission.id));
    const incomePermissionCode: RolePermission['permission_code'] = 'REPORT_INCOME_VIEW';
    const migratedPermissions = existingPermissions
      .filter((permission) => (
        permission.permission_code === 'FINANCE_ACCESS' ||
        permission.permission_code === 'REPORT_EXPENSE_VIEW'
      ))
      .flatMap((legacyPermission) => {
        const id = `${legacyPermission.role_id}:${incomePermissionCode}`;
        if (existingIds.has(id)) return [];
        existingIds.add(id);

        return [{
          id,
          role_id: legacyPermission.role_id,
          permission_code: incomePermissionCode,
          created_at: now,
          updated_at: now,
          sync_status: 'pending' as const,
        }];
      });
    const systemPermissions = buildSystemRolePermissions(now)
      .filter((permission) => !existingIds.has(permission.id));

    if (migratedPermissions.length > 0 || systemPermissions.length > 0) {
      await rolePermissionTable.bulkPut([
        ...migratedPermissions,
        ...systemPermissions,
      ]);
    }
  });

  this.version(68).stores({}).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const enabledModules = tx.table<EnabledModule, string>('enabledModules');
    const generalLedgerSetting = tx.table<GeneralLedgerSetting, string>('generalLedgerSetting');
    const journalEntries = tx.table<JournalEntry, string>('journalEntries');
    const journalEntryLines = tx.table<JournalEntryLine, string>('journalEntryLines');
    const module = await enabledModules.get('GENERAL_LEDGER');
    const setting = await generalLedgerSetting.get('default');

    if (!module?.is_enabled || !setting?.is_ready || !setting.cutoff_date) return;

    const roundCurrency = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
    const amountOrZero = (value: number | undefined) => {
      const amount = Number(value || 0);
      return Number.isFinite(amount) ? roundCurrency(amount) : 0;
    };
    const isBeforeCutoff = (entryDate: string) => entryDate.slice(0, 10) < setting.cutoff_date!.slice(0, 10);

    const accounts = await tx.table<ChartOfAccount, string>('chartOfAccounts').toArray();
    const accountById = new Map(accounts.map((account) => [account.id, account]));
    const accountByCode = new Map(accounts.map((account) => [account.code, account]));
    const findPostableAccount = (ids: string[], codes: string[]) => {
      const account = ids
        .map((id) => accountById.get(id))
        .find(Boolean)
        ?? codes.map((code) => accountByCode.get(code)).find(Boolean);

      return account?.is_active && account.is_postable ? account : undefined;
    };
    const findCashAccount = (accountId?: string, paymentMethod?: string) => {
      const selectedAccount = accountId ? accountById.get(accountId) : undefined;
      if (selectedAccount?.is_active && selectedAccount.is_postable && selectedAccount.type === 'ASSET') {
        return selectedAccount;
      }

      return paymentMethod === 'NON_TUNAI'
        ? findPostableAccount(['bank'], ['1020'])
        : findPostableAccount(['cash'], ['1010']);
    };
    const salaryExpenseAccount = findPostableAccount(['salary-expense', 'template-salary-expense'], ['6110', '6010'])
      ?? findPostableAccount(['other-expense', 'template-other-expense'], ['6900']);
    const cashAdvanceAccount = findPostableAccount(['employee-cash-advance-receivable'], ['1130']);

    if (!salaryExpenseAccount || !cashAdvanceAccount) return;

    const existingSourceKeys = new Set(
      (await journalEntries
        .where('source_type')
        .anyOf(['PAYROLL_RUN', 'EMPLOYEE_CASH_ADVANCE'])
        .toArray())
        .filter((entry) => entry.status === 'POSTED')
        .map((entry) => `${entry.source_type}:${entry.source_id}:${entry.source_event}`),
    );
    const sequenceByDate = new Map<string, number>();
    const createJournalEntryNumber = async (entryDate: string) => {
      const dateKey = entryDate.slice(0, 10).replace(/-/g, '');
      const prefix = `JRN-${dateKey}-`;
      let sequence = sequenceByDate.get(dateKey);
      if (sequence === undefined) {
        sequence = await journalEntries.where('entry_number').startsWith(prefix).count();
      }
      sequence += 1;
      sequenceByDate.set(dateKey, sequence);
      return `${prefix}${String(sequence).padStart(4, '0')}`;
    };
    const entriesToAdd: JournalEntry[] = [];
    const linesToAdd: JournalEntryLine[] = [];
    const addJournalEntry = async ({
      sourceType,
      sourceId,
      sourceNumber,
      sourceEvent,
      entryDate,
      description,
      lines,
    }: {
      sourceType: JournalEntry['source_type'];
      sourceId: string;
      sourceNumber?: string;
      sourceEvent: string;
      entryDate: string;
      description: string;
      lines: Array<{ account: ChartOfAccount; debit?: number; credit?: number; description?: string }>;
    }) => {
      const sourceKey = `${sourceType}:${sourceId}:${sourceEvent}`;
      if (existingSourceKeys.has(sourceKey)) return;

      const normalizedLines = lines
        .map((line) => ({
          ...line,
          debit: amountOrZero(line.debit),
          credit: amountOrZero(line.credit),
        }))
        .filter((line) => line.debit > 0 || line.credit > 0);
      const totalDebit = roundCurrency(normalizedLines.reduce((sum, line) => sum + line.debit, 0));
      const totalCredit = roundCurrency(normalizedLines.reduce((sum, line) => sum + line.credit, 0));
      if (normalizedLines.length < 2 || Math.abs(totalDebit - totalCredit) > 0.01) return;

      const entryId = crypto.randomUUID();
      entriesToAdd.push({
        id: entryId,
        entry_number: await createJournalEntryNumber(entryDate),
        entry_date: entryDate,
        status: 'POSTED',
        source_type: sourceType,
        source_id: sourceId,
        source_number: sourceNumber,
        source_event: sourceEvent,
        description,
        total_debit: totalDebit,
        total_credit: totalCredit,
        posted_at: now,
        version: 1,
        created_at: now,
        updated_at: now,
        sync_status: 'pending',
      });
      normalizedLines.forEach((line) => {
        linesToAdd.push({
          id: crypto.randomUUID(),
          journal_entry_id: entryId,
          account_id: line.account.id,
          account_code: line.account.code,
          account_name: line.account.name,
          account_type: line.account.type,
          debit: line.debit,
          credit: line.credit,
          description: line.description,
          created_at: now,
        });
      });
      existingSourceKeys.add(sourceKey);
    };

    const cashAdvances = await tx.table<EmployeeCashAdvance, string>('employeeCashAdvances').toArray();
    for (const advance of cashAdvances) {
      if (advance.status === 'VOIDED' || isBeforeCutoff(advance.disbursed_at)) continue;

      const amount = amountOrZero(advance.amount);
      const cashAccount = findCashAccount(advance.cash_account_id, advance.payment_method);
      if (amount <= 0 || !cashAccount) continue;

      await addJournalEntry({
        sourceType: 'EMPLOYEE_CASH_ADVANCE',
        sourceId: advance.id,
        sourceNumber: advance.advance_number,
        sourceEvent: 'EMPLOYEE_CASH_ADVANCE_DISBURSED',
        entryDate: advance.disbursed_at,
        description: `Pencairan kasbon ${advance.advance_number} ${advance.employee_name}`,
        lines: [
          { account: cashAdvanceAccount, debit: amount, description: 'Piutang kasbon karyawan bertambah' },
          { account: cashAccount, credit: amount, description: 'Kas/bank berkurang karena pencairan kasbon' },
        ],
      });
    }

    const payrollRuns = await tx.table<PayrollRun, string>('payrollRuns')
      .where('status')
      .equals('PAID')
      .toArray();
    for (const run of payrollRuns) {
      if (!run.paid_at || isBeforeCutoff(run.paid_at)) continue;

      const cashAmount = amountOrZero(run.net_amount);
      const cashAdvanceDeductionAmount = amountOrZero(run.cash_advance_deduction_amount);
      const expenseAmount = roundCurrency(cashAmount + cashAdvanceDeductionAmount);
      const cashAccount = cashAmount > 0 ? findCashAccount(run.cash_account_id, run.payment_method) : undefined;
      if (expenseAmount <= 0 || (cashAmount > 0 && !cashAccount)) continue;

      await addJournalEntry({
        sourceType: 'PAYROLL_RUN',
        sourceId: run.id,
        sourceNumber: run.payroll_number,
        sourceEvent: 'PAYROLL_RUN_PAID',
        entryDate: run.paid_at,
        description: `Pembayaran gaji ${run.payroll_number} periode ${run.period_start} s/d ${run.period_end}`,
        lines: [
          { account: salaryExpenseAccount, debit: expenseAmount, description: 'Beban gaji karyawan' },
          ...(cashAccount ? [{
            account: cashAccount,
            credit: cashAmount,
            description: 'Kas/bank berkurang karena pembayaran gaji',
          }] : []),
          ...(cashAdvanceDeductionAmount > 0 ? [{
            account: cashAdvanceAccount,
            credit: cashAdvanceDeductionAmount,
            description: 'Piutang kasbon karyawan dilunasi dari payroll',
          }] : []),
        ],
      });
    }

    if (entriesToAdd.length > 0) {
      await journalEntries.bulkAdd(entriesToAdd);
      await journalEntryLines.bulkAdd(linesToAdd);
    }
  });

  this.version(69).stores({
    employees: 'id, name, email, phone, user_id, login_role_id, field_cash_account_id, is_active, sync_status, updated_at, created_at',
    employeeAreas: 'id, employee_id, area_id, sync_status, updated_at, created_at',
    employeeCollectionSchedules: 'id, employee_id, area_id, weekday, [employee_id+area_id], [employee_id+area_id+weekday], is_active, sync_status, effective_from, effective_until, updated_at, created_at',
  }).upgrade(async (tx) => {
    const markPendingEmployeeRecords = async <T extends { sync_status?: string; sync_error?: string }>(
      tableName: string,
    ) => {
      const table = tx.table<T, string>(tableName);
      const records = await table.toArray();
      const recordsWithoutSyncStatus = records
        .filter((record) => !record.sync_status)
        .map((record) => ({
          ...record,
          sync_status: 'pending' as const,
          sync_error: undefined,
        }));

      if (recordsWithoutSyncStatus.length > 0) {
        await table.bulkPut(recordsWithoutSyncStatus);
      }
    };

    await markPendingEmployeeRecords<Employee>('employees');
    await markPendingEmployeeRecords<EmployeeArea>('employeeAreas');
    await markPendingEmployeeRecords<EmployeeCollectionSchedule>('employeeCollectionSchedules');
  });

  this.version(70).stores({
    chartOfAccounts: 'id, code, name, type, parent_id, is_postable, is_system, is_active, sync_status, updated_at, created_at',
  }).upgrade(async (tx) => {
    // Chart of accounts (including kas petugas/field cash accounts) had no cross-device
    // sync before. Mark every existing account pending so the next Sync DB run uploads
    // any account that until now only lived in this device's Dexie.
    const table = tx.table<ChartOfAccount, string>('chartOfAccounts');
    const accounts = await table.toArray();
    const accountsToMark = accounts
      .filter((account) => !account.sync_status)
      .map((account) => ({
        ...account,
        sync_status: 'pending' as const,
        sync_error: undefined,
      }));

    if (accountsToMark.length > 0) {
      await table.bulkPut(accountsToMark);
    }
  });

  this.version(71).stores({
    financeAccountMappings: 'id, key, category, account_id, is_system, sync_status, updated_at, created_at',
    accountingProfileSetting: 'id, accounting_profile, industry_extension, sync_status, updated_at',
    enabledModules: 'id, code, is_enabled, source, sync_status, updated_at',
    generalLedgerSetting: 'id, is_ready, cutoff_date, inventory_policy, opening_balance_journal_id, activated_at, sync_status, updated_at',
  }).upgrade(async (tx) => {
    // The foundational accounting seed (mappings, profile, modules, GL setting) was
    // local-only. Mark every existing row pending so the next Sync DB run uploads it.
    const markPendingSetting = async (tableName: string) => {
      const table = tx.table<{ id: string; sync_status?: string; sync_error?: string }, string>(tableName);
      const records = await table.toArray();
      const recordsToMark = records
        .filter((record) => !record.sync_status)
        .map((record) => ({
          ...record,
          sync_status: 'pending' as const,
          sync_error: undefined,
        }));

      if (recordsToMark.length > 0) {
        await table.bulkPut(recordsToMark);
      }
    };

    await markPendingSetting('financeAccountMappings');
    await markPendingSetting('accountingProfileSetting');
    await markPendingSetting('enabledModules');
    await markPendingSetting('generalLedgerSetting');
  });

  this.version(72).stores({
    payrollRuns: 'id, payroll_number, period_start, period_end, status, paid_at, finance_transaction_id, sync_status, created_at, updated_at',
    employeeCashAdvances: 'id, advance_number, employee_id, status, disbursed_at, finance_transaction_id, sync_status, created_at, updated_at',
  }).upgrade(async (tx) => {
    const markPendingPayrollRecord = async (tableName: 'payrollRuns' | 'employeeCashAdvances') => {
      const table = tx.table<{ id: string; sync_status?: string; sync_error?: string }, string>(tableName);
      const records = await table.toArray();
      const recordsToMark = records
        .filter((record) => !record.sync_status)
        .map((record) => ({
          ...record,
          sync_status: 'pending' as const,
          sync_error: undefined,
        }));

      if (recordsToMark.length > 0) {
        await table.bulkPut(recordsToMark);
      }
    };

    await markPendingPayrollRecord('payrollRuns');
    await markPendingPayrollRecord('employeeCashAdvances');
  });

  this.version(73).stores({
    cashierSessions: 'id, session_number, status, cashier_user_id, opened_at, closed_at, balance_status, sync_status, created_at, updated_at',
  }).upgrade(async (tx) => {
    const table = tx.table<CashierSession, string>('cashierSessions');
    const sessions = await table.toArray();
    const sessionsToMark = sessions
      .filter((session) => !session.sync_status)
      .map((session) => ({
        ...session,
        sync_status: 'pending' as const,
        sync_error: undefined,
      }));

    if (sessionsToMark.length > 0) {
      await table.bulkPut(sessionsToMark);
    }
  });

  this.version(74).stores({}).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const rolePermissionTable = tx.table<RolePermission, string>('rolePermissions');
    const existingPermissions = await rolePermissionTable.toArray();
    const existingIds = new Set(existingPermissions.map((permission) => permission.id));
    const disbursePermissionCode: RolePermission['permission_code'] = 'COOPERATIVE_LOAN_DISBURSE';

    const migratedPermissions = existingPermissions
      .filter((permission) => permission.permission_code === 'FINANCE_ACCESS')
      .flatMap((financePermission) => {
        const id = `${financePermission.role_id}:${disbursePermissionCode}`;
        if (existingIds.has(id)) return [];
        existingIds.add(id);

        return [{
          id,
          role_id: financePermission.role_id,
          permission_code: disbursePermissionCode,
          created_at: now,
          updated_at: now,
          sync_status: 'pending' as const,
        }];
      });

    const systemPermissions = buildSystemRolePermissions(now)
      .filter((permission) => !existingIds.has(permission.id));

    if (migratedPermissions.length > 0 || systemPermissions.length > 0) {
      await rolePermissionTable.bulkPut([
        ...migratedPermissions,
        ...systemPermissions,
      ]);
    }
  });

  this.version(75).stores({
    cooperativeLoanPayments: 'id, payment_number, payment_type, payment_group_id, payment_group_number, loan_id, loan_number, installment_id, member_id, member_number, collector_id, received_by, payment_date, posted_at, status, reversal_of_payment_id, finance_transaction_id, journal_entry_id, idempotency_key, sync_status, updated_at, created_at',
  });

  this.version(76).stores({}).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const rolePermissionTable = tx.table<RolePermission, string>('rolePermissions');
    const existingPermissions = await rolePermissionTable.toArray();
    const existingIds = new Set(existingPermissions.map((permission) => permission.id));
    const resortDevelopmentPermission: RolePermission['permission_code'] = 'COOPERATIVE_RESORT_DEVELOPMENT_REPORT_VIEW';

    const migratedPermissions = existingPermissions
      .filter((permission) => (
        permission.permission_code === 'COOPERATIVE_REPORT_VIEW' ||
        permission.permission_code === 'COOPERATIVE_DAILY_TARGET_REPORT_VIEW'
      ))
      .flatMap((legacyPermission) => {
        const id = `${legacyPermission.role_id}:${resortDevelopmentPermission}`;
        if (existingIds.has(id)) return [];
        existingIds.add(id);

        return [{
          id,
          role_id: legacyPermission.role_id,
          permission_code: resortDevelopmentPermission,
          created_at: now,
          updated_at: now,
          sync_status: 'pending' as const,
        }];
      });

    const systemPermissions = buildSystemRolePermissions(now)
      .filter((permission) => !existingIds.has(permission.id));

    if (migratedPermissions.length > 0 || systemPermissions.length > 0) {
      await rolePermissionTable.bulkPut([
        ...migratedPermissions,
        ...systemPermissions,
      ]);
    }
  });

  this.version(77).stores({
    cashBankReconciliations: 'id, reconciliation_number, cash_account_id, statement_date, status, sync_status, updated_at, created_at',
    financeTransactions: 'id, type, category, account_id, cash_account_id, cash_bank_reconciliation_id, field_cash_session_id, field_employee_id, transfer_group_id, sync_status, updated_at, created_at, reference_id',
  }).upgrade(async (tx) => {
    const reconciliations = await tx.table<CashBankReconciliation, string>('cashBankReconciliations').toArray();
    const reconciliationsWithoutSyncStatus = reconciliations
      .filter((reconciliation) => !reconciliation.sync_status || !reconciliation.version || !reconciliation.updated_at)
      .map((reconciliation) => ({
        ...reconciliation,
        version: reconciliation.version ?? 1,
        updated_at: reconciliation.updated_at ?? reconciliation.created_at,
        sync_status: reconciliation.sync_status ?? 'pending' as const,
        sync_error: undefined,
      }));

    if (reconciliationsWithoutSyncStatus.length > 0) {
      await tx.table<CashBankReconciliation, string>('cashBankReconciliations').bulkPut(
        reconciliationsWithoutSyncStatus,
      );
    }
  });

  this.version(78).stores({
    accountingPeriods: 'id, name, period_type, start_date, end_date, status, closing_journal_entry_id, sync_status, updated_at, created_at',
    closingRuns: 'id, period_id, status, closing_journal_entry_id, posted_at, sync_status, updated_at, created_at',
  });

  this.version(79).stores({
    cashBankReconciliations: 'id, reconciliation_number, cash_account_id, statement_date, status, sync_status, updated_at, created_at',
    financeTransactions: 'id, type, category, account_id, cash_account_id, cash_bank_reconciliation_id, field_cash_session_id, field_employee_id, transfer_group_id, sync_status, updated_at, created_at, reference_id',
    accountingPeriods: 'id, name, period_type, start_date, end_date, status, closing_journal_entry_id, sync_status, updated_at, created_at',
    closingRuns: 'id, period_id, status, closing_journal_entry_id, posted_at, sync_status, updated_at, created_at',
  });

  this.version(80).stores({
    taxes: 'id, name, code, rate_type, calculation_mode, tax_flow, sales_tax_account_id, purchase_tax_account_id, is_default, is_active, sync_status, effective_from, effective_to, created_at',
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const chartOfAccounts = tx.table<ChartOfAccount, string>('chartOfAccounts');
    const accounts = await chartOfAccounts.toArray();
    const accountIds = new Set(accounts.map((account) => account.id));
    const accountCodes = new Set(accounts.map((account) => account.code));
    const taxAccountIds = [
      'input-tax',
      'output-tax',
      'luxury-sales-tax-payable',
      'pph23-payable',
      'final-income-tax-payable',
    ];
    const accountsToAdd = DEFAULT_CHART_OF_ACCOUNTS
      .filter((account) => taxAccountIds.includes(account.id))
      .filter((account) => !accountIds.has(account.id) && !accountCodes.has(account.code))
      .map((account) => ({
        ...account,
        created_at: now,
        updated_at: now,
        sync_status: 'pending' as const,
      }));

    if (accountsToAdd.length > 0) {
      await chartOfAccounts.bulkPut(accountsToAdd);
    }

    const outputTax = await chartOfAccounts.get('output-tax');
    if (outputTax?.name === 'Pajak Keluaran') {
      await chartOfAccounts.put({
        ...outputTax,
        name: 'PPN Keluaran',
        updated_at: now,
        sync_status: 'pending' as const,
        sync_error: undefined,
      });
    }

    const taxes = await tx.table<Tax, string>('taxes').toArray();
    const migratedTaxes = taxes
      .filter((tax) => !tax.tax_flow)
      .map((tax) => ({
        ...tax,
        tax_flow: 'ADDITIVE' as const,
        sync_status: tax.sync_status ?? 'pending' as const,
        sync_error: undefined,
      }));

    if (migratedTaxes.length > 0) {
      await tx.table<Tax, string>('taxes').bulkPut(migratedTaxes);
    }
  });

  this.version(81).stores({}).upgrade(async (tx) => {
    const loans = await tx.table<CooperativeLoan, string>('cooperativeLoans').toArray();
    const migratedLoans = loans
      .filter((loan) => loan.disbursed_at && !loan.scheduled_disbursement_date)
      .map((loan) => ({
        ...loan,
        scheduled_disbursement_date: loan.disbursed_at,
        sync_status: 'pending' as const,
        sync_error: undefined,
      }));

    if (migratedLoans.length > 0) {
      await tx.table<CooperativeLoan, string>('cooperativeLoans').bulkPut(migratedLoans);
    }
  });

  this.version(82).stores({
    salesInvoicePayments: 'id, sales_document_id, paid_at, status, finance_transaction_id, created_at',
    purchaseInvoicePayments: 'id, purchase_document_id, paid_at, status, finance_transaction_id, created_at',
  });
}
