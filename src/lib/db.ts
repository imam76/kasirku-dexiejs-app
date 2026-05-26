import Dexie, { Table } from 'dexie';
import { Product, Transaction, TransactionItem, StockPurchase, ProfitLog, ProfitBalance, ShoppingNote, FinanceTransaction, FinanceBalance, UnitConversion, UnitDefinition, AuthUser, AuthSession, ActivityLog, Promo, Contact, Department, Project, Tax, SalesDocument, SalesDocumentItem, SalesInvoicePayment, SalesReturn, SalesReturnItem, ChartOfAccount, FinanceAccountMapping, AccountingProfileSetting, EnabledModule, GeneralLedgerSetting, JournalEntry, JournalEntryLine } from '@/types';
import { createUnitDefinition, DEFAULT_CONVERSIONS, DEFAULT_UNITS } from '@/constants/units';
import { DEFAULT_ACCOUNTING_PROFILE_SETTING, DEFAULT_ENABLED_MODULES, DEFAULT_GENERAL_LEDGER_SETTING } from '@/constants/accounting';
import { DEFAULT_CHART_OF_ACCOUNTS, DEFAULT_FINANCE_ACCOUNT_MAPPINGS } from '@/constants/chartOfAccounts';

const buildAccountingSeed = (now: string) => {
  const accounts: ChartOfAccount[] = DEFAULT_CHART_OF_ACCOUNTS.map((account) => ({
    ...account,
    created_at: now,
    updated_at: now,
  }));
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const mappings: FinanceAccountMapping[] = DEFAULT_FINANCE_ACCOUNT_MAPPINGS
    .map((mapping) => {
      const account = accountById.get(mapping.account_id);
      if (!account) return undefined;

      return {
        ...mapping,
        id: mapping.key,
        account_code: account.code,
        account_name: account.name,
        account_type: account.type,
        created_at: now,
        updated_at: now,
      };
    })
    .filter((mapping): mapping is FinanceAccountMapping => Boolean(mapping));

  return {
    accounts,
    mappings,
    profileSetting: {
      ...DEFAULT_ACCOUNTING_PROFILE_SETTING,
      created_at: now,
      updated_at: now,
    },
    generalLedgerSetting: {
      ...DEFAULT_GENERAL_LEDGER_SETTING,
      created_at: now,
      updated_at: now,
    },
    enabledModules: DEFAULT_ENABLED_MODULES.map((module) => ({
      ...module,
      created_at: now,
      updated_at: now,
    })),
  };
};

export class KasirkuDB extends Dexie {
  products!: Table<Product>;
  transactions!: Table<Transaction>;
  transactionItems!: Table<TransactionItem>;
  stockPurchases!: Table<StockPurchase>;
  profitLogs!: Table<ProfitLog>;
  profitBalance!: Table<ProfitBalance>;
  shoppingNotes!: Table<ShoppingNote>;
  financeTransactions!: Table<FinanceTransaction>;
  financeBalance!: Table<FinanceBalance>;
  unitConversions!: Table<UnitConversion>;
  units!: Table<UnitDefinition>;
  authUsers!: Table<AuthUser>;
  authSessions!: Table<AuthSession>;
  activityLogs!: Table<ActivityLog>;
  promos!: Table<Promo>;
  contacts!: Table<Contact>;
  departments!: Table<Department>;
  projects!: Table<Project>;
  taxes!: Table<Tax>;
  salesDocuments!: Table<SalesDocument>;
  salesDocumentItems!: Table<SalesDocumentItem>;
  salesInvoicePayments!: Table<SalesInvoicePayment>;
  salesReturns!: Table<SalesReturn>;
  salesReturnItems!: Table<SalesReturnItem>;
  chartOfAccounts!: Table<ChartOfAccount>;
  financeAccountMappings!: Table<FinanceAccountMapping>;
  accountingProfileSetting!: Table<AccountingProfileSetting>;
  enabledModules!: Table<EnabledModule>;
  generalLedgerSetting!: Table<GeneralLedgerSetting>;
  journalEntries!: Table<JournalEntry>;
  journalEntryLines!: Table<JournalEntryLine>;

  constructor() {
    super('KasirkuDB');
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

    this.on('populate', async () => {
      await this.units.bulkAdd(DEFAULT_UNITS);
      await this.unitConversions.bulkAdd(DEFAULT_CONVERSIONS);
      const now = new Date().toISOString();
      const seed = buildAccountingSeed(now);
      await this.chartOfAccounts.bulkPut(seed.accounts);
      await this.financeAccountMappings.bulkPut(seed.mappings);
      await this.accountingProfileSetting.put(seed.profileSetting);
      await this.enabledModules.bulkPut(seed.enabledModules);
      await this.generalLedgerSetting.put(seed.generalLedgerSetting);
    });
  }
}

export const db = new KasirkuDB();
