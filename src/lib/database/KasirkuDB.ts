import Dexie, { type Table } from 'dexie';
import type {
  Product,
  Transaction,
  TransactionItem,
  StockPurchase,
  StockOpname,
  StockOpnameItem,
  ProfitLog,
  ProfitBalance,
  ShoppingNote,
  FinanceTransaction,
  FinanceBalance,
  UnitConversion,
  UnitDefinition,
  AuthUser,
  AuthSession,
  ActivityLog,
  SyncQueueItem,
  Promo,
  Contact,
  Department,
  Project,
  Tax,
  Warehouse,
  Currency,
  CurrencyRate,
  Role,
  RolePermission,
  SalesDocument,
  SalesDocumentItem,
  SalesInvoicePayment,
  SalesReturn,
  SalesReturnItem,
  PurchaseDocument,
  PurchaseDocumentItem,
  PurchaseInvoicePayment,
  ChartOfAccount,
  FinanceAccountMapping,
  AccountingProfileSetting,
  EnabledModule,
  GeneralLedgerSetting,
  JournalEntry,
  JournalEntryLine,
  InventoryLot,
  InventoryLotConsumption,
  PurchaseCostReconciliation,
  PurchaseCostReconciliationItem,
  CooperativeMember,
  CooperativeSavingTransaction,
  CooperativeMemberSavingBalance,
  CooperativeLoan,
  CooperativeLoanInstallment,
  CooperativeLoanPayment,
  CooperativeSettings,
  CompanyProfileSetting,
  CooperativeArea,
  Employee,
  EmployeeArea,
  CashierSession,
  CooperativeFieldCashSession,
} from '@/types';
import { registerDatabaseMigrations } from './migrations';
import { registerDatabasePopulate } from './populate';

export class KasirkuDB extends Dexie {
  products!: Table<Product>;
  transactions!: Table<Transaction>;
  transactionItems!: Table<TransactionItem>;
  cashierSessions!: Table<CashierSession>;
  cooperativeFieldCashSessions!: Table<CooperativeFieldCashSession>;
  stockPurchases!: Table<StockPurchase>;
  stockOpnames!: Table<StockOpname>;
  stockOpnameItems!: Table<StockOpnameItem>;
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
  roles!: Table<Role>;
  rolePermissions!: Table<RolePermission>;
  syncQueue!: Table<SyncQueueItem>;
  promos!: Table<Promo>;
  contacts!: Table<Contact>;
  departments!: Table<Department>;
  projects!: Table<Project>;
  taxes!: Table<Tax>;
  warehouses!: Table<Warehouse>;
  currencies!: Table<Currency>;
  currencyRates!: Table<CurrencyRate>;
  salesDocuments!: Table<SalesDocument>;
  salesDocumentItems!: Table<SalesDocumentItem>;
  salesInvoicePayments!: Table<SalesInvoicePayment>;
  salesReturns!: Table<SalesReturn>;
  salesReturnItems!: Table<SalesReturnItem>;
  purchaseDocuments!: Table<PurchaseDocument>;
  purchaseDocumentItems!: Table<PurchaseDocumentItem>;
  purchaseInvoicePayments!: Table<PurchaseInvoicePayment>;
  chartOfAccounts!: Table<ChartOfAccount>;
  financeAccountMappings!: Table<FinanceAccountMapping>;
  accountingProfileSetting!: Table<AccountingProfileSetting>;
  enabledModules!: Table<EnabledModule>;
  generalLedgerSetting!: Table<GeneralLedgerSetting>;
  journalEntries!: Table<JournalEntry>;
  journalEntryLines!: Table<JournalEntryLine>;
  cooperativeMembers!: Table<CooperativeMember>;
  cooperativeSavingTransactions!: Table<CooperativeSavingTransaction>;
  cooperativeMemberSavingBalances!: Table<CooperativeMemberSavingBalance>;
  cooperativeLoans!: Table<CooperativeLoan>;
  cooperativeLoanInstallments!: Table<CooperativeLoanInstallment>;
  cooperativeLoanPayments!: Table<CooperativeLoanPayment>;
  cooperativeSettings!: Table<CooperativeSettings>;
  companyProfileSetting!: Table<CompanyProfileSetting>;
  inventoryLots!: Table<InventoryLot>;
  inventoryLotConsumptions!: Table<InventoryLotConsumption>;
  purchaseCostReconciliations!: Table<PurchaseCostReconciliation>;
  purchaseCostReconciliationItems!: Table<PurchaseCostReconciliationItem>;
  cooperativeAreas!: Table<CooperativeArea>;
  employees!: Table<Employee>;
  employeeAreas!: Table<EmployeeArea>;

  constructor() {
    super('KasirkuDB');
    registerDatabaseMigrations.call(this);
    registerDatabasePopulate.call(this);
  }
}
