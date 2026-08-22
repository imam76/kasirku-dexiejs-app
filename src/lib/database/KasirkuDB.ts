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
  DashboardPreference,
  SyncQueueItem,
  SyncCursor,
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
  SalesOverpaymentSettlement,
  SalesOverpaymentSettlementAllocation,
  SalesReturn,
  SalesReturnItem,
  PurchaseDocument,
  PurchaseDocumentItem,
  PurchaseInvoicePayment,
  ProductRecipe,
  ProductRecipeItem,
  ProductionOrder,
  ProductionOrderCost,
  ProductionOrderItem,
  ChartOfAccount,
  FinanceAccountMapping,
  AccountingProfileSetting,
  EnabledModule,
  GeneralLedgerSetting,
  OpeningBalanceBatch,
  OpeningBalanceLine,
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
  CooperativeLoanCollectionEvent,
  CooperativeMemberCode,
  CooperativeSettings,
  CompanyProfileSetting,
  CooperativeArea,
  Employee,
  EmployeeArea,
  EmployeeCollectionSchedule,
  CashierSession,
  CashBankReconciliation,
  AccountingPeriod,
  AccountingFiscalYear,
  AccountingInitialSetupSetting,
  ClosingRun,
  FiscalYearClosingRun,
  CooperativeFieldCashSession,
  MembershipPointTransaction,
  MembershipSetting,
  PayrollRun,
  PayrollRunItem,
  EmployeeCashAdvance,
  EmployeeCashAdvanceRepayment,
  PaymentMethodMaster,
  PosTransactionPayment,
  FixedAsset,
  FixedAssetDepreciationRun,
  FixedAssetDepreciationRunLine,
  RestaurantSession,
  RestaurantTableRecord,
  RestaurantOrderRecord,
  RestaurantKitchenTicketRecord,
  HrPosition,
  EmploymentContract,
  SalaryComponent,
  EmployeeSalaryComponent,
  WorkScheduleTemplate,
  WorkScheduleDay,
  EmployeeWorkScheduleAssignment,
  CompanyCalendarDay,
  LeaveType,
  LeaveRequest,
  LeaveRequestAction,
  LeaveBalanceLedgerEntry,
  EmployeeAvailabilityException,
  CollectionCoverageException,
  ImplementationReviewItem,
  StockMutation,
  PosStockDiscrepancy,
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
  cashBankReconciliations!: Table<CashBankReconciliation>;
  financeBalance!: Table<FinanceBalance>;
  unitConversions!: Table<UnitConversion>;
  units!: Table<UnitDefinition>;
  authUsers!: Table<AuthUser>;
  authSessions!: Table<AuthSession>;
  activityLogs!: Table<ActivityLog>;
  dashboardPreferences!: Table<DashboardPreference>;
  roles!: Table<Role>;
  rolePermissions!: Table<RolePermission>;
  syncQueue!: Table<SyncQueueItem>;
  syncCursors!: Table<SyncCursor>;
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
  salesOverpaymentSettlements!: Table<SalesOverpaymentSettlement>;
  salesOverpaymentSettlementAllocations!: Table<SalesOverpaymentSettlementAllocation>;
  salesReturns!: Table<SalesReturn>;
  salesReturnItems!: Table<SalesReturnItem>;
  purchaseDocuments!: Table<PurchaseDocument>;
  purchaseDocumentItems!: Table<PurchaseDocumentItem>;
  purchaseInvoicePayments!: Table<PurchaseInvoicePayment>;
  productRecipes!: Table<ProductRecipe>;
  productRecipeItems!: Table<ProductRecipeItem>;
  productionOrders!: Table<ProductionOrder>;
  productionOrderItems!: Table<ProductionOrderItem>;
  productionOrderCosts!: Table<ProductionOrderCost>;
  chartOfAccounts!: Table<ChartOfAccount>;
  financeAccountMappings!: Table<FinanceAccountMapping>;
  accountingProfileSetting!: Table<AccountingProfileSetting>;
  accountingInitialSetupSetting!: Table<AccountingInitialSetupSetting>;
  enabledModules!: Table<EnabledModule>;
  generalLedgerSetting!: Table<GeneralLedgerSetting>;
  openingBalanceBatches!: Table<OpeningBalanceBatch>;
  openingBalanceLines!: Table<OpeningBalanceLine>;
  journalEntries!: Table<JournalEntry>;
  journalEntryLines!: Table<JournalEntryLine>;
  accountingPeriods!: Table<AccountingPeriod>;
  closingRuns!: Table<ClosingRun>;
  accountingFiscalYears!: Table<AccountingFiscalYear>;
  fiscalYearClosingRuns!: Table<FiscalYearClosingRun>;
  cooperativeMembers!: Table<CooperativeMember>;
  cooperativeSavingTransactions!: Table<CooperativeSavingTransaction>;
  cooperativeMemberSavingBalances!: Table<CooperativeMemberSavingBalance>;
  cooperativeLoans!: Table<CooperativeLoan>;
  cooperativeLoanInstallments!: Table<CooperativeLoanInstallment>;
  cooperativeLoanPayments!: Table<CooperativeLoanPayment>;
  cooperativeLoanCollectionEvents!: Table<CooperativeLoanCollectionEvent>;
  cooperativeMemberCodes!: Table<CooperativeMemberCode>;
  cooperativeSettings!: Table<CooperativeSettings>;
  companyProfileSetting!: Table<CompanyProfileSetting>;
  inventoryLots!: Table<InventoryLot>;
  inventoryLotConsumptions!: Table<InventoryLotConsumption>;
  purchaseCostReconciliations!: Table<PurchaseCostReconciliation>;
  purchaseCostReconciliationItems!: Table<PurchaseCostReconciliationItem>;
  cooperativeAreas!: Table<CooperativeArea>;
  employees!: Table<Employee>;
  employeeAreas!: Table<EmployeeArea>;
  employeeCollectionSchedules!: Table<EmployeeCollectionSchedule>;
  payrollRuns!: Table<PayrollRun>;
  payrollRunItems!: Table<PayrollRunItem>;
  employeeCashAdvances!: Table<EmployeeCashAdvance>;
  employeeCashAdvanceRepayments!: Table<EmployeeCashAdvanceRepayment>;
  membershipPointTransactions!: Table<MembershipPointTransaction>;
  membershipSettings!: Table<MembershipSetting>;
  paymentMethods!: Table<PaymentMethodMaster>;
  posTransactionPayments!: Table<PosTransactionPayment>;
  fixedAssets!: Table<FixedAsset>;
  fixedAssetDepreciationRuns!: Table<FixedAssetDepreciationRun>;
  fixedAssetDepreciationRunLines!: Table<FixedAssetDepreciationRunLine>;
  restaurantSessions!: Table<RestaurantSession>;
  restaurantTables!: Table<RestaurantTableRecord>;
  restaurantOrders!: Table<RestaurantOrderRecord>;
  restaurantKitchenTickets!: Table<RestaurantKitchenTicketRecord>;
  hrPositions!: Table<HrPosition>;
  employmentContracts!: Table<EmploymentContract>;
  salaryComponents!: Table<SalaryComponent>;
  employeeSalaryComponents!: Table<EmployeeSalaryComponent>;
  workScheduleTemplates!: Table<WorkScheduleTemplate>;
  workScheduleDays!: Table<WorkScheduleDay>;
  employeeWorkScheduleAssignments!: Table<EmployeeWorkScheduleAssignment>;
  companyCalendarDays!: Table<CompanyCalendarDay>;
  leaveTypes!: Table<LeaveType>;
  leaveRequests!: Table<LeaveRequest>;
  leaveRequestActions!: Table<LeaveRequestAction>;
  leaveBalanceLedger!: Table<LeaveBalanceLedgerEntry>;
  employeeAvailabilityExceptions!: Table<EmployeeAvailabilityException>;
  collectionCoverageExceptions!: Table<CollectionCoverageException>;
  implementationReviewQueue!: Table<ImplementationReviewItem>;
  stockMutations!: Table<StockMutation>;
  posStockDiscrepancies!: Table<PosStockDiscrepancy>;

  constructor() {
    super('KasirkuDB');
    registerDatabaseMigrations.call(this);
    registerDatabasePopulate.call(this);
  }
}
