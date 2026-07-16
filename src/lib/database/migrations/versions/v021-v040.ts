import type * as DatabaseTypes from '@/types';
import type { KasirkuDB } from '../../KasirkuDB';
import * as CurrencyConstants from '@/constants/currencies';
import * as MigrationSeeds from '../../seeds';

export function registerMigrationsV021ToV040(db: KasirkuDB) {
  db.version(21).stores({
    generalLedgerSetting: 'id, is_ready, cutoff_date, inventory_policy, opening_balance_journal_id, activated_at, updated_at'
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const seed = MigrationSeeds.buildAccountingSeed(now);
    const generalLedgerSetting = tx.table<DatabaseTypes.GeneralLedgerSetting, string>('generalLedgerSetting');

    if (!await generalLedgerSetting.get('default')) {
      await generalLedgerSetting.put(seed.generalLedgerSetting);
    }
  });

  db.version(22).stores({
    salesInvoicePayments: 'id, sales_document_id, paid_at, status, finance_transaction_id, created_at'
  }).upgrade(async (tx) => {
    const documents = await tx.table<DatabaseTypes.SalesDocument, string>('salesDocuments')
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
      await tx.table<DatabaseTypes.SalesInvoicePayment, string>('salesInvoicePayments').bulkAdd(payments);
    }
  });

  db.version(23).stores({
    purchaseDocuments: 'id, document_number, type, status, contact_id, supplier_name, document_date, due_date, payment_status, source_document_id, project_id, department_id, tax_id, created_at',
    purchaseDocumentItems: 'id, document_id, product_id'
  });

  db.version(24).stores({
    warehouses: 'id, name, code, is_active, created_at'
  });

  db.version(25).stores({}).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const seed = MigrationSeeds.buildAccountingSeed(now);
    const chartOfAccounts = tx.table<DatabaseTypes.ChartOfAccount, string>('chartOfAccounts');
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

  db.version(26).stores({
    purchaseInvoicePayments: 'id, purchase_document_id, paid_at, status, finance_transaction_id, created_at'
  }).upgrade(async (tx) => {
    const documents = await tx.table<DatabaseTypes.PurchaseDocument, string>('purchaseDocuments')
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
      await tx.table<DatabaseTypes.PurchaseInvoicePayment, string>('purchaseInvoicePayments').bulkAdd(payments);
    }
  });

  db.version(27).stores({
    departments: 'id, name, code, is_active, sync_status, created_at'
  }).upgrade(async (tx) => {
    const departments = await tx.table<DatabaseTypes.Department, string>('departments').toArray();
    const departmentsWithoutSyncStatus = departments
      .filter((department) => !department.sync_status)
      .map((department) => ({
        ...department,
        sync_status: 'pending' as const,
      }));

    if (departmentsWithoutSyncStatus.length > 0) {
      await tx.table<DatabaseTypes.Department, string>('departments').bulkPut(departmentsWithoutSyncStatus);
    }
  });

  db.version(28).stores({
    syncQueue: 'id, entity, entity_id, operation, status, created_at, updated_at'
  });

  db.version(29).stores({
    projects: 'id, name, code, status, contact_id, department_id, is_active, sync_status, start_date, end_date, created_at'
  }).upgrade(async (tx) => {
    const projects = await tx.table<DatabaseTypes.Project, string>('projects').toArray();
    const projectsWithoutSyncStatus = projects
      .filter((project) => !project.sync_status)
      .map((project) => ({
        ...project,
        sync_status: 'pending' as const,
      }));

    if (projectsWithoutSyncStatus.length > 0) {
      await tx.table<DatabaseTypes.Project, string>('projects').bulkPut(projectsWithoutSyncStatus);
    }
  });

  db.version(30).stores({
    taxes: 'id, name, code, rate_type, calculation_mode, is_default, is_active, sync_status, effective_from, effective_to, created_at'
  }).upgrade(async (tx) => {
    const taxes = await tx.table<DatabaseTypes.Tax, string>('taxes').toArray();
    const taxesWithoutSyncStatus = taxes
      .filter((tax) => !tax.sync_status)
      .map((tax) => ({
        ...tax,
        sync_status: 'pending' as const,
      }));

    if (taxesWithoutSyncStatus.length > 0) {
      await tx.table<DatabaseTypes.Tax, string>('taxes').bulkPut(taxesWithoutSyncStatus);
    }
  });

  db.version(31).stores({
    contacts: 'id, name, contact_type, phone, email, is_active, sync_status, created_at',
    warehouses: 'id, name, code, is_active, sync_status, created_at',
    products: 'id, name, sku, category, sync_status, created_at'
  }).upgrade(async (tx) => {
    const contacts = await tx.table<DatabaseTypes.Contact, string>('contacts').toArray();
    const contactsWithoutSyncStatus = contacts
      .filter((contact) => !contact.sync_status)
      .map((contact) => ({
        ...contact,
        sync_status: 'pending' as const,
      }));

    const warehouses = await tx.table<DatabaseTypes.Warehouse, string>('warehouses').toArray();
    const warehousesWithoutSyncStatus = warehouses
      .filter((warehouse) => !warehouse.sync_status)
      .map((warehouse) => ({
        ...warehouse,
        sync_status: 'pending' as const,
      }));

    const products = await tx.table<DatabaseTypes.Product, string>('products').toArray();
    const productsWithoutSyncStatus = products
      .filter((product) => !product.sync_status)
      .map((product) => ({
        ...product,
        sync_status: 'pending' as const,
      }));

    if (contactsWithoutSyncStatus.length > 0) {
      await tx.table<DatabaseTypes.Contact, string>('contacts').bulkPut(contactsWithoutSyncStatus);
    }
    if (warehousesWithoutSyncStatus.length > 0) {
      await tx.table<DatabaseTypes.Warehouse, string>('warehouses').bulkPut(warehousesWithoutSyncStatus);
    }
    if (productsWithoutSyncStatus.length > 0) {
      await tx.table<DatabaseTypes.Product, string>('products').bulkPut(productsWithoutSyncStatus);
    }
  });

  db.version(32).stores({
    authUsers: 'id, role, is_active, sync_status, created_at'
  }).upgrade(async (tx) => {
    const authUsers = await tx.table<DatabaseTypes.AuthUser, string>('authUsers').toArray();
    const authUsersWithoutSyncStatus = authUsers
      .filter((user) => !user.sync_status)
      .map((user) => ({
        ...user,
        sync_status: 'pending' as const,
      }));

    if (authUsersWithoutSyncStatus.length > 0) {
      await tx.table<DatabaseTypes.AuthUser, string>('authUsers').bulkPut(authUsersWithoutSyncStatus);
    }
  });

  db.version(33).stores({
    salesDocuments: 'id, document_number, type, status, contact_id, customer_name, document_date, due_date, payment_status, source_document_id, project_id, department_id, tax_id, sync_status, updated_at, created_at'
  }).upgrade(async (tx) => {
    const salesDocuments = await tx.table<DatabaseTypes.SalesDocument, string>('salesDocuments').toArray();
    const salesDocumentsWithoutSyncStatus = salesDocuments
      .filter((document) => !document.sync_status || !document.version)
      .map((document) => ({
        ...document,
        version: document.version ?? 1,
        sync_status: document.sync_status ?? 'pending' as const,
      }));

    if (salesDocumentsWithoutSyncStatus.length > 0) {
      await tx.table<DatabaseTypes.SalesDocument, string>('salesDocuments').bulkPut(salesDocumentsWithoutSyncStatus);
    }
  });

  db.version(34).stores({
    purchaseDocuments: 'id, document_number, type, status, contact_id, supplier_name, document_date, due_date, payment_status, source_document_id, project_id, department_id, tax_id, sync_status, updated_at, created_at'
  }).upgrade(async (tx) => {
    const purchaseDocuments = await tx.table<DatabaseTypes.PurchaseDocument, string>('purchaseDocuments').toArray();
    const purchaseDocumentsWithoutSyncStatus = purchaseDocuments
      .filter((document) => !document.sync_status || !document.version)
      .map((document) => ({
        ...document,
        version: document.version ?? 1,
        sync_status: document.sync_status ?? 'pending' as const,
      }));

    if (purchaseDocumentsWithoutSyncStatus.length > 0) {
      await tx.table<DatabaseTypes.PurchaseDocument, string>('purchaseDocuments').bulkPut(purchaseDocumentsWithoutSyncStatus);
    }
  });

  db.version(35).stores({
    financeTransactions: 'id, type, category, account_id, cash_account_id, transfer_group_id, sync_status, updated_at, created_at, reference_id'
  }).upgrade(async (tx) => {
    const financeTransactions = await tx.table<DatabaseTypes.FinanceTransaction, string>('financeTransactions').toArray();
    const financeTransactionsWithoutSyncStatus = financeTransactions
      .filter((transaction) => !transaction.sync_status || !transaction.version || !transaction.updated_at)
      .map((transaction) => ({
        ...transaction,
        version: transaction.version ?? 1,
        updated_at: transaction.updated_at ?? transaction.created_at,
        sync_status: transaction.sync_status ?? 'pending' as const,
      }));

    if (financeTransactionsWithoutSyncStatus.length > 0) {
      await tx.table<DatabaseTypes.FinanceTransaction, string>('financeTransactions').bulkPut(financeTransactionsWithoutSyncStatus);
    }
  });

  db.version(36).stores({
    journalEntries: 'id, entry_number, entry_date, status, source_type, source_id, source_event, reversed_entry_id, sync_status, updated_at, created_at',
    journalEntryLines: 'id, journal_entry_id, account_id, account_code, account_type, created_at'
  }).upgrade(async (tx) => {
    const journalEntries = await tx.table<DatabaseTypes.JournalEntry, string>('journalEntries').toArray();
    const journalEntriesWithoutSyncStatus = journalEntries
      .filter((entry) => !entry.sync_status || !entry.version || !entry.updated_at)
      .map((entry) => ({
        ...entry,
        version: entry.version ?? 1,
        updated_at: entry.updated_at ?? entry.created_at,
        sync_status: entry.sync_status ?? 'pending' as const,
      }));

    if (journalEntriesWithoutSyncStatus.length > 0) {
      await tx.table<DatabaseTypes.JournalEntry, string>('journalEntries').bulkPut(journalEntriesWithoutSyncStatus);
    }
  });

  db.version(37).stores({
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
    const currencyTable = tx.table<DatabaseTypes.Currency, string>('currencies');
    const currencyRateTable = tx.table<DatabaseTypes.CurrencyRate, string>('currencyRates');

    if (!await currencyTable.get(CurrencyConstants.BASE_CURRENCY_CODE)) {
      await currencyTable.put(CurrencyConstants.buildBaseCurrency(now));
    }

    if (await currencyRateTable.where('currency_code').equals(CurrencyConstants.BASE_CURRENCY_CODE).count() === 0) {
      await currencyRateTable.put(CurrencyConstants.buildBaseCurrencyRate(now));
    }

    // ===== Sales documents =====
    const salesDocuments = await tx.table<DatabaseTypes.SalesDocument, string>('salesDocuments').toArray();
    const salesDocumentsWithoutCurrency = salesDocuments
      .filter((document) => !document.currency_code || !document.exchange_rate)
      .map((document) => ({
        ...document,
        currency_code: document.currency_code ?? CurrencyConstants.BASE_CURRENCY_CODE,
        currency_name: document.currency_name ?? 'Rupiah Indonesia',
        currency_symbol: document.currency_symbol ?? 'Rp',
        base_currency_code: document.base_currency_code ?? CurrencyConstants.BASE_CURRENCY_CODE,
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
      await tx.table<DatabaseTypes.SalesDocument, string>('salesDocuments').bulkPut(salesDocumentsWithoutCurrency);
    }

    // ===== Sales document items =====
    const salesItems = await tx.table<DatabaseTypes.SalesDocumentItem, string>('salesDocumentItems').toArray();
    const salesItemsWithoutCurrency = salesItems
      .filter((item) => !item.currency_code || !item.exchange_rate)
      .map((item) => ({
        ...item,
        currency_code: item.currency_code ?? CurrencyConstants.BASE_CURRENCY_CODE,
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
      await tx.table<DatabaseTypes.SalesDocumentItem, string>('salesDocumentItems').bulkPut(salesItemsWithoutCurrency);
    }

    // ===== Purchase documents =====
    const purchaseDocuments = await tx.table<DatabaseTypes.PurchaseDocument, string>('purchaseDocuments').toArray();
    const purchaseDocumentsWithoutCurrency = purchaseDocuments
      .filter((document) => !document.currency_code || !document.exchange_rate)
      .map((document) => ({
        ...document,
        currency_code: document.currency_code ?? CurrencyConstants.BASE_CURRENCY_CODE,
        currency_name: document.currency_name ?? 'Rupiah Indonesia',
        currency_symbol: document.currency_symbol ?? 'Rp',
        base_currency_code: document.base_currency_code ?? CurrencyConstants.BASE_CURRENCY_CODE,
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
      await tx.table<DatabaseTypes.PurchaseDocument, string>('purchaseDocuments').bulkPut(purchaseDocumentsWithoutCurrency);
    }

    // ===== Purchase items =====
    const purchaseItems = await tx.table<DatabaseTypes.PurchaseDocumentItem, string>('purchaseDocumentItems').toArray();
    const purchaseItemsWithoutCurrency = purchaseItems
      .filter((item) => !item.currency_code || !item.exchange_rate)
      .map((item) => ({
        ...item,
        currency_code: item.currency_code ?? CurrencyConstants.BASE_CURRENCY_CODE,
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
      await tx.table<DatabaseTypes.PurchaseDocumentItem, string>('purchaseDocumentItems').bulkPut(purchaseItemsWithoutCurrency);
    }

    // ===== Inventory opening lots =====
    const products = await tx.table<DatabaseTypes.Product, string>('products').toArray();
    const openingLots: DatabaseTypes.InventoryLot[] = products
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
      await tx.table<DatabaseTypes.InventoryLot, string>('inventoryLots').bulkAdd(openingLots);
    }
  });

  db.version(38).stores({
    cooperativeMembers: 'id, member_number, name, status, sync_status, updated_at, created_at',
    cooperativeSavingTransactions: 'id, member_id, member_number, saving_type, transaction_type, transaction_date, status, reversal_of_transaction_id, finance_transaction_id, journal_entry_id, sync_status, updated_at, created_at',
    cooperativeMemberSavingBalances: 'id, member_id, member_number, saving_type, sync_status, updated_at',
    cooperativeLoans: 'id, loan_number, member_id, member_number, status, application_date, disbursed_at, finance_transaction_id, journal_entry_id, sync_status, updated_at, created_at',
    cooperativeLoanInstallments: 'id, loan_id, loan_number, member_id, member_number, due_date, status, paid_at, sync_status, updated_at, created_at',
    cooperativeLoanPayments: 'id, payment_number, payment_type, loan_id, loan_number, installment_id, member_id, member_number, payment_date, status, reversal_of_payment_id, finance_transaction_id, journal_entry_id, sync_status, updated_at, created_at',
    cooperativeSettings: 'id, updated_at'
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const cooperativeSettings = tx.table<DatabaseTypes.CooperativeSettings, string>('cooperativeSettings');

    if (!await cooperativeSettings.get('default')) {
      await cooperativeSettings.put({
        id: 'default',
        created_at: now,
        updated_at: now,
      });
    }
  });

  db.version(39).stores({
    companyProfileSetting: 'id, updated_at'
  }).upgrade(async (tx) => {
    const now = new Date().toISOString();
    const companyProfileSetting = tx.table<DatabaseTypes.CompanyProfileSetting, string>('companyProfileSetting');

    if (!await companyProfileSetting.get('default')) {
      await companyProfileSetting.put(MigrationSeeds.buildDefaultCompanyProfileSetting(now));
    }
  });

  db.version(40).stores({}).upgrade(async (tx) => {
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

    await markPendingCooperativeRecords<DatabaseTypes.CooperativeMember>('cooperativeMembers');
    await markPendingCooperativeRecords<DatabaseTypes.CooperativeSavingTransaction>('cooperativeSavingTransactions');
    await markPendingCooperativeRecords<DatabaseTypes.CooperativeMemberSavingBalance>('cooperativeMemberSavingBalances');
    await markPendingCooperativeRecords<DatabaseTypes.CooperativeLoan>('cooperativeLoans');
    await markPendingCooperativeRecords<DatabaseTypes.CooperativeLoanInstallment>('cooperativeLoanInstallments');
    await markPendingCooperativeRecords<DatabaseTypes.CooperativeLoanPayment>('cooperativeLoanPayments');
  });
}
