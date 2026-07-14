import { db } from '@/lib/db';
import {
  mergeRemoteAuthUsersIntoDexie,
  mergeRemoteRolePermissionsIntoDexie,
  mergeRemoteRolesIntoDexie,
} from '@/auth/authReadService';
import { mergeRemoteContactsIntoDexie } from '@/services/contactReadService';
import {
  mergeRemoteCooperativeAreasIntoDexie,
} from '@/services/cooperativeAreaReadService';
import {
  mergeRemoteCooperativeCollectionEventsIntoDexie,
} from '@/services/cooperativeCollectionEventService';
import {
  mergeRemoteCooperativeLoanInstallmentsIntoDexie,
  mergeRemoteCooperativeLoanPaymentsIntoDexie,
  mergeRemoteCooperativeLoansIntoDexie,
  mergeRemoteCooperativeMembersIntoDexie,
  mergeRemoteCooperativeMemberSavingBalancesIntoDexie,
  mergeRemoteCooperativeSavingTransactionsIntoDexie,
} from '@/services/cooperativeReadService';
import { mergeRemoteCurrenciesIntoDexie, mergeRemoteCurrencyRatesIntoDexie } from '@/services/currencyReadService';
import {
  mergeRemoteAccountingInitialSetupSettingIntoDexie,
  mergeRemoteAccountingProfileSettingIntoDexie,
  mergeRemoteEnabledModulesIntoDexie,
  mergeRemoteFinanceAccountMappingsIntoDexie,
  mergeRemoteGeneralLedgerSettingIntoDexie,
} from '@/services/accountingSettingReadService';
import { mergeRemoteCashierSessionsIntoDexie } from '@/services/cashierSessionReadService';
import { mergeRemoteChartOfAccountsIntoDexie } from '@/services/chartOfAccountReadService';
import { mergeRemoteDepartmentsIntoDexie } from '@/services/departmentReadService';
import {
  mergeRemoteEmployeeAreasIntoDexie,
  mergeRemoteEmployeeCollectionSchedulesIntoDexie,
  mergeRemoteEmployeesIntoDexie,
} from '@/services/employeeReadService';
import { mergeRemoteFinanceTransactionsIntoDexie } from '@/services/financeTransactionReadService';
import { mergeRemoteJournalEntryBundlesIntoDexie } from '@/services/journalEntryReadService';
import { mergeRemoteOpeningBalanceBundlesIntoDexie } from '@/services/openingBalanceReadService';
import {
  mergeRemoteEmployeeCashAdvanceBundlesIntoDexie,
  mergeRemotePayrollRunBundlesIntoDexie,
} from '@/services/payrollReadService';
import { mergeRemoteProductsIntoDexie } from '@/services/productReadService';
import { mergeRemoteProductionOrderBundlesIntoDexie } from '@/services/productionReadService';
import { mergeRemotePurchaseDocumentBundlesIntoDexie } from '@/services/purchaseDocumentReadService';
import { mergeRemoteProjectsIntoDexie } from '@/services/projectReadService';
import { mergeRemoteSalesDocumentBundlesIntoDexie } from '@/services/salesDocumentReadService';
import { mergeRemoteStockOpnameBundlesIntoDexie } from '@/services/stockOpnameReadService';
import { mergeRemoteTaxesIntoDexie } from '@/services/taxReadService';
import { mergeRemoteWarehousesIntoDexie } from '@/services/warehouseReadService';
import {
  activityLogPostgresAdapter,
  accountingInitialSetupSettingPostgresAdapter,
  accountingPeriodPostgresAdapter,
  accountingProfileSettingPostgresAdapter,
  authUserPostgresAdapter,
  cashBankReconciliationPostgresAdapter,
  closingRunPostgresAdapter,
  cashierSessionPostgresAdapter,
  chartOfAccountPostgresAdapter,
  contactPostgresAdapter,
  enabledModulePostgresAdapter,
  financeAccountMappingPostgresAdapter,
  generalLedgerSettingPostgresAdapter,
  cooperativeAreaPostgresAdapter,
  cooperativeCollectionEventPostgresAdapter,
  cooperativeLoanInstallmentPostgresAdapter,
  cooperativeLoanPaymentPostgresAdapter,
  cooperativeLoanPostgresAdapter,
  cooperativeMemberPostgresAdapter,
  cooperativeMemberSavingBalancePostgresAdapter,
  cooperativeSavingTransactionPostgresAdapter,
  currencyPostgresAdapter,
  currencyRatePostgresAdapter,
  departmentPostgresAdapter,
  employeeCashAdvancePostgresAdapter,
  employeeAreaPostgresAdapter,
  employeeCollectionSchedulePostgresAdapter,
  employeePostgresAdapter,
  financeTransactionPostgresAdapter,
  isTauriRuntime,
  journalEntryPostgresAdapter,
  openingBalancePostgresAdapter,
  payrollRunPostgresAdapter,
  postgresAdapter,
  productPostgresAdapter,
  productionOrderPostgresAdapter,
  purchaseDocumentPostgresAdapter,
  projectPostgresAdapter,
  rolePermissionPostgresAdapter,
  rolePostgresAdapter,
  salesDocumentPostgresAdapter,
  stockOpnamePostgresAdapter,
  stockMutationPostgresAdapter,
  taxPostgresAdapter,
  warehousePostgresAdapter,
  type RemoteAccountingPeriodDto,
  type RemoteAccountingInitialSetupSettingDto,
  type RemoteActivityLogDto,
  type RemoteAuthUserDto,
  type RemoteCashBankReconciliationDto,
  type RemoteClosingRunDto,
  type RemoteCashierSessionDto,
  type RemoteContactDto,
  type RemoteCooperativeAreaDto,
  type RemoteCooperativeLoanCollectionEventDto,
  type RemoteCooperativeLoanDto,
  type RemoteCooperativeLoanInstallmentDto,
  type RemoteCooperativeLoanPaymentDto,
  type RemoteCooperativeMemberDto,
  type RemoteCooperativeMemberSavingBalanceDto,
  type RemoteCooperativeSavingTransactionDto,
  type RemoteCurrencyDto,
  type RemoteCurrencyRateDto,
  type RemoteAccountingProfileSettingDto,
  type RemoteChartOfAccountDto,
  type RemoteDepartmentDto,
  type RemoteEnabledModuleDto,
  type RemoteFinanceAccountMappingDto,
  type RemoteGeneralLedgerSettingDto,
  type RemoteEmployeeAreaDto,
  type RemoteEmployeeCashAdvanceBundleDto,
  type RemoteEmployeeCashAdvanceDto,
  type RemoteEmployeeCashAdvanceRepaymentDto,
  type RemoteEmployeeCollectionScheduleDto,
  type RemoteEmployeeDto,
  type RemoteFinanceTransactionDto,
  type RemoteJournalEntryBundleDto,
  type RemoteJournalEntryDto,
  type RemoteJournalEntryLineDto,
  type RemoteOpeningBalanceBatchDto,
  type RemoteOpeningBalanceBundleDto,
  type RemoteOpeningBalanceLineDto,
  type RemotePayrollRunBundleDto,
  type RemotePayrollRunDto,
  type RemotePayrollRunItemDto,
  type RemoteProductDto,
  type RemoteProductionOrderBundleDto,
  type RemoteProductionOrderCostDto,
  type RemoteProductionOrderDto,
  type RemoteProductionOrderItemDto,
  type RemotePurchaseDocumentBundleDto,
  type RemotePurchaseDocumentDto,
  type RemotePurchaseDocumentItemDto,
  type RemoteProjectDto,
  type RemoteRoleDto,
  type RemoteRolePermissionDto,
  type RemoteRecordCooperativeLoanCollectionEventResult,
  type RemoteSalesDocumentBundleDto,
  type RemoteSalesDocumentDto,
  type RemoteSalesDocumentItemDto,
  type RemoteStockOpnameBundleDto,
  type RemoteStockOpnameDto,
  type RemoteStockOpnameItemDto,
  type RemoteStockMutationDto,
  type RemoteTaxDto,
  type RemoteWarehouseDto,
} from '@/services/postgresAdapter';
import { mergeRemoteCashBankReconciliationsIntoDexie } from '@/services/cashBankReconciliationReadService';
import { mergeRemoteAccountingPeriodsIntoDexie } from '@/services/accountingPeriodReadService';
import { mergeRemoteClosingRunsIntoDexie } from '@/services/closingRunReadService';
import type { AccountingPeriod, AccountingInitialSetupSetting, AccountingProfileSetting, ActivityLog, AuthUser, CashBankReconciliation, CashierSession, ClosingRun, ChartOfAccount, Contact, CooperativeArea, EnabledModule, FinanceAccountMapping, GeneralLedgerSetting, CooperativeLoan, CooperativeLoanCollectionEvent, CooperativeLoanInstallment, CooperativeLoanPayment, CooperativeMember, CooperativeMemberSavingBalance, CooperativeSavingTransaction, Currency, CurrencyRate, Department, Employee, EmployeeArea, EmployeeCashAdvance, EmployeeCashAdvanceRepayment, EmployeeCollectionSchedule, FinanceTransaction, JournalEntry, JournalEntryLine, OpeningBalanceBatch, OpeningBalanceLine, PayrollRun, PayrollRunItem, Product, ProductionOrder, ProductionOrderCost, ProductionOrderItem, Project, PurchaseDocument, PurchaseDocumentItem, Role, RolePermission, SalesDocument, SalesDocumentItem, StockMutation, StockOpname, StockOpnameItem, SyncQueueItem, SyncQueueOperation, Tax, Warehouse } from '@/types';

const SYNC_QUEUE_BATCH_SIZE = 20;
const SYNC_QUEUE_MAX_ATTEMPTS = 3;
const SYNC_QUEUE_PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;
const SESSION_STORAGE_KEY = 'frayukti-auth-session-id';
const MISSING_SERVER_SESSION_TOKEN_SYNC_ERROR = 'Sesi server tidak tersedia untuk upload event penagihan koperasi. Login server lalu retry sync.';
const ACTIVITY_LOG_ENTITY = 'activityLogs';
const AUTH_USER_ENTITY = 'authUsers';
const CASHIER_SESSION_ENTITY = 'cashierSessions';
const CASH_BANK_RECONCILIATION_ENTITY = 'cashBankReconciliations';
const ACCOUNTING_PERIOD_ENTITY = 'accountingPeriods';
const CLOSING_RUN_ENTITY = 'closingRuns';
const CONTACT_ENTITY = 'contacts';
const COOPERATIVE_AREA_ENTITY = 'cooperativeAreas';
const COOPERATIVE_LOAN_COLLECTION_EVENT_ENTITY = 'cooperativeLoanCollectionEvents';
const COOPERATIVE_LOAN_ENTITY = 'cooperativeLoans';
const COOPERATIVE_LOAN_INSTALLMENT_ENTITY = 'cooperativeLoanInstallments';
const COOPERATIVE_LOAN_PAYMENT_ENTITY = 'cooperativeLoanPayments';
const COOPERATIVE_MEMBER_ENTITY = 'cooperativeMembers';
const COOPERATIVE_MEMBER_SAVING_BALANCE_ENTITY = 'cooperativeMemberSavingBalances';
const COOPERATIVE_SAVING_TRANSACTION_ENTITY = 'cooperativeSavingTransactions';
const CURRENCY_ENTITY = 'currencies';
const CURRENCY_RATE_ENTITY = 'currencyRates';
const CHART_OF_ACCOUNT_ENTITY = 'chartOfAccounts';
const FINANCE_ACCOUNT_MAPPING_ENTITY = 'financeAccountMappings';
const ACCOUNTING_PROFILE_SETTING_ENTITY = 'accountingProfileSetting';
const ACCOUNTING_INITIAL_SETUP_SETTING_ENTITY = 'accountingInitialSetupSetting';
const ENABLED_MODULE_ENTITY = 'enabledModules';
const GENERAL_LEDGER_SETTING_ENTITY = 'generalLedgerSetting';
const DEPARTMENT_ENTITY = 'departments';
const EMPLOYEE_ENTITY = 'employees';
const EMPLOYEE_AREA_ENTITY = 'employeeAreas';
const EMPLOYEE_CASH_ADVANCE_ENTITY = 'employeeCashAdvances';
const EMPLOYEE_COLLECTION_SCHEDULE_ENTITY = 'employeeCollectionSchedules';
const FINANCE_TRANSACTION_ENTITY = 'financeTransactions';
const JOURNAL_ENTRY_ENTITY = 'journalEntries';
const OPENING_BALANCE_ENTITY = 'openingBalanceBatches';
const PAYROLL_RUN_ENTITY = 'payrollRuns';
const PRODUCT_ENTITY = 'products';
const PRODUCTION_ORDER_ENTITY = 'productionOrders';
const PROJECT_ENTITY = 'projects';
const PURCHASE_DOCUMENT_ENTITY = 'purchaseDocuments';
const ROLE_ENTITY = 'roles';
const ROLE_PERMISSION_ENTITY = 'rolePermissions';
const SALES_DOCUMENT_ENTITY = 'salesDocuments';
const STOCK_OPNAME_ENTITY = 'stockOpnames';
const STOCK_MUTATION_ENTITY = 'stockMutations';
const TAX_ENTITY = 'taxes';
const WAREHOUSE_ENTITY = 'warehouses';

let isProcessingSyncQueue = false;

const getErrorMessage = (error: unknown) => (
  error instanceof Error
    ? error.message
    : (
        error &&
        typeof error === 'object' &&
        typeof (error as { message?: unknown }).message === 'string'
      )
        ? (error as { message: string }).message
        : String(error)
);

const normalizeRemoteNumber = (value: number | undefined) => (
  typeof value === 'number' && Number.isFinite(value) ? value : 0
);

const isPostgresAvailableForSync = async () => {
  const health = await postgresAdapter.healthCheck();
  return health.available;
};

const getCurrentSyncServerSessionToken = async () => {
  if (typeof localStorage === 'undefined') return undefined;

  const sessionId = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!sessionId) return undefined;

  const session = await db.authSessions.get(sessionId);
  if (!session?.server_session_token) return undefined;
  if (
    session.server_session_expires_at &&
    Date.parse(session.server_session_expires_at) <= Date.now()
  ) {
    return undefined;
  }

  return session.server_session_token;
};

const mapActivityLogToRemoteDto = (log: ActivityLog): RemoteActivityLogDto => ({
  id: log.id,
  user_id: log.user_id,
  user_name: log.user_name,
  role: log.role,
  action: log.action,
  entity: log.entity,
  entity_id: log.entity_id,
  description: log.description,
  created_at: log.created_at,
});

const mapAuthUserToRemoteDto = (user: AuthUser): RemoteAuthUserDto => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  role_id: user.role_id,
  role_name: user.role_name,
  employee_id: user.employee_id,
  pin_hash: user.pin_hash,
  pin_salt: user.pin_salt,
  is_active: user.is_active,
  created_at: user.created_at,
  updated_at: user.updated_at,
});

const mapCashierSessionToRemoteDto = (session: CashierSession): RemoteCashierSessionDto => ({
  id: session.id,
  session_number: session.session_number,
  status: session.status,
  cashier_user_id: session.cashier_user_id ?? null,
  cashier_user_name: session.cashier_user_name ?? null,
  opened_at: session.opened_at,
  opening_cash_amount: session.opening_cash_amount,
  opening_note: session.opening_note ?? null,
  closed_at: session.closed_at ?? null,
  closed_by_user_id: session.closed_by_user_id ?? null,
  closed_by_user_name: session.closed_by_user_name ?? null,
  closing_cash_amount: session.closing_cash_amount ?? null,
  closing_note: session.closing_note ?? null,
  expected_cash_amount: session.expected_cash_amount ?? null,
  cash_sales_amount: session.cash_sales_amount ?? null,
  non_cash_sales_amount: session.non_cash_sales_amount ?? null,
  total_sales_amount: session.total_sales_amount ?? null,
  voided_sales_amount: session.voided_sales_amount ?? null,
  transaction_count: session.transaction_count ?? null,
  voided_transaction_count: session.voided_transaction_count ?? null,
  cash_difference_amount: session.cash_difference_amount ?? null,
  balance_status: session.balance_status ?? null,
  created_at: session.created_at,
  updated_at: session.updated_at,
});

const mapRoleToRemoteDto = (role: Role): RemoteRoleDto => ({
  id: role.id,
  name: role.name,
  code: role.code,
  description: role.description,
  is_system: role.is_system,
  is_owner: role.is_owner,
  is_active: role.is_active,
  created_at: role.created_at,
  updated_at: role.updated_at,
});

const mapRolePermissionToRemoteDto = (permission: RolePermission): RemoteRolePermissionDto => ({
  id: permission.id,
  role_id: permission.role_id,
  permission_code: permission.permission_code,
  created_at: permission.created_at,
  updated_at: permission.updated_at,
});

const mapDeletedRolePermissionToRemoteDto = (
  permission: RolePermission,
  deletedAt: string,
): RemoteRolePermissionDto => ({
  ...mapRolePermissionToRemoteDto(permission),
  updated_at: deletedAt,
  deleted_at: deletedAt,
});

const mapContactToRemoteDto = (contact: Contact): RemoteContactDto => ({
  id: contact.id,
  name: contact.name,
  contact_type: contact.contact_type,
  phone: contact.phone,
  email: contact.email,
  address: contact.address,
  company_name: contact.company_name,
  tax_number: contact.tax_number,
  notes: contact.notes,
  is_active: contact.is_active,
  is_member: Boolean(contact.is_member),
  membership_number: contact.membership_number,
  membership_status: contact.membership_status,
  membership_joined_at: contact.membership_joined_at,
  membership_points_balance: normalizeRemoteNumber(contact.membership_points_balance),
  created_at: contact.created_at,
  updated_at: contact.updated_at,
});

const mapCooperativeAreaToRemoteDto = (area: CooperativeArea): RemoteCooperativeAreaDto => ({
  id: area.id,
  name: area.name,
  code: area.code ?? null,
  description: area.description ?? null,
  is_active: area.is_active,
  created_at: area.created_at,
  updated_at: area.updated_at,
  deleted_at: null,
});

const mapCooperativeMemberToRemoteDto = (member: CooperativeMember): RemoteCooperativeMemberDto => ({
  id: member.id,
  member_number: member.member_number,
  name: member.name,
  identity_number: member.identity_number,
  phone: member.phone,
  address: member.address,
  area_id: member.area_id,
  area_name: member.area_name,
  area_code: member.area_code,
  officer_id: member.officer_id,
  officer_name: member.officer_name,
  officer_position: member.officer_position,
  join_date: member.join_date,
  status: member.status,
  notes: member.notes,
  created_at: member.created_at,
  updated_at: member.updated_at,
  created_by: member.created_by,
  created_by_name: member.created_by_name,
  updated_by: member.updated_by,
  updated_by_name: member.updated_by_name,
});

const mapCooperativeSavingTransactionToRemoteDto = (
  transaction: CooperativeSavingTransaction,
): RemoteCooperativeSavingTransactionDto => ({
  id: transaction.id,
  member_id: transaction.member_id,
  member_number: transaction.member_number,
  member_name: transaction.member_name,
  saving_type: transaction.saving_type,
  transaction_type: transaction.transaction_type,
  withdrawal_source: transaction.withdrawal_source,
  interest_rate_per_month: transaction.interest_rate_per_month,
  amount: normalizeRemoteNumber(transaction.amount),
  transaction_date: transaction.transaction_date,
  status: transaction.status,
  cash_account_id: transaction.cash_account_id,
  cash_account_code: transaction.cash_account_code,
  cash_account_name: transaction.cash_account_name,
  payment_method: transaction.payment_method,
  payment_channel: transaction.payment_channel,
  finance_transaction_id: transaction.finance_transaction_id,
  journal_entry_id: transaction.journal_entry_id,
  reversal_of_transaction_id: transaction.reversal_of_transaction_id,
  reversal_transaction_id: transaction.reversal_transaction_id,
  reversal_finance_transaction_id: transaction.reversal_finance_transaction_id,
  reversal_journal_entry_id: transaction.reversal_journal_entry_id,
  reversed_at: transaction.reversed_at,
  reversal_reason: transaction.reversal_reason,
  notes: transaction.notes,
  created_at: transaction.created_at,
  updated_at: transaction.updated_at,
  created_by: transaction.created_by,
  created_by_name: transaction.created_by_name,
  updated_by: transaction.updated_by,
  updated_by_name: transaction.updated_by_name,
});

const mapCooperativeMemberSavingBalanceToRemoteDto = (
  balance: CooperativeMemberSavingBalance,
): RemoteCooperativeMemberSavingBalanceDto => ({
  id: balance.id,
  member_id: balance.member_id,
  member_number: balance.member_number,
  member_name: balance.member_name,
  saving_type: balance.saving_type,
  balance: normalizeRemoteNumber(balance.balance),
  updated_at: balance.updated_at,
});

const mapCooperativeLoanToRemoteDto = (loan: CooperativeLoan): RemoteCooperativeLoanDto => ({
  id: loan.id,
  loan_number: loan.loan_number,
  member_id: loan.member_id,
  member_number: loan.member_number,
  member_name: loan.member_name,
  principal_amount: normalizeRemoteNumber(loan.principal_amount),
  interest_rate_per_month: normalizeRemoteNumber(loan.interest_rate_per_month),
  tenor_months: Math.trunc(normalizeRemoteNumber(loan.tenor_months)),
  interest_calculation_type: loan.interest_calculation_type ?? 'MONTHLY_RATE',
  billing_frequency: loan.billing_frequency ?? 'MONTHLY',
  installment_count: Math.trunc(normalizeRemoteNumber(loan.installment_count ?? loan.tenor_months)),
  loan_service_rate: normalizeRemoteNumber(loan.loan_service_rate ?? loan.interest_rate_per_month),
  loan_service_amount: normalizeRemoteNumber(loan.loan_service_amount ?? loan.total_interest_amount),
  admin_fee_rate: normalizeRemoteNumber(loan.admin_fee_rate),
  admin_fee_amount: normalizeRemoteNumber(loan.admin_fee_amount),
  mandatory_saving_rate: normalizeRemoteNumber(loan.mandatory_saving_rate),
  mandatory_saving_amount: normalizeRemoteNumber(loan.mandatory_saving_amount),
  deduction_method: loan.deduction_method ?? 'NONE',
  net_disbursement_amount: normalizeRemoteNumber(loan.net_disbursement_amount ?? loan.principal_amount),
  total_interest_amount: normalizeRemoteNumber(loan.total_interest_amount),
  total_payable_amount: normalizeRemoteNumber(loan.total_payable_amount),
  outstanding_principal_amount: normalizeRemoteNumber(loan.outstanding_principal_amount),
  outstanding_interest_amount: normalizeRemoteNumber(loan.outstanding_interest_amount),
  outstanding_penalty_amount: normalizeRemoteNumber(loan.outstanding_penalty_amount),
  status: loan.status,
  application_date: loan.application_date,
  approved_at: loan.approved_at,
  approved_by: loan.approved_by,
  approved_by_name: loan.approved_by_name,
  approval_notes: loan.approval_notes,
  rejected_at: loan.rejected_at,
  rejected_by: loan.rejected_by,
  rejected_by_name: loan.rejected_by_name,
  rejection_reason: loan.rejection_reason,
  disbursed_at: loan.disbursed_at,
  scheduled_disbursement_date: loan.scheduled_disbursement_date,
  officer_id: loan.officer_id,
  officer_name: loan.officer_name,
  officer_position: loan.officer_position,
  area_id: loan.area_id,
  area_name: loan.area_name,
  area_code: loan.area_code,
  collection_schedule_id: loan.collection_schedule_id,
  collection_weekday: loan.collection_weekday,
  cash_account_id: loan.cash_account_id,
  cash_account_code: loan.cash_account_code,
  cash_account_name: loan.cash_account_name,
  payment_method: loan.payment_method,
  payment_channel: loan.payment_channel,
  finance_transaction_id: loan.finance_transaction_id,
  journal_entry_id: loan.journal_entry_id,
  reversal_finance_transaction_id: loan.reversal_finance_transaction_id,
  reversal_journal_entry_id: loan.reversal_journal_entry_id,
  reversed_at: loan.reversed_at,
  reversal_reason: loan.reversal_reason,
  disbursement_notes: loan.disbursement_notes,
  notes: loan.notes,
  is_migration: loan.is_migration ?? false,
  created_at: loan.created_at,
  updated_at: loan.updated_at,
  created_by: loan.created_by,
  created_by_name: loan.created_by_name,
  updated_by: loan.updated_by,
  updated_by_name: loan.updated_by_name,
});

const mapCooperativeLoanInstallmentToRemoteDto = (
  installment: CooperativeLoanInstallment,
): RemoteCooperativeLoanInstallmentDto => ({
  id: installment.id,
  loan_id: installment.loan_id,
  loan_number: installment.loan_number,
  member_id: installment.member_id,
  member_number: installment.member_number,
  member_name: installment.member_name,
  installment_number: Math.trunc(normalizeRemoteNumber(installment.installment_number)),
  due_date: installment.due_date,
  principal_amount: normalizeRemoteNumber(installment.principal_amount),
  interest_amount: normalizeRemoteNumber(installment.interest_amount),
  penalty_amount: normalizeRemoteNumber(installment.penalty_amount),
  paid_principal_amount: normalizeRemoteNumber(installment.paid_principal_amount),
  paid_interest_amount: normalizeRemoteNumber(installment.paid_interest_amount),
  paid_penalty_amount: normalizeRemoteNumber(installment.paid_penalty_amount),
  status: installment.status,
  paid_at: installment.paid_at,
  collection_status: installment.collection_status ?? 'NONE',
  follow_up_date: installment.follow_up_date,
  collection_notes: installment.collection_notes,
  last_contacted_at: installment.last_contacted_at,
  created_at: installment.created_at,
  updated_at: installment.updated_at,
});

const mapCooperativeLoanCollectionEventToRemoteDto = (
  event: CooperativeLoanCollectionEvent,
): RemoteCooperativeLoanCollectionEventDto => ({
  id: event.id,
  installment_id: event.installment_id,
  loan_id: event.loan_id,
  loan_number: event.loan_number,
  member_id: event.member_id,
  member_number: event.member_number,
  member_name: event.member_name,
  collection_status: event.collection_status,
  follow_up_date: event.follow_up_date ?? null,
  collection_notes: event.collection_notes,
  contacted_at: event.contacted_at,
  actor_user_id: event.actor_user_id ?? null,
  actor_user_name: event.actor_user_name ?? null,
  actor_employee_id: event.actor_employee_id ?? null,
  created_at: event.created_at,
});

const mapCooperativeLoanPaymentToRemoteDto = (
  payment: CooperativeLoanPayment,
): RemoteCooperativeLoanPaymentDto => ({
  id: payment.id,
  payment_number: payment.payment_number,
  payment_type: payment.payment_type,
  payment_group_id: payment.payment_group_id,
  payment_group_number: payment.payment_group_number,
  payment_group_sequence: payment.payment_group_sequence,
  payment_group_total: payment.payment_group_total,
  loan_id: payment.loan_id,
  loan_number: payment.loan_number,
  installment_id: payment.installment_id,
  member_id: payment.member_id,
  member_number: payment.member_number,
  member_name: payment.member_name,
  amount: normalizeRemoteNumber(payment.amount),
  principal_amount: normalizeRemoteNumber(payment.principal_amount),
  interest_amount: normalizeRemoteNumber(payment.interest_amount),
  penalty_amount: normalizeRemoteNumber(payment.penalty_amount),
  payment_date: payment.payment_date,
  status: payment.status,
  cash_account_id: payment.cash_account_id,
  cash_account_code: payment.cash_account_code,
  cash_account_name: payment.cash_account_name,
  payment_method: payment.payment_method,
  payment_channel: payment.payment_channel,
  collector_id: payment.collector_id,
  collector_name: payment.collector_name,
  collector_position: payment.collector_position,
  received_by: payment.received_by,
  received_by_name: payment.received_by_name,
  posted_at: payment.posted_at,
  finance_transaction_id: payment.finance_transaction_id,
  journal_entry_id: payment.journal_entry_id,
  reversal_of_payment_id: payment.reversal_of_payment_id,
  reversal_payment_id: payment.reversal_payment_id,
  reversal_finance_transaction_id: payment.reversal_finance_transaction_id,
  reversal_journal_entry_id: payment.reversal_journal_entry_id,
  reversed_at: payment.reversed_at,
  reversal_reason: payment.reversal_reason,
  notes: payment.notes,
  created_at: payment.created_at,
  updated_at: payment.updated_at,
  created_by: payment.created_by,
  created_by_name: payment.created_by_name,
  updated_by: payment.updated_by,
  updated_by_name: payment.updated_by_name,
  idempotency_key: payment.idempotency_key,
});

const mapChartOfAccountToRemoteDto = (account: ChartOfAccount): RemoteChartOfAccountDto => ({
  id: account.id,
  code: account.code,
  name: account.name,
  type: account.type,
  normal_balance: account.normal_balance,
  parent_id: account.parent_id ?? null,
  parent_code: account.parent_code ?? null,
  parent_name: account.parent_name ?? null,
  is_postable: account.is_postable,
  is_system: account.is_system,
  is_active: account.is_active,
  description: account.description ?? null,
  created_at: account.created_at,
  updated_at: account.updated_at,
  deleted_at: null,
});

const mapFinanceAccountMappingToRemoteDto = (
  mapping: FinanceAccountMapping,
): RemoteFinanceAccountMappingDto => ({
  id: mapping.id,
  key: mapping.key,
  category: mapping.category ?? null,
  account_id: mapping.account_id,
  account_code: mapping.account_code,
  account_name: mapping.account_name,
  account_type: mapping.account_type,
  is_system: mapping.is_system,
  created_at: mapping.created_at,
  updated_at: mapping.updated_at,
});

const mapAccountingProfileSettingToRemoteDto = (
  setting: AccountingProfileSetting,
): RemoteAccountingProfileSettingDto => ({
  id: setting.id,
  accounting_profile: setting.accounting_profile,
  industry_extension: setting.industry_extension,
  template_id: setting.template_id ?? null,
  locked_after_transaction: setting.locked_after_transaction ?? null,
  created_at: setting.created_at,
  updated_at: setting.updated_at,
});

const mapAccountingInitialSetupSettingToRemoteDto = (
  setting: AccountingInitialSetupSetting,
): RemoteAccountingInitialSetupSettingDto => ({
  id: setting.id,
  business_template_code: setting.business_template_code,
  accounting_profile: setting.accounting_profile,
  industry_extension: setting.industry_extension,
  template_id: setting.template_id,
  cutoff_date: setting.cutoff_date,
  fiscal_period_start: setting.fiscal_period_start,
  fiscal_period_end: setting.fiscal_period_end,
  current_period_start: setting.current_period_start,
  current_period_end: setting.current_period_end,
  current_period_id: setting.current_period_id ?? null,
  base_currency_code: setting.base_currency_code,
  inventory_policy: setting.inventory_policy,
  setup_completed_at: setting.setup_completed_at ?? null,
  setup_completed_by: setting.setup_completed_by ?? null,
  setup_completed_by_name: setting.setup_completed_by_name ?? null,
  version: setting.version,
  created_at: setting.created_at,
  updated_at: setting.updated_at,
});

const mapEnabledModuleToRemoteDto = (module: EnabledModule): RemoteEnabledModuleDto => ({
  id: module.id,
  code: module.code,
  is_enabled: module.is_enabled,
  source: module.source,
  requires_profile: module.requires_profile ?? null,
  requires_extension: module.requires_extension ?? null,
  created_at: module.created_at,
  updated_at: module.updated_at,
});

const mapGeneralLedgerSettingToRemoteDto = (
  setting: GeneralLedgerSetting,
): RemoteGeneralLedgerSettingDto => ({
  id: setting.id,
  is_ready: setting.is_ready,
  cutoff_date: setting.cutoff_date ?? null,
  inventory_policy: setting.inventory_policy,
  opening_balance_journal_id: setting.opening_balance_journal_id ?? null,
  activated_at: setting.activated_at ?? null,
  created_at: setting.created_at,
  updated_at: setting.updated_at,
});

const mapDepartmentToRemoteDto = (department: Department): RemoteDepartmentDto => ({
  id: department.id,
  code: department.code,
  name: department.name,
  description: department.description,
  is_active: department.is_active,
  created_at: department.created_at,
  updated_at: department.updated_at,
});

const mapEmployeeToRemoteDto = (employee: Employee): RemoteEmployeeDto => ({
  id: employee.id,
  name: employee.name,
  phone: employee.phone ?? null,
  email: employee.email ?? null,
  address: employee.address ?? null,
  position: employee.position ?? null,
  user_id: employee.user_id ?? null,
  user_name: employee.user_name ?? null,
  login_role_id: employee.login_role_id ?? null,
  field_cash_account_id: employee.field_cash_account_id ?? null,
  field_cash_account_code: employee.field_cash_account_code ?? null,
  field_cash_account_name: employee.field_cash_account_name ?? null,
  pin_hash: employee.pin_hash ?? null,
  pin_salt: employee.pin_salt ?? null,
  notes: employee.notes ?? null,
  is_active: employee.is_active,
  created_at: employee.created_at,
  updated_at: employee.updated_at,
  deleted_at: null,
});

const mapEmployeeAreaToRemoteDto = (assignment: EmployeeArea): RemoteEmployeeAreaDto => ({
  id: assignment.id,
  employee_id: assignment.employee_id,
  area_id: assignment.area_id,
  area_name: assignment.area_name,
  area_code: assignment.area_code ?? null,
  created_at: assignment.created_at,
  updated_at: assignment.updated_at,
  deleted_at: null,
});

const mapDeletedEmployeeAreaToRemoteDto = (
  assignment: EmployeeArea,
  deletedAt: string,
): RemoteEmployeeAreaDto => ({
  ...mapEmployeeAreaToRemoteDto(assignment),
  updated_at: deletedAt,
  deleted_at: deletedAt,
});

const mapEmployeeCollectionScheduleToRemoteDto = (
  schedule: EmployeeCollectionSchedule,
): RemoteEmployeeCollectionScheduleDto => ({
  id: schedule.id,
  employee_id: schedule.employee_id,
  employee_name: schedule.employee_name,
  employee_position: schedule.employee_position ?? null,
  area_id: schedule.area_id,
  area_name: schedule.area_name,
  area_code: schedule.area_code ?? null,
  weekday: schedule.weekday,
  effective_from: schedule.effective_from ?? null,
  effective_until: schedule.effective_until ?? null,
  is_active: schedule.is_active,
  created_at: schedule.created_at,
  updated_at: schedule.updated_at,
  deleted_at: null,
});

const mapDeletedEmployeeCollectionScheduleToRemoteDto = (
  schedule: EmployeeCollectionSchedule,
  deletedAt: string,
): RemoteEmployeeCollectionScheduleDto => ({
  ...mapEmployeeCollectionScheduleToRemoteDto(schedule),
  is_active: false,
  updated_at: deletedAt,
  deleted_at: deletedAt,
});

const mapPayrollRunToRemoteDto = (run: PayrollRun): RemotePayrollRunDto => ({
  id: run.id,
  payroll_number: run.payroll_number,
  period_start: run.period_start,
  period_end: run.period_end,
  status: run.status,
  employee_count: Math.trunc(normalizeRemoteNumber(run.employee_count)),
  gross_amount: normalizeRemoteNumber(run.gross_amount),
  allowance_amount: normalizeRemoteNumber(run.allowance_amount),
  bonus_amount: normalizeRemoteNumber(run.bonus_amount),
  other_deduction_amount: normalizeRemoteNumber(run.other_deduction_amount),
  cash_advance_deduction_amount: normalizeRemoteNumber(run.cash_advance_deduction_amount),
  deduction_amount: normalizeRemoteNumber(run.deduction_amount),
  net_amount: normalizeRemoteNumber(run.net_amount),
  payment_method: run.payment_method ?? null,
  payment_channel: run.payment_channel ?? null,
  cash_account_id: run.cash_account_id ?? null,
  cash_account_code: run.cash_account_code ?? null,
  cash_account_name: run.cash_account_name ?? null,
  finance_transaction_id: run.finance_transaction_id ?? null,
  notes: run.notes ?? null,
  approved_at: run.approved_at ?? null,
  paid_at: run.paid_at ?? null,
  voided_at: run.voided_at ?? null,
  created_by: run.created_by ?? null,
  created_by_name: run.created_by_name ?? null,
  updated_by: run.updated_by ?? null,
  updated_by_name: run.updated_by_name ?? null,
  created_at: run.created_at,
  updated_at: run.updated_at,
});

const mapPayrollRunItemToRemoteDto = (item: PayrollRunItem): RemotePayrollRunItemDto => ({
  id: item.id,
  payroll_run_id: item.payroll_run_id,
  employee_id: item.employee_id,
  employee_name: item.employee_name,
  employee_position: item.employee_position ?? null,
  base_salary: normalizeRemoteNumber(item.base_salary),
  allowance_amount: normalizeRemoteNumber(item.allowance_amount),
  bonus_amount: normalizeRemoteNumber(item.bonus_amount),
  other_deduction_amount: normalizeRemoteNumber(item.other_deduction_amount),
  cash_advance_deduction_amount: normalizeRemoteNumber(item.cash_advance_deduction_amount),
  deduction_amount: normalizeRemoteNumber(item.deduction_amount),
  gross_amount: normalizeRemoteNumber(item.gross_amount),
  net_amount: normalizeRemoteNumber(item.net_amount),
  notes: item.notes ?? null,
  created_at: item.created_at,
  updated_at: item.updated_at,
});

const mapEmployeeCashAdvanceToRemoteDto = (
  cashAdvance: EmployeeCashAdvance,
): RemoteEmployeeCashAdvanceDto => ({
  id: cashAdvance.id,
  advance_number: cashAdvance.advance_number,
  employee_id: cashAdvance.employee_id,
  employee_name: cashAdvance.employee_name,
  employee_position: cashAdvance.employee_position ?? null,
  amount: normalizeRemoteNumber(cashAdvance.amount),
  outstanding_amount: normalizeRemoteNumber(cashAdvance.outstanding_amount),
  status: cashAdvance.status,
  disbursed_at: cashAdvance.disbursed_at,
  payment_method: cashAdvance.payment_method ?? null,
  payment_channel: cashAdvance.payment_channel ?? null,
  cash_account_id: cashAdvance.cash_account_id ?? null,
  cash_account_code: cashAdvance.cash_account_code ?? null,
  cash_account_name: cashAdvance.cash_account_name ?? null,
  finance_transaction_id: cashAdvance.finance_transaction_id ?? null,
  notes: cashAdvance.notes ?? null,
  voided_at: cashAdvance.voided_at ?? null,
  void_reason: cashAdvance.void_reason ?? null,
  created_by: cashAdvance.created_by ?? null,
  created_by_name: cashAdvance.created_by_name ?? null,
  updated_by: cashAdvance.updated_by ?? null,
  updated_by_name: cashAdvance.updated_by_name ?? null,
  created_at: cashAdvance.created_at,
  updated_at: cashAdvance.updated_at,
});

const mapEmployeeCashAdvanceRepaymentToRemoteDto = (
  repayment: EmployeeCashAdvanceRepayment,
): RemoteEmployeeCashAdvanceRepaymentDto => ({
  id: repayment.id,
  cash_advance_id: repayment.cash_advance_id,
  cash_advance_number: repayment.cash_advance_number,
  payroll_run_id: repayment.payroll_run_id,
  payroll_run_item_id: repayment.payroll_run_item_id,
  payroll_number: repayment.payroll_number ?? null,
  employee_id: repayment.employee_id,
  employee_name: repayment.employee_name,
  amount: normalizeRemoteNumber(repayment.amount),
  status: repayment.status,
  allocated_at: repayment.allocated_at,
  posted_at: repayment.posted_at ?? null,
  voided_at: repayment.voided_at ?? null,
  created_at: repayment.created_at,
  updated_at: repayment.updated_at,
});

const mapPayrollRunBundleToRemoteDto = (
  run: PayrollRun,
  items: PayrollRunItem[],
  cashAdvanceRepayments: EmployeeCashAdvanceRepayment[],
): RemotePayrollRunBundleDto => ({
  run: mapPayrollRunToRemoteDto(run),
  items: items.map(mapPayrollRunItemToRemoteDto),
  cash_advance_repayments: cashAdvanceRepayments.map(mapEmployeeCashAdvanceRepaymentToRemoteDto),
});

const mapEmployeeCashAdvanceBundleToRemoteDto = (
  cashAdvance: EmployeeCashAdvance,
  repayments: EmployeeCashAdvanceRepayment[],
): RemoteEmployeeCashAdvanceBundleDto => ({
  cash_advance: mapEmployeeCashAdvanceToRemoteDto(cashAdvance),
  repayments: repayments.map(mapEmployeeCashAdvanceRepaymentToRemoteDto),
});

const mapProjectToRemoteDto = (project: Project): RemoteProjectDto => ({
  id: project.id,
  code: project.code,
  name: project.name,
  status: project.status,
  contact_id: project.contact_id,
  contact_name: project.contact_name,
  department_id: project.department_id,
  department_code: project.department_code,
  department_name: project.department_name,
  start_date: project.start_date,
  end_date: project.end_date,
  budget_amount: project.budget_amount,
  description: project.description,
  is_active: project.is_active,
  created_at: project.created_at,
  updated_at: project.updated_at,
});

const mapProductToRemoteDto = (product: Product): RemoteProductDto => ({
  id: product.id,
  name: product.name,
  category: product.category,
  purchase_unit: product.purchase_unit,
  selling_unit: product.selling_unit,
  purchase_price: normalizeRemoteNumber(product.purchase_price),
  selling_price: normalizeRemoteNumber(product.selling_price),
  stock: normalizeRemoteNumber(product.stock),
  sku: product.sku,
  wholesale_prices: product.wholesale_prices,
  sellable_units: product.sellable_units,
  unit_mappings: product.unit_mappings,
  created_at: product.created_at,
  updated_at: product.updated_at,
});

const mapStockMutationToRemoteDto = (mutation: StockMutation): RemoteStockMutationDto => ({
  id: mutation.id,
  product_id: mutation.product_id,
  product_name: mutation.product_name,
  sku: mutation.sku,
  warehouse_id: mutation.warehouse_id,
  warehouse_code: mutation.warehouse_code,
  warehouse_name: mutation.warehouse_name,
  source_type: mutation.source_type,
  source_id: mutation.source_id,
  source_number: mutation.source_number,
  source_line_id: mutation.source_line_id,
  quantity_delta: mutation.quantity_delta,
  unit: mutation.unit,
  stock_unit: mutation.stock_unit,
  source_quantity: mutation.source_quantity,
  source_unit: mutation.source_unit,
  reason: mutation.reason,
  actor_user_id: mutation.actor_user_id,
  actor_user_name: mutation.actor_user_name,
  occurred_at: mutation.occurred_at,
  created_at: mutation.created_at,
});

const mapStockOpnameToRemoteDto = (opname: StockOpname): RemoteStockOpnameDto => ({
  id: opname.id,
  opname_number: opname.opname_number,
  status: opname.status,
  counted_at: opname.counted_at,
  reviewed_at: opname.reviewed_at,
  posted_at: opname.posted_at,
  cancelled_at: opname.cancelled_at,
  warehouse_id: opname.warehouse_id,
  warehouse_code: opname.warehouse_code,
  warehouse_name: opname.warehouse_name,
  notes: opname.notes,
  created_by: opname.created_by,
  created_by_name: opname.created_by_name,
  reviewed_by: opname.reviewed_by,
  reviewed_by_name: opname.reviewed_by_name,
  posted_by: opname.posted_by,
  posted_by_name: opname.posted_by_name,
  cancelled_by: opname.cancelled_by,
  cancelled_by_name: opname.cancelled_by_name,
  cancel_reason: opname.cancel_reason,
  total_items: opname.total_items,
  total_adjustment_in: opname.total_adjustment_in,
  total_adjustment_out: opname.total_adjustment_out,
  total_variance_value: opname.total_variance_value,
  created_at: opname.created_at,
  updated_at: opname.updated_at,
});

const mapStockOpnameItemToRemoteDto = (item: StockOpnameItem): RemoteStockOpnameItemDto => ({
  id: item.id,
  opname_id: item.opname_id,
  product_id: item.product_id,
  product_name: item.product_name,
  sku: item.sku,
  category: item.category,
  system_quantity: item.system_quantity,
  counted_quantity: item.counted_quantity,
  quantity_delta: item.quantity_delta,
  unit: item.unit,
  cost_per_unit: item.cost_per_unit,
  variance_value: item.variance_value,
  notes: item.notes,
  created_at: item.created_at,
  updated_at: item.updated_at,
});

const mapStockOpnameBundleToRemoteDto = (
  opname: StockOpname,
  items: StockOpnameItem[],
): RemoteStockOpnameBundleDto => ({
  opname: mapStockOpnameToRemoteDto(opname),
  items: items.map(mapStockOpnameItemToRemoteDto),
});

const mapProductionOrderToRemoteDto = (order: ProductionOrder): RemoteProductionOrderDto => ({
  id: order.id,
  production_number: order.production_number,
  status: order.status,
  finished_product_id: order.finished_product_id,
  finished_product_name: order.finished_product_name,
  quantity_produced: normalizeRemoteNumber(order.quantity_produced),
  unit: order.unit,
  material_cost: normalizeRemoteNumber(order.material_cost),
  additional_cost: normalizeRemoteNumber(order.additional_cost),
  total_cost: normalizeRemoteNumber(order.total_cost),
  unit_cost: normalizeRemoteNumber(order.unit_cost),
  produced_at: order.produced_at,
  posted_at: order.posted_at,
  voided_at: order.voided_at,
  void_reason: order.void_reason,
  notes: order.notes,
  created_by: order.created_by,
  created_by_name: order.created_by_name,
  created_at: order.created_at,
  updated_at: order.updated_at,
});

const mapProductionOrderItemToRemoteDto = (item: ProductionOrderItem): RemoteProductionOrderItemDto => ({
  id: item.id,
  production_order_id: item.production_order_id,
  material_product_id: item.material_product_id,
  material_product_name: item.material_product_name,
  sku: item.sku,
  quantity_used: normalizeRemoteNumber(item.quantity_used),
  unit: item.unit,
  stock_quantity_used: normalizeRemoteNumber(item.stock_quantity_used),
  stock_unit: item.stock_unit,
  cost_per_unit: normalizeRemoteNumber(item.cost_per_unit),
  total_cost: normalizeRemoteNumber(item.total_cost),
  created_at: item.created_at,
  updated_at: item.updated_at,
});

const mapProductionOrderCostToRemoteDto = (cost: ProductionOrderCost): RemoteProductionOrderCostDto => ({
  id: cost.id,
  production_order_id: cost.production_order_id,
  name: cost.name,
  amount: normalizeRemoteNumber(cost.amount),
  account_id: cost.account_id,
  account_code: cost.account_code,
  account_name: cost.account_name,
  created_at: cost.created_at,
  updated_at: cost.updated_at,
});

const mapProductionOrderBundleToRemoteDto = (
  order: ProductionOrder,
  items: ProductionOrderItem[],
  costs: ProductionOrderCost[],
): RemoteProductionOrderBundleDto => ({
  order: mapProductionOrderToRemoteDto(order),
  items: items.map(mapProductionOrderItemToRemoteDto),
  costs: costs.map(mapProductionOrderCostToRemoteDto),
});

const mapFinanceTransactionToRemoteDto = (transaction: FinanceTransaction): RemoteFinanceTransactionDto => ({
  id: transaction.id,
  type: transaction.type,
  category: transaction.category,
  amount: normalizeRemoteNumber(transaction.amount),
  description: transaction.description,
  reference_id: transaction.reference_id,
  account_id: transaction.account_id,
  account_code: transaction.account_code,
  account_name: transaction.account_name,
  account_type: transaction.account_type,
  payment_method: transaction.payment_method,
  payment_channel: transaction.payment_channel,
  cash_account_id: transaction.cash_account_id,
  cash_account_code: transaction.cash_account_code,
  cash_account_name: transaction.cash_account_name,
  transfer_group_id: transaction.transfer_group_id,
  transfer_direction: transaction.transfer_direction,
  reversal_of_transfer_group_id: transaction.reversal_of_transfer_group_id,
  field_cash_session_id: transaction.field_cash_session_id,
  field_cash_session_number: transaction.field_cash_session_number,
  field_employee_id: transaction.field_employee_id,
  field_employee_name: transaction.field_employee_name,
  field_cash_movement_kind: transaction.field_cash_movement_kind,
  cash_bank_reconciliation_id: transaction.cash_bank_reconciliation_id,
  cash_bank_reconciled_at: transaction.cash_bank_reconciled_at,
  cash_bank_reconciled_by: transaction.cash_bank_reconciled_by,
  cash_bank_reconciled_by_name: transaction.cash_bank_reconciled_by_name,
  version: transaction.version ?? 1,
  created_by: transaction.created_by,
  created_by_name: transaction.created_by_name,
  updated_by: transaction.updated_by,
  updated_by_name: transaction.updated_by_name,
  created_at: transaction.created_at,
  updated_at: transaction.updated_at ?? transaction.created_at,
  deleted_at: transaction.deleted_at,
});

const mapCashBankReconciliationToRemoteDto = (
  reconciliation: CashBankReconciliation,
): RemoteCashBankReconciliationDto => ({
  id: reconciliation.id,
  reconciliation_number: reconciliation.reconciliation_number,
  cash_account_id: reconciliation.cash_account_id,
  cash_account_code: reconciliation.cash_account_code,
  cash_account_name: reconciliation.cash_account_name,
  statement_date: reconciliation.statement_date,
  statement_reference: reconciliation.statement_reference,
  statement_ending_balance: normalizeRemoteNumber(reconciliation.statement_ending_balance),
  book_balance_amount: normalizeRemoteNumber(reconciliation.book_balance_amount),
  cleared_balance_amount: normalizeRemoteNumber(reconciliation.cleared_balance_amount),
  selected_transaction_total_amount: normalizeRemoteNumber(reconciliation.selected_transaction_total_amount),
  selected_transaction_count: Math.trunc(normalizeRemoteNumber(reconciliation.selected_transaction_count)),
  selected_transaction_ids: reconciliation.selected_transaction_ids,
  difference_amount: normalizeRemoteNumber(reconciliation.difference_amount),
  status: reconciliation.status,
  notes: reconciliation.notes,
  voided_at: reconciliation.voided_at,
  void_reason: reconciliation.void_reason,
  version: reconciliation.version ?? 1,
  created_by: reconciliation.created_by,
  created_by_name: reconciliation.created_by_name,
  updated_by: reconciliation.updated_by,
  updated_by_name: reconciliation.updated_by_name,
  created_at: reconciliation.created_at,
  updated_at: reconciliation.updated_at,
  deleted_at: undefined,
});

const mapAccountingPeriodToRemoteDto = (
  period: AccountingPeriod,
): RemoteAccountingPeriodDto => ({
  id: period.id,
  name: period.name,
  period_type: period.period_type,
  start_date: period.start_date,
  end_date: period.end_date,
  status: period.status,
  locked_at: period.locked_at,
  locked_by: period.locked_by,
  locked_by_name: period.locked_by_name,
  closed_at: period.closed_at,
  closed_by: period.closed_by,
  closed_by_name: period.closed_by_name,
  closing_journal_entry_id: period.closing_journal_entry_id,
  reopened_at: period.reopened_at,
  reopened_by: period.reopened_by,
  reopened_by_name: period.reopened_by_name,
  reopen_reason: period.reopen_reason,
  notes: period.notes,
  version: period.version ?? 1,
  created_by: period.created_by,
  created_by_name: period.created_by_name,
  updated_by: period.updated_by,
  updated_by_name: period.updated_by_name,
  created_at: period.created_at,
  updated_at: period.updated_at,
  deleted_at: period.deleted_at,
});

const mapClosingRunToRemoteDto = (
  run: ClosingRun,
): RemoteClosingRunDto => ({
  id: run.id,
  period_id: run.period_id,
  period_name: run.period_name,
  start_date: run.start_date,
  end_date: run.end_date,
  status: run.status,
  retained_earning_account_id: run.retained_earning_account_id,
  retained_earning_account_code: run.retained_earning_account_code,
  retained_earning_account_name: run.retained_earning_account_name,
  net_income_amount: normalizeRemoteNumber(run.net_income_amount),
  total_revenue_amount: normalizeRemoteNumber(run.total_revenue_amount),
  total_contra_revenue_amount: normalizeRemoteNumber(run.total_contra_revenue_amount),
  total_expense_amount: normalizeRemoteNumber(run.total_expense_amount),
  closing_journal_entry_id: run.closing_journal_entry_id,
  posted_at: run.posted_at,
  reversed_at: run.reversed_at,
  reversed_by: run.reversed_by,
  reversed_by_name: run.reversed_by_name,
  reversal_journal_entry_id: run.reversal_journal_entry_id,
  reversal_reason: run.reversal_reason,
  notes: run.notes,
  version: run.version ?? 1,
  created_by: run.created_by,
  created_by_name: run.created_by_name,
  updated_by: run.updated_by,
  updated_by_name: run.updated_by_name,
  created_at: run.created_at,
  updated_at: run.updated_at,
  deleted_at: run.deleted_at,
});

const mapJournalEntryToRemoteDto = (entry: JournalEntry): RemoteJournalEntryDto => ({
  id: entry.id,
  entry_number: entry.entry_number,
  entry_date: entry.entry_date,
  status: entry.status,
  source_type: entry.source_type,
  source_id: entry.source_id,
  source_number: entry.source_number,
  source_event: entry.source_event,
  description: entry.description,
  total_debit: normalizeRemoteNumber(entry.total_debit),
  total_credit: normalizeRemoteNumber(entry.total_credit),
  posted_at: entry.posted_at,
  voided_at: entry.voided_at,
  reversed_entry_id: entry.reversed_entry_id,
  version: entry.version ?? 1,
  created_by: entry.created_by,
  created_by_name: entry.created_by_name,
  updated_by: entry.updated_by,
  updated_by_name: entry.updated_by_name,
  created_at: entry.created_at,
  updated_at: entry.updated_at,
  deleted_at: entry.deleted_at,
});

const mapJournalEntryLineToRemoteDto = (line: JournalEntryLine): RemoteJournalEntryLineDto => ({
  id: line.id,
  journal_entry_id: line.journal_entry_id,
  account_id: line.account_id,
  account_code: line.account_code,
  account_name: line.account_name,
  account_type: line.account_type,
  debit: normalizeRemoteNumber(line.debit),
  credit: normalizeRemoteNumber(line.credit),
  description: line.description,
  department_id: line.department_id,
  project_id: line.project_id,
  created_at: line.created_at,
});

const mapJournalEntryBundleToRemoteDto = (
  entry: JournalEntry,
  lines: JournalEntryLine[],
): RemoteJournalEntryBundleDto => ({
  entry: mapJournalEntryToRemoteDto(entry),
  lines: lines.map(mapJournalEntryLineToRemoteDto),
});

const mapOpeningBalanceBatchToRemoteDto = (
  batch: OpeningBalanceBatch,
): RemoteOpeningBalanceBatchDto => ({
  id: batch.id,
  module: batch.module,
  cutoff_date: batch.cutoff_date,
  status: batch.status,
  total_debit: normalizeRemoteNumber(batch.total_debit),
  total_credit: normalizeRemoteNumber(batch.total_credit),
  journal_entry_id: batch.journal_entry_id ?? null,
  posted_at: batch.posted_at ?? null,
  skipped_at: batch.skipped_at ?? null,
  notes: batch.notes ?? null,
  version: batch.version ?? 1,
  created_by: batch.created_by ?? null,
  created_by_name: batch.created_by_name ?? null,
  updated_by: batch.updated_by ?? null,
  updated_by_name: batch.updated_by_name ?? null,
  created_at: batch.created_at,
  updated_at: batch.updated_at,
  deleted_at: batch.deleted_at ?? null,
});

const mapOpeningBalanceLineToRemoteDto = (
  line: OpeningBalanceLine,
): RemoteOpeningBalanceLineDto => ({
  id: line.id,
  batch_id: line.batch_id,
  module: line.module,
  line_number: Math.trunc(normalizeRemoteNumber(line.line_number)),
  contact_id: line.contact_id ?? null,
  party_name: line.party_name ?? null,
  document_number: line.document_number ?? null,
  document_date: line.document_date ?? null,
  due_date: line.due_date ?? null,
  currency_code: line.currency_code ?? null,
  currency_name: line.currency_name ?? null,
  currency_symbol: line.currency_symbol ?? null,
  base_currency_code: line.base_currency_code ?? null,
  fx_rate: line.fx_rate ?? null,
  amount: line.amount ?? null,
  base_amount: normalizeRemoteNumber(line.base_amount),
  paid_amount: line.paid_amount ?? null,
  remaining_amount: line.remaining_amount ?? null,
  settlement_status: line.settlement_status ?? null,
  last_paid_at: line.last_paid_at ?? null,
  account_id: line.account_id ?? null,
  account_code: line.account_code ?? null,
  account_name: line.account_name ?? null,
  counter_account_id: line.counter_account_id ?? null,
  counter_account_code: line.counter_account_code ?? null,
  counter_account_name: line.counter_account_name ?? null,
  debit: normalizeRemoteNumber(line.debit),
  credit: normalizeRemoteNumber(line.credit),
  notes: line.notes ?? null,
  created_at: line.created_at,
  updated_at: line.updated_at,
});

const mapOpeningBalanceBundleToRemoteDto = (
  batch: OpeningBalanceBatch,
  lines: OpeningBalanceLine[],
): RemoteOpeningBalanceBundleDto => ({
  batch: mapOpeningBalanceBatchToRemoteDto(batch),
  lines: lines.map(mapOpeningBalanceLineToRemoteDto),
});

const mapSalesDocumentToRemoteDto = (document: SalesDocument): RemoteSalesDocumentDto => ({
  id: document.id,
  document_number: document.document_number,
  type: document.type,
  status: document.status,
  contact_id: document.contact_id,
  customer_name: document.customer_name,
  customer_phone: document.customer_phone,
  customer_email: document.customer_email,
  customer_address: document.customer_address,
  customer_company_name: document.customer_company_name,
  customer_tax_number: document.customer_tax_number,
  department_id: document.department_id,
  department_code: document.department_code,
  department_name: document.department_name,
  project_id: document.project_id,
  project_code: document.project_code,
  project_name: document.project_name,
  document_date: document.document_date,
  expired_at: document.expired_at,
  due_date: document.due_date,
  warehouse_id: document.warehouse_id,
  warehouse_code: document.warehouse_code,
  warehouse_name: document.warehouse_name,
  source_document_id: document.source_document_id,
  source_document_number: document.source_document_number,
  source_document_type: document.source_document_type,
  currency_code: document.currency_code,
  currency_name: document.currency_name,
  currency_symbol: document.currency_symbol,
  base_currency_code: document.base_currency_code,
  exchange_rate: document.exchange_rate,
  exchange_rate_source: document.exchange_rate_source,
  exchange_rate_basis: document.exchange_rate_basis,
  exchange_rate_date: document.exchange_rate_date,
  subtotal_amount: document.subtotal_amount,
  foreign_subtotal_amount: document.foreign_subtotal_amount,
  discount_type: document.discount_type,
  discount_value: document.discount_value,
  discount_amount: document.discount_amount,
  foreign_discount_amount: document.foreign_discount_amount,
  discount_account_id: document.discount_account_id,
  discount_account_code: document.discount_account_code,
  discount_account_name: document.discount_account_name,
  tax_id: document.tax_id,
  tax_name: document.tax_name,
  tax_code: document.tax_code,
  tax_rate: document.tax_rate,
  tax_calculation_mode: document.tax_calculation_mode,
  tax_flow: document.tax_flow,
  tax_account_id: document.tax_account_id,
  tax_account_code: document.tax_account_code,
  tax_account_name: document.tax_account_name,
  tax_account_type: document.tax_account_type,
  tax_amount: document.tax_amount,
  foreign_tax_amount: document.foreign_tax_amount,
  total_amount: document.total_amount,
  foreign_total_amount: document.foreign_total_amount,
  payment_status: document.payment_status,
  paid_amount: document.paid_amount,
  paid_at: document.paid_at,
  payment_method: document.payment_method,
  cash_account_id: document.cash_account_id,
  cash_account_code: document.cash_account_code,
  cash_account_name: document.cash_account_name,
  finance_transaction_id: document.finance_transaction_id,
  notes: document.notes,
  issued_at: document.issued_at,
  voided_at: document.voided_at,
  void_reason: document.void_reason,
  version: document.version ?? 1,
  created_by: document.created_by,
  created_by_name: document.created_by_name,
  updated_by: document.updated_by,
  updated_by_name: document.updated_by_name,
  created_at: document.created_at,
  updated_at: document.updated_at,
});

const mapSalesDocumentItemToRemoteDto = (item: SalesDocumentItem): RemoteSalesDocumentItemDto => ({
  id: item.id,
  document_id: item.document_id,
  product_id: item.product_id,
  product_name: item.product_name,
  sku: item.sku,
  unit: item.unit,
  quantity: item.quantity,
  ordered_quantity: item.ordered_quantity,
  delivered_quantity: item.delivered_quantity,
  price: item.price,
  currency_code: item.currency_code,
  exchange_rate: item.exchange_rate,
  exchange_rate_source: item.exchange_rate_source,
  exchange_rate_basis: item.exchange_rate_basis,
  exchange_rate_date: item.exchange_rate_date,
  foreign_price: item.foreign_price,
  discount_type: item.discount_type,
  discount_value: item.discount_value,
  discount_amount: item.discount_amount,
  foreign_discount_amount: item.foreign_discount_amount,
  tax_id: item.tax_id,
  tax_name: item.tax_name,
  tax_code: item.tax_code,
  tax_rate: item.tax_rate,
  tax_calculation_mode: item.tax_calculation_mode,
  tax_flow: item.tax_flow,
  tax_account_id: item.tax_account_id,
  tax_account_code: item.tax_account_code,
  tax_account_name: item.tax_account_name,
  tax_account_type: item.tax_account_type,
  tax_base_amount: item.tax_base_amount,
  foreign_tax_base_amount: item.foreign_tax_base_amount,
  tax_amount: item.tax_amount,
  foreign_tax_amount: item.foreign_tax_amount,
  subtotal: item.subtotal,
  foreign_subtotal: item.foreign_subtotal,
  total_amount: item.total_amount,
  foreign_total_amount: item.foreign_total_amount,
  purchase_price: item.purchase_price,
  original_price: item.original_price,
  is_price_edited: item.is_price_edited,
  price_edited_by: item.price_edited_by,
  price_edited_at: item.price_edited_at,
  created_at: item.created_at,
});

const mapSalesDocumentBundleToRemoteDto = (
  document: SalesDocument,
  items: SalesDocumentItem[],
): RemoteSalesDocumentBundleDto => ({
  document: mapSalesDocumentToRemoteDto(document),
  items: items.map(mapSalesDocumentItemToRemoteDto),
});

const mapPurchaseDocumentToRemoteDto = (document: PurchaseDocument): RemotePurchaseDocumentDto => ({
  id: document.id,
  document_number: document.document_number,
  type: document.type,
  status: document.status,
  contact_id: document.contact_id,
  supplier_name: document.supplier_name ?? '',
  supplier_phone: document.supplier_phone,
  supplier_email: document.supplier_email,
  supplier_address: document.supplier_address,
  supplier_company_name: document.supplier_company_name,
  supplier_tax_number: document.supplier_tax_number,
  department_id: document.department_id,
  department_code: document.department_code,
  department_name: document.department_name,
  project_id: document.project_id,
  project_code: document.project_code,
  project_name: document.project_name,
  document_date: document.document_date,
  required_date: document.required_date,
  quotation_due_date: document.quotation_due_date,
  due_date: document.due_date,
  warehouse_id: document.warehouse_id,
  warehouse_code: document.warehouse_code,
  warehouse_name: document.warehouse_name,
  source_document_id: document.source_document_id,
  source_document_number: document.source_document_number,
  source_document_type: document.source_document_type,
  currency_code: document.currency_code,
  currency_name: document.currency_name,
  currency_symbol: document.currency_symbol,
  base_currency_code: document.base_currency_code,
  exchange_rate: document.exchange_rate,
  exchange_rate_source: document.exchange_rate_source,
  exchange_rate_basis: document.exchange_rate_basis,
  exchange_rate_date: document.exchange_rate_date,
  subtotal_amount: document.subtotal_amount,
  foreign_subtotal_amount: document.foreign_subtotal_amount,
  discount_type: document.discount_type,
  discount_value: document.discount_value,
  discount_amount: document.discount_amount,
  foreign_discount_amount: document.foreign_discount_amount,
  discount_account_id: document.discount_account_id,
  discount_account_code: document.discount_account_code,
  discount_account_name: document.discount_account_name,
  tax_id: document.tax_id,
  tax_name: document.tax_name,
  tax_code: document.tax_code,
  tax_rate: document.tax_rate,
  tax_calculation_mode: document.tax_calculation_mode,
  tax_flow: document.tax_flow,
  tax_account_id: document.tax_account_id,
  tax_account_code: document.tax_account_code,
  tax_account_name: document.tax_account_name,
  tax_account_type: document.tax_account_type,
  tax_amount: document.tax_amount,
  foreign_tax_amount: document.foreign_tax_amount,
  total_amount: document.total_amount,
  foreign_total_amount: document.foreign_total_amount,
  payment_status: document.payment_status,
  paid_amount: document.paid_amount,
  paid_at: document.paid_at,
  payment_method: document.payment_method,
  cash_account_id: document.cash_account_id,
  cash_account_code: document.cash_account_code,
  cash_account_name: document.cash_account_name,
  finance_transaction_id: document.finance_transaction_id,
  notes: document.notes,
  cost_status: document.cost_status,
  delivery_note_number: document.delivery_note_number,
  delivery_note_date: document.delivery_note_date,
  supplier_invoice_number: document.supplier_invoice_number,
  supplier_invoice_date: document.supplier_invoice_date,
  additional_cost_treatment: document.additional_cost_treatment,
  additional_cost_amount: document.additional_cost_amount,
  supplier_discount_amount: document.supplier_discount_amount,
  supplier_tax_amount: document.supplier_tax_amount,
  cost_finalized_at: document.cost_finalized_at,
  cost_finalized_by: document.cost_finalized_by,
  cost_finalized_by_name: document.cost_finalized_by_name,
  issued_at: document.issued_at,
  voided_at: document.voided_at,
  void_reason: document.void_reason,
  version: document.version ?? 1,
  created_by: document.created_by,
  created_by_name: document.created_by_name,
  updated_by: document.updated_by,
  updated_by_name: document.updated_by_name,
  created_at: document.created_at,
  updated_at: document.updated_at,
});

const mapPurchaseDocumentItemToRemoteDto = (item: PurchaseDocumentItem): RemotePurchaseDocumentItemDto => ({
  id: item.id,
  document_id: item.document_id,
  product_id: item.product_id,
  product_name: item.product_name,
  sku: item.sku,
  unit: item.unit,
  quantity: item.quantity,
  ordered_quantity: item.ordered_quantity,
  received_quantity: item.received_quantity,
  price: item.price,
  currency_code: item.currency_code,
  exchange_rate: item.exchange_rate,
  exchange_rate_source: item.exchange_rate_source,
  exchange_rate_basis: item.exchange_rate_basis,
  exchange_rate_date: item.exchange_rate_date,
  foreign_price: item.foreign_price,
  discount_type: item.discount_type,
  discount_value: item.discount_value,
  discount_amount: item.discount_amount,
  foreign_discount_amount: item.foreign_discount_amount,
  tax_id: item.tax_id,
  tax_name: item.tax_name,
  tax_code: item.tax_code,
  tax_rate: item.tax_rate,
  tax_calculation_mode: item.tax_calculation_mode,
  tax_flow: item.tax_flow,
  tax_account_id: item.tax_account_id,
  tax_account_code: item.tax_account_code,
  tax_account_name: item.tax_account_name,
  tax_account_type: item.tax_account_type,
  tax_base_amount: item.tax_base_amount,
  foreign_tax_base_amount: item.foreign_tax_base_amount,
  tax_amount: item.tax_amount,
  foreign_tax_amount: item.foreign_tax_amount,
  subtotal: item.subtotal,
  foreign_subtotal: item.foreign_subtotal,
  total_amount: item.total_amount,
  foreign_total_amount: item.foreign_total_amount,
  cost_status: item.cost_status,
  estimate_source: item.estimate_source,
  estimated_price: item.estimated_price,
  final_price: item.final_price,
  invoiced_quantity: item.invoiced_quantity,
  quantity_variance: item.quantity_variance,
  additional_cost_allocation: item.additional_cost_allocation,
  supplier_discount_allocation: item.supplier_discount_allocation,
  supplier_tax_allocation: item.supplier_tax_allocation,
  final_landed_cost_per_unit: item.final_landed_cost_per_unit,
  cost_finalized_at: item.cost_finalized_at,
  cost_variance_amount: item.cost_variance_amount,
  created_at: item.created_at,
});

const mapPurchaseDocumentBundleToRemoteDto = (
  document: PurchaseDocument,
  items: PurchaseDocumentItem[],
): RemotePurchaseDocumentBundleDto => ({
  document: mapPurchaseDocumentToRemoteDto(document),
  items: items.map(mapPurchaseDocumentItemToRemoteDto),
});

const mapTaxToRemoteDto = (tax: Tax): RemoteTaxDto => ({
  id: tax.id,
  code: tax.code,
  name: tax.name,
  rate: tax.rate,
  rate_type: tax.rate_type,
  calculation_mode: tax.calculation_mode,
  tax_flow: tax.tax_flow ?? 'ADDITIVE',
  sales_tax_account_id: tax.sales_tax_account_id,
  sales_tax_account_code: tax.sales_tax_account_code,
  sales_tax_account_name: tax.sales_tax_account_name,
  sales_tax_account_type: tax.sales_tax_account_type,
  purchase_tax_account_id: tax.purchase_tax_account_id,
  purchase_tax_account_code: tax.purchase_tax_account_code,
  purchase_tax_account_name: tax.purchase_tax_account_name,
  purchase_tax_account_type: tax.purchase_tax_account_type,
  description: tax.description,
  effective_from: tax.effective_from,
  effective_to: tax.effective_to,
  is_default: tax.is_default,
  is_active: tax.is_active,
  created_at: tax.created_at,
  updated_at: tax.updated_at,
});

const mapWarehouseToRemoteDto = (warehouse: Warehouse): RemoteWarehouseDto => ({
  id: warehouse.id,
  code: warehouse.code,
  name: warehouse.name,
  address: warehouse.address,
  phone: warehouse.phone,
  notes: warehouse.notes,
  is_active: warehouse.is_active,
  created_at: warehouse.created_at,
  updated_at: warehouse.updated_at,
});

const mapCurrencyToRemoteDto = (currency: Currency): RemoteCurrencyDto => ({
  id: currency.id,
  code: currency.code,
  name: currency.name,
  symbol: currency.symbol,
  decimal_places: currency.decimal_places,
  is_base: currency.is_base,
  is_active: currency.is_active,
  created_at: currency.created_at,
  updated_at: currency.updated_at,
});

const mapCurrencyRateToRemoteDto = (rate: CurrencyRate): RemoteCurrencyRateDto => ({
  id: rate.id,
  currency_code: rate.currency_code,
  base_currency_code: rate.base_currency_code,
  rate_date: rate.rate_date,
  source: rate.source,
  unit_amount: normalizeRemoteNumber(rate.unit_amount),
  bi_buy_rate: rate.bi_buy_rate,
  bi_sell_rate: rate.bi_sell_rate,
  middle_rate: normalizeRemoteNumber(rate.middle_rate),
  fetched_at: rate.fetched_at,
  created_at: rate.created_at,
  updated_at: rate.updated_at,
});

const isRemoteContactDto = (payload: unknown): payload is RemoteContactDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteContactDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.contact_type === 'string' &&
    typeof candidate.is_active === 'boolean' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteCooperativeMemberDto = (payload: unknown): payload is RemoteCooperativeMemberDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteCooperativeMemberDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.member_number === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.join_date === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteCooperativeAreaDto = (payload: unknown): payload is RemoteCooperativeAreaDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteCooperativeAreaDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.is_active === 'boolean' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteCooperativeSavingTransactionDto = (
  payload: unknown,
): payload is RemoteCooperativeSavingTransactionDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteCooperativeSavingTransactionDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.member_id === 'string' &&
    typeof candidate.member_number === 'string' &&
    typeof candidate.member_name === 'string' &&
    typeof candidate.saving_type === 'string' &&
    typeof candidate.transaction_type === 'string' &&
    typeof candidate.amount === 'number' &&
    typeof candidate.transaction_date === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteCooperativeMemberSavingBalanceDto = (
  payload: unknown,
): payload is RemoteCooperativeMemberSavingBalanceDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteCooperativeMemberSavingBalanceDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.member_id === 'string' &&
    typeof candidate.member_number === 'string' &&
    typeof candidate.member_name === 'string' &&
    typeof candidate.saving_type === 'string' &&
    typeof candidate.balance === 'number' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteCooperativeLoanDto = (payload: unknown): payload is RemoteCooperativeLoanDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteCooperativeLoanDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.loan_number === 'string' &&
    typeof candidate.member_id === 'string' &&
    typeof candidate.member_number === 'string' &&
    typeof candidate.member_name === 'string' &&
    typeof candidate.principal_amount === 'number' &&
    typeof candidate.interest_rate_per_month === 'number' &&
    typeof candidate.tenor_months === 'number' &&
    typeof candidate.total_interest_amount === 'number' &&
    typeof candidate.total_payable_amount === 'number' &&
    typeof candidate.outstanding_principal_amount === 'number' &&
    typeof candidate.outstanding_interest_amount === 'number' &&
    typeof candidate.outstanding_penalty_amount === 'number' &&
    typeof candidate.status === 'string' &&
    typeof candidate.application_date === 'string' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteCooperativeLoanInstallmentDto = (
  payload: unknown,
): payload is RemoteCooperativeLoanInstallmentDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteCooperativeLoanInstallmentDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.loan_id === 'string' &&
    typeof candidate.loan_number === 'string' &&
    typeof candidate.member_id === 'string' &&
    typeof candidate.member_number === 'string' &&
    typeof candidate.member_name === 'string' &&
    typeof candidate.installment_number === 'number' &&
    typeof candidate.due_date === 'string' &&
    typeof candidate.principal_amount === 'number' &&
    typeof candidate.interest_amount === 'number' &&
    typeof candidate.penalty_amount === 'number' &&
    typeof candidate.paid_principal_amount === 'number' &&
    typeof candidate.paid_interest_amount === 'number' &&
    typeof candidate.paid_penalty_amount === 'number' &&
    typeof candidate.status === 'string' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteCooperativeLoanCollectionEventDto = (
  payload: unknown,
): payload is RemoteCooperativeLoanCollectionEventDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteCooperativeLoanCollectionEventDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.installment_id === 'string' &&
    typeof candidate.loan_id === 'string' &&
    typeof candidate.loan_number === 'string' &&
    typeof candidate.member_id === 'string' &&
    typeof candidate.member_number === 'string' &&
    typeof candidate.member_name === 'string' &&
    typeof candidate.collection_status === 'string' &&
    typeof candidate.collection_notes === 'string' &&
    typeof candidate.contacted_at === 'string' &&
    typeof candidate.created_at === 'string'
  );
};

const isRemoteCooperativeLoanPaymentDto = (
  payload: unknown,
): payload is RemoteCooperativeLoanPaymentDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteCooperativeLoanPaymentDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.payment_number === 'string' &&
    typeof candidate.loan_id === 'string' &&
    typeof candidate.loan_number === 'string' &&
    typeof candidate.member_id === 'string' &&
    typeof candidate.member_number === 'string' &&
    typeof candidate.member_name === 'string' &&
    typeof candidate.amount === 'number' &&
    typeof candidate.principal_amount === 'number' &&
    typeof candidate.interest_amount === 'number' &&
    typeof candidate.penalty_amount === 'number' &&
    typeof candidate.payment_date === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteActivityLogDto = (payload: unknown): payload is RemoteActivityLogDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteActivityLogDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.action === 'string' &&
    typeof candidate.entity === 'string' &&
    typeof candidate.description === 'string' &&
    typeof candidate.created_at === 'string'
  );
};

const isRemoteAuthUserDto = (payload: unknown): payload is RemoteAuthUserDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteAuthUserDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.role === 'string' &&
    typeof candidate.pin_hash === 'string' &&
    typeof candidate.pin_salt === 'string' &&
    typeof candidate.is_active === 'boolean' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteCashierSessionDto = (payload: unknown): payload is RemoteCashierSessionDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteCashierSessionDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.session_number === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.opened_at === 'string' &&
    typeof candidate.opening_cash_amount === 'number' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteRoleDto = (payload: unknown): payload is RemoteRoleDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteRoleDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.is_system === 'boolean' &&
    typeof candidate.is_owner === 'boolean' &&
    typeof candidate.is_active === 'boolean' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteRolePermissionDto = (payload: unknown): payload is RemoteRolePermissionDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteRolePermissionDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.role_id === 'string' &&
    typeof candidate.permission_code === 'string' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteChartOfAccountDto = (payload: unknown): payload is RemoteChartOfAccountDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteChartOfAccountDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.code === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.type === 'string' &&
    typeof candidate.normal_balance === 'string' &&
    typeof candidate.is_postable === 'boolean' &&
    typeof candidate.is_active === 'boolean' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteFinanceAccountMappingDto = (
  payload: unknown,
): payload is RemoteFinanceAccountMappingDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteFinanceAccountMappingDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.key === 'string' &&
    typeof candidate.account_id === 'string' &&
    typeof candidate.account_code === 'string' &&
    typeof candidate.account_name === 'string' &&
    typeof candidate.account_type === 'string' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteAccountingProfileSettingDto = (
  payload: unknown,
): payload is RemoteAccountingProfileSettingDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteAccountingProfileSettingDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.accounting_profile === 'string' &&
    typeof candidate.industry_extension === 'string' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteAccountingInitialSetupSettingDto = (
  payload: unknown,
): payload is RemoteAccountingInitialSetupSettingDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteAccountingInitialSetupSettingDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.business_template_code === 'string' &&
    typeof candidate.accounting_profile === 'string' &&
    typeof candidate.industry_extension === 'string' &&
    typeof candidate.template_id === 'string' &&
    typeof candidate.cutoff_date === 'string' &&
    typeof candidate.fiscal_period_start === 'string' &&
    typeof candidate.fiscal_period_end === 'string' &&
    typeof candidate.current_period_start === 'string' &&
    typeof candidate.current_period_end === 'string' &&
    typeof candidate.base_currency_code === 'string' &&
    typeof candidate.inventory_policy === 'string' &&
    typeof candidate.version === 'number' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteEnabledModuleDto = (payload: unknown): payload is RemoteEnabledModuleDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteEnabledModuleDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.code === 'string' &&
    typeof candidate.is_enabled === 'boolean' &&
    typeof candidate.source === 'string' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteGeneralLedgerSettingDto = (
  payload: unknown,
): payload is RemoteGeneralLedgerSettingDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteGeneralLedgerSettingDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.is_ready === 'boolean' &&
    typeof candidate.inventory_policy === 'string' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteDepartmentDto = (payload: unknown): payload is RemoteDepartmentDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteDepartmentDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.is_active === 'boolean' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteEmployeeDto = (payload: unknown): payload is RemoteEmployeeDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteEmployeeDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.is_active === 'boolean' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteEmployeeAreaDto = (payload: unknown): payload is RemoteEmployeeAreaDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteEmployeeAreaDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.employee_id === 'string' &&
    typeof candidate.area_id === 'string' &&
    typeof candidate.area_name === 'string' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteEmployeeCollectionScheduleDto = (
  payload: unknown,
): payload is RemoteEmployeeCollectionScheduleDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteEmployeeCollectionScheduleDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.employee_id === 'string' &&
    typeof candidate.employee_name === 'string' &&
    typeof candidate.area_id === 'string' &&
    typeof candidate.area_name === 'string' &&
    typeof candidate.weekday === 'number' &&
    typeof candidate.is_active === 'boolean' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemotePayrollRunDto = (payload: unknown): payload is RemotePayrollRunDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemotePayrollRunDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.payroll_number === 'string' &&
    typeof candidate.period_start === 'string' &&
    typeof candidate.period_end === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.employee_count === 'number' &&
    typeof candidate.gross_amount === 'number' &&
    typeof candidate.deduction_amount === 'number' &&
    typeof candidate.net_amount === 'number' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemotePayrollRunItemDto = (payload: unknown): payload is RemotePayrollRunItemDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemotePayrollRunItemDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.payroll_run_id === 'string' &&
    typeof candidate.employee_id === 'string' &&
    typeof candidate.employee_name === 'string' &&
    typeof candidate.base_salary === 'number' &&
    typeof candidate.deduction_amount === 'number' &&
    typeof candidate.gross_amount === 'number' &&
    typeof candidate.net_amount === 'number' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteEmployeeCashAdvanceDto = (payload: unknown): payload is RemoteEmployeeCashAdvanceDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteEmployeeCashAdvanceDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.advance_number === 'string' &&
    typeof candidate.employee_id === 'string' &&
    typeof candidate.employee_name === 'string' &&
    typeof candidate.amount === 'number' &&
    typeof candidate.outstanding_amount === 'number' &&
    typeof candidate.status === 'string' &&
    typeof candidate.disbursed_at === 'string' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteEmployeeCashAdvanceRepaymentDto = (
  payload: unknown,
): payload is RemoteEmployeeCashAdvanceRepaymentDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteEmployeeCashAdvanceRepaymentDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.cash_advance_id === 'string' &&
    typeof candidate.cash_advance_number === 'string' &&
    typeof candidate.payroll_run_id === 'string' &&
    typeof candidate.payroll_run_item_id === 'string' &&
    typeof candidate.employee_id === 'string' &&
    typeof candidate.employee_name === 'string' &&
    typeof candidate.amount === 'number' &&
    typeof candidate.status === 'string' &&
    typeof candidate.allocated_at === 'string' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemotePayrollRunBundleDto = (payload: unknown): payload is RemotePayrollRunBundleDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemotePayrollRunBundleDto>;
  return (
    isRemotePayrollRunDto(candidate.run) &&
    Array.isArray(candidate.items) &&
    candidate.items.every(isRemotePayrollRunItemDto) &&
    Array.isArray(candidate.cash_advance_repayments) &&
    candidate.cash_advance_repayments.every(isRemoteEmployeeCashAdvanceRepaymentDto)
  );
};

const isRemoteEmployeeCashAdvanceBundleDto = (
  payload: unknown,
): payload is RemoteEmployeeCashAdvanceBundleDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteEmployeeCashAdvanceBundleDto>;
  return (
    isRemoteEmployeeCashAdvanceDto(candidate.cash_advance) &&
    Array.isArray(candidate.repayments) &&
    candidate.repayments.every(isRemoteEmployeeCashAdvanceRepaymentDto)
  );
};

const isRemoteProjectDto = (payload: unknown): payload is RemoteProjectDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteProjectDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.is_active === 'boolean' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteProductDto = (payload: unknown): payload is RemoteProductDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteProductDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.purchase_unit === 'string' &&
    typeof candidate.selling_unit === 'string' &&
    typeof candidate.purchase_price === 'number' &&
    typeof candidate.selling_price === 'number' &&
    typeof candidate.stock === 'number' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteStockMutationDto = (payload: unknown): payload is RemoteStockMutationDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteStockMutationDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.product_id === 'string' &&
    typeof candidate.product_name === 'string' &&
    typeof candidate.source_type === 'string' &&
    typeof candidate.source_id === 'string' &&
    typeof candidate.source_line_id === 'string' &&
    typeof candidate.quantity_delta === 'number' &&
    typeof candidate.unit === 'string' &&
    typeof candidate.stock_unit === 'string' &&
    typeof candidate.occurred_at === 'string' &&
    typeof candidate.created_at === 'string'
  );
};

const isRemoteStockOpnameDto = (payload: unknown): payload is RemoteStockOpnameDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteStockOpnameDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.opname_number === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.counted_at === 'string' &&
    typeof candidate.total_items === 'number' &&
    typeof candidate.total_adjustment_in === 'number' &&
    typeof candidate.total_adjustment_out === 'number' &&
    typeof candidate.total_variance_value === 'number' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteStockOpnameItemDto = (payload: unknown): payload is RemoteStockOpnameItemDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteStockOpnameItemDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.opname_id === 'string' &&
    typeof candidate.product_id === 'string' &&
    typeof candidate.product_name === 'string' &&
    typeof candidate.system_quantity === 'number' &&
    typeof candidate.quantity_delta === 'number' &&
    typeof candidate.unit === 'string' &&
    typeof candidate.cost_per_unit === 'number' &&
    typeof candidate.variance_value === 'number' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteStockOpnameBundleDto = (
  payload: unknown,
): payload is RemoteStockOpnameBundleDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteStockOpnameBundleDto>;
  return (
    isRemoteStockOpnameDto(candidate.opname) &&
    Array.isArray(candidate.items) &&
    candidate.items.every(isRemoteStockOpnameItemDto)
  );
};

const isRemoteProductionOrderDto = (payload: unknown): payload is RemoteProductionOrderDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteProductionOrderDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.production_number === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.finished_product_id === 'string' &&
    typeof candidate.finished_product_name === 'string' &&
    typeof candidate.quantity_produced === 'number' &&
    typeof candidate.unit === 'string' &&
    typeof candidate.material_cost === 'number' &&
    typeof candidate.additional_cost === 'number' &&
    typeof candidate.total_cost === 'number' &&
    typeof candidate.unit_cost === 'number' &&
    typeof candidate.produced_at === 'string' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteProductionOrderItemDto = (payload: unknown): payload is RemoteProductionOrderItemDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteProductionOrderItemDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.production_order_id === 'string' &&
    typeof candidate.material_product_id === 'string' &&
    typeof candidate.material_product_name === 'string' &&
    typeof candidate.quantity_used === 'number' &&
    typeof candidate.unit === 'string' &&
    typeof candidate.stock_quantity_used === 'number' &&
    typeof candidate.stock_unit === 'string' &&
    typeof candidate.cost_per_unit === 'number' &&
    typeof candidate.total_cost === 'number' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteProductionOrderCostDto = (payload: unknown): payload is RemoteProductionOrderCostDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteProductionOrderCostDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.production_order_id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.amount === 'number' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteProductionOrderBundleDto = (
  payload: unknown,
): payload is RemoteProductionOrderBundleDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteProductionOrderBundleDto>;
  return (
    isRemoteProductionOrderDto(candidate.order) &&
    Array.isArray(candidate.items) &&
    candidate.items.every(isRemoteProductionOrderItemDto) &&
    Array.isArray(candidate.costs) &&
    candidate.costs.every(isRemoteProductionOrderCostDto)
  );
};

const isRemoteFinanceTransactionDto = (payload: unknown): payload is RemoteFinanceTransactionDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteFinanceTransactionDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.type === 'string' &&
    typeof candidate.category === 'string' &&
    typeof candidate.amount === 'number' &&
    typeof candidate.description === 'string' &&
    typeof candidate.version === 'number' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteCashBankReconciliationDto = (payload: unknown): payload is RemoteCashBankReconciliationDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteCashBankReconciliationDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.reconciliation_number === 'string' &&
    typeof candidate.cash_account_id === 'string' &&
    typeof candidate.cash_account_name === 'string' &&
    typeof candidate.statement_date === 'string' &&
    typeof candidate.statement_ending_balance === 'number' &&
    typeof candidate.book_balance_amount === 'number' &&
    typeof candidate.cleared_balance_amount === 'number' &&
    typeof candidate.difference_amount === 'number' &&
    typeof candidate.status === 'string' &&
    Array.isArray(candidate.selected_transaction_ids) &&
    typeof candidate.version === 'number' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteAccountingPeriodDto = (payload: unknown): payload is RemoteAccountingPeriodDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteAccountingPeriodDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.period_type === 'string' &&
    typeof candidate.start_date === 'string' &&
    typeof candidate.end_date === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.version === 'number' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteClosingRunDto = (payload: unknown): payload is RemoteClosingRunDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteClosingRunDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.period_id === 'string' &&
    typeof candidate.period_name === 'string' &&
    typeof candidate.start_date === 'string' &&
    typeof candidate.end_date === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.retained_earning_account_id === 'string' &&
    typeof candidate.net_income_amount === 'number' &&
    typeof candidate.version === 'number' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteJournalEntryDto = (payload: unknown): payload is RemoteJournalEntryDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteJournalEntryDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.entry_number === 'string' &&
    typeof candidate.entry_date === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.source_type === 'string' &&
    typeof candidate.description === 'string' &&
    typeof candidate.total_debit === 'number' &&
    typeof candidate.total_credit === 'number' &&
    typeof candidate.version === 'number' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteJournalEntryLineDto = (payload: unknown): payload is RemoteJournalEntryLineDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteJournalEntryLineDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.journal_entry_id === 'string' &&
    typeof candidate.account_id === 'string' &&
    typeof candidate.account_code === 'string' &&
    typeof candidate.account_name === 'string' &&
    typeof candidate.account_type === 'string' &&
    typeof candidate.debit === 'number' &&
    typeof candidate.credit === 'number' &&
    typeof candidate.created_at === 'string'
  );
};

const isRemoteJournalEntryBundleDto = (
  payload: unknown,
): payload is RemoteJournalEntryBundleDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteJournalEntryBundleDto>;
  return (
    isRemoteJournalEntryDto(candidate.entry) &&
    Array.isArray(candidate.lines) &&
    candidate.lines.every(isRemoteJournalEntryLineDto)
  );
};

const isRemoteOpeningBalanceBatchDto = (payload: unknown): payload is RemoteOpeningBalanceBatchDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteOpeningBalanceBatchDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.module === 'string' &&
    typeof candidate.cutoff_date === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.total_debit === 'number' &&
    typeof candidate.total_credit === 'number' &&
    typeof candidate.version === 'number' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteOpeningBalanceLineDto = (payload: unknown): payload is RemoteOpeningBalanceLineDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteOpeningBalanceLineDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.batch_id === 'string' &&
    typeof candidate.module === 'string' &&
    typeof candidate.line_number === 'number' &&
    typeof candidate.base_amount === 'number' &&
    typeof candidate.debit === 'number' &&
    typeof candidate.credit === 'number' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteOpeningBalanceBundleDto = (
  payload: unknown,
): payload is RemoteOpeningBalanceBundleDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteOpeningBalanceBundleDto>;
  return (
    isRemoteOpeningBalanceBatchDto(candidate.batch) &&
    Array.isArray(candidate.lines) &&
    candidate.lines.every(isRemoteOpeningBalanceLineDto)
  );
};

const isRemoteSalesDocumentDto = (payload: unknown): payload is RemoteSalesDocumentDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteSalesDocumentDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.document_number === 'string' &&
    typeof candidate.type === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.customer_name === 'string' &&
    typeof candidate.document_date === 'string' &&
    typeof candidate.version === 'number' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteSalesDocumentItemDto = (payload: unknown): payload is RemoteSalesDocumentItemDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteSalesDocumentItemDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.document_id === 'string' &&
    typeof candidate.product_id === 'string' &&
    typeof candidate.product_name === 'string' &&
    typeof candidate.unit === 'string' &&
    typeof candidate.quantity === 'number' &&
    typeof candidate.created_at === 'string'
  );
};

const isRemoteSalesDocumentBundleDto = (
  payload: unknown,
): payload is RemoteSalesDocumentBundleDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteSalesDocumentBundleDto>;
  return (
    isRemoteSalesDocumentDto(candidate.document) &&
    Array.isArray(candidate.items) &&
    candidate.items.every(isRemoteSalesDocumentItemDto)
  );
};

const isRemotePurchaseDocumentDto = (payload: unknown): payload is RemotePurchaseDocumentDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemotePurchaseDocumentDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.document_number === 'string' &&
    typeof candidate.type === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.supplier_name === 'string' &&
    typeof candidate.document_date === 'string' &&
    typeof candidate.version === 'number' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemotePurchaseDocumentItemDto = (payload: unknown): payload is RemotePurchaseDocumentItemDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemotePurchaseDocumentItemDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.document_id === 'string' &&
    typeof candidate.product_id === 'string' &&
    typeof candidate.product_name === 'string' &&
    typeof candidate.unit === 'string' &&
    typeof candidate.quantity === 'number' &&
    typeof candidate.created_at === 'string'
  );
};

const isRemotePurchaseDocumentBundleDto = (
  payload: unknown,
): payload is RemotePurchaseDocumentBundleDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemotePurchaseDocumentBundleDto>;
  return (
    isRemotePurchaseDocumentDto(candidate.document) &&
    Array.isArray(candidate.items) &&
    candidate.items.every(isRemotePurchaseDocumentItemDto)
  );
};

const isRemoteTaxDto = (payload: unknown): payload is RemoteTaxDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteTaxDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.rate === 'number' &&
    typeof candidate.rate_type === 'string' &&
    typeof candidate.calculation_mode === 'string' &&
    typeof candidate.is_default === 'boolean' &&
    typeof candidate.is_active === 'boolean' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteWarehouseDto = (payload: unknown): payload is RemoteWarehouseDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteWarehouseDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.is_active === 'boolean' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteCurrencyDto = (payload: unknown): payload is RemoteCurrencyDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteCurrencyDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.code === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.decimal_places === 'number' &&
    typeof candidate.is_base === 'boolean' &&
    typeof candidate.is_active === 'boolean' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const isRemoteCurrencyRateDto = (payload: unknown): payload is RemoteCurrencyRateDto => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<RemoteCurrencyRateDto>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.currency_code === 'string' &&
    typeof candidate.base_currency_code === 'string' &&
    typeof candidate.rate_date === 'string' &&
    typeof candidate.source === 'string' &&
    typeof candidate.unit_amount === 'number' &&
    typeof candidate.middle_rate === 'number' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
};

const updateContactSyncMetadata = async (
  contactId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<Contact, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentContact = await db.contacts.get(contactId);
  if (!currentContact || currentContact.updated_at !== sourceUpdatedAt) return;

  await db.contacts.update(contactId, syncMetadata);
};

const updateCooperativeMemberSyncMetadata = async (
  memberId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<CooperativeMember, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentMember = await db.cooperativeMembers.get(memberId);
  if (!currentMember || currentMember.updated_at !== sourceUpdatedAt) return;

  await db.cooperativeMembers.update(memberId, syncMetadata);
};

const updateCooperativeSavingTransactionSyncMetadata = async (
  transactionId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<CooperativeSavingTransaction, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentTransaction = await db.cooperativeSavingTransactions.get(transactionId);
  if (!currentTransaction || currentTransaction.updated_at !== sourceUpdatedAt) return;

  await db.cooperativeSavingTransactions.update(transactionId, syncMetadata);
};

const updateCooperativeMemberSavingBalanceSyncMetadata = async (
  balanceId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<CooperativeMemberSavingBalance, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentBalance = await db.cooperativeMemberSavingBalances.get(balanceId);
  if (!currentBalance || currentBalance.updated_at !== sourceUpdatedAt) return;

  await db.cooperativeMemberSavingBalances.update(balanceId, syncMetadata);
};

const updateCooperativeLoanSyncMetadata = async (
  loanId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<CooperativeLoan, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentLoan = await db.cooperativeLoans.get(loanId);
  if (!currentLoan || currentLoan.updated_at !== sourceUpdatedAt) return;

  await db.cooperativeLoans.update(loanId, syncMetadata);
};

const updateCooperativeLoanInstallmentSyncMetadata = async (
  installmentId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<CooperativeLoanInstallment, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentInstallment = await db.cooperativeLoanInstallments.get(installmentId);
  if (!currentInstallment || currentInstallment.updated_at !== sourceUpdatedAt) return;

  await db.cooperativeLoanInstallments.update(installmentId, syncMetadata);
};

const updateCooperativeLoanCollectionEventSyncMetadata = async (
  eventId: string,
  sourceCreatedAt: string,
  syncMetadata: Partial<Pick<CooperativeLoanCollectionEvent, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentEvent = await db.cooperativeLoanCollectionEvents.get(eventId);
  if (!currentEvent || currentEvent.created_at !== sourceCreatedAt) return;

  await db.cooperativeLoanCollectionEvents.update(eventId, syncMetadata);
};

const updateCooperativeLoanPaymentSyncMetadata = async (
  paymentId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<CooperativeLoanPayment, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentPayment = await db.cooperativeLoanPayments.get(paymentId);
  if (!currentPayment || currentPayment.updated_at !== sourceUpdatedAt) return;

  await db.cooperativeLoanPayments.update(paymentId, syncMetadata);
};

const updateAuthUserSyncMetadata = async (
  userId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<AuthUser, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentUser = await db.authUsers.get(userId);
  if (!currentUser || currentUser.updated_at !== sourceUpdatedAt) return;

  await db.authUsers.update(userId, syncMetadata);
};

const updateCashierSessionSyncMetadata = async (
  sessionId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<CashierSession, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentSession = await db.cashierSessions.get(sessionId);
  if (!currentSession || currentSession.updated_at !== sourceUpdatedAt) return;

  await db.cashierSessions.update(sessionId, syncMetadata);
};

const updateRoleSyncMetadata = async (
  roleId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<Role, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentRole = await db.roles.get(roleId);
  if (!currentRole || currentRole.updated_at !== sourceUpdatedAt) return;

  await db.roles.update(roleId, syncMetadata);
};

const updateRolePermissionSyncMetadata = async (
  permissionId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<RolePermission, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentPermission = await db.rolePermissions.get(permissionId);
  if (!currentPermission || currentPermission.updated_at !== sourceUpdatedAt) return;

  await db.rolePermissions.update(permissionId, syncMetadata);
};

const updateChartOfAccountSyncMetadata = async (
  accountId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<ChartOfAccount, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentAccount = await db.chartOfAccounts.get(accountId);
  if (!currentAccount || currentAccount.updated_at !== sourceUpdatedAt) return;

  await db.chartOfAccounts.update(accountId, syncMetadata);
};

const updateFinanceAccountMappingSyncMetadata = async (
  mappingId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<FinanceAccountMapping, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const current = await db.financeAccountMappings.get(mappingId);
  if (!current || current.updated_at !== sourceUpdatedAt) return;

  await db.financeAccountMappings.update(mappingId, syncMetadata);
};

const updateAccountingProfileSettingSyncMetadata = async (
  settingId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<AccountingProfileSetting, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const current = await db.accountingProfileSetting.get(settingId as 'default');
  if (!current || current.updated_at !== sourceUpdatedAt) return;

  await db.accountingProfileSetting.update(settingId as 'default', syncMetadata);
};

const updateAccountingInitialSetupSettingSyncMetadata = async (
  settingId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<AccountingInitialSetupSetting, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const current = await db.accountingInitialSetupSetting.get(settingId as 'default');
  if (!current || current.updated_at !== sourceUpdatedAt) return;

  await db.accountingInitialSetupSetting.update(settingId as 'default', syncMetadata);
};

const updateEnabledModuleSyncMetadata = async (
  moduleId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<EnabledModule, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const current = await db.enabledModules.get(moduleId);
  if (!current || current.updated_at !== sourceUpdatedAt) return;

  await db.enabledModules.update(moduleId, syncMetadata);
};

const updateGeneralLedgerSettingSyncMetadata = async (
  settingId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<GeneralLedgerSetting, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const current = await db.generalLedgerSetting.get(settingId as 'default');
  if (!current || current.updated_at !== sourceUpdatedAt) return;

  await db.generalLedgerSetting.update(settingId as 'default', syncMetadata);
};

const updateDepartmentSyncMetadata = async (
  departmentId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<Department, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentDepartment = await db.departments.get(departmentId);
  if (!currentDepartment || currentDepartment.updated_at !== sourceUpdatedAt) return;

  await db.departments.update(departmentId, syncMetadata);
};

const updateEmployeeSyncMetadata = async (
  employeeId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<Employee, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentEmployee = await db.employees.get(employeeId);
  if (!currentEmployee || currentEmployee.updated_at !== sourceUpdatedAt) return;

  await db.employees.update(employeeId, syncMetadata);
};

const updateEmployeeAreaSyncMetadata = async (
  assignmentId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<EmployeeArea, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentAssignment = await db.employeeAreas.get(assignmentId);
  if (!currentAssignment || currentAssignment.updated_at !== sourceUpdatedAt) return;

  await db.employeeAreas.update(assignmentId, syncMetadata);
};

const updateEmployeeCollectionScheduleSyncMetadata = async (
  scheduleId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<EmployeeCollectionSchedule, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentSchedule = await db.employeeCollectionSchedules.get(scheduleId);
  if (!currentSchedule || currentSchedule.updated_at !== sourceUpdatedAt) return;

  await db.employeeCollectionSchedules.update(scheduleId, syncMetadata);
};

const updatePayrollRunSyncMetadata = async (
  payrollRunId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<PayrollRun, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentRun = await db.payrollRuns.get(payrollRunId);
  if (!currentRun || currentRun.updated_at !== sourceUpdatedAt) return;

  await db.payrollRuns.update(payrollRunId, syncMetadata);
};

const updateEmployeeCashAdvanceSyncMetadata = async (
  cashAdvanceId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<EmployeeCashAdvance, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentCashAdvance = await db.employeeCashAdvances.get(cashAdvanceId);
  if (!currentCashAdvance || currentCashAdvance.updated_at !== sourceUpdatedAt) return;

  await db.employeeCashAdvances.update(cashAdvanceId, syncMetadata);
};

const updateFinanceTransactionSyncMetadata = async (
  transactionId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<FinanceTransaction, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentTransaction = await db.financeTransactions.get(transactionId);
  if (!currentTransaction || (currentTransaction.updated_at ?? currentTransaction.created_at) !== sourceUpdatedAt) return;

  await db.financeTransactions.update(transactionId, syncMetadata);
};

const updateCashBankReconciliationSyncMetadata = async (
  reconciliationId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<CashBankReconciliation, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentReconciliation = await db.cashBankReconciliations.get(reconciliationId);
  if (!currentReconciliation || currentReconciliation.updated_at !== sourceUpdatedAt) return;

  await db.cashBankReconciliations.update(reconciliationId, syncMetadata);
};

const updateAccountingPeriodSyncMetadata = async (
  periodId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<AccountingPeriod, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentPeriod = await db.accountingPeriods.get(periodId);
  if (!currentPeriod || currentPeriod.updated_at !== sourceUpdatedAt) return;

  await db.accountingPeriods.update(periodId, syncMetadata);
};

const updateClosingRunSyncMetadata = async (
  runId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<ClosingRun, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentRun = await db.closingRuns.get(runId);
  if (!currentRun || currentRun.updated_at !== sourceUpdatedAt) return;

  await db.closingRuns.update(runId, syncMetadata);
};

const updateJournalEntrySyncMetadata = async (
  entryId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<JournalEntry, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentEntry = await db.journalEntries.get(entryId);
  if (!currentEntry || currentEntry.updated_at !== sourceUpdatedAt) return;

  await db.journalEntries.update(entryId, syncMetadata);
};

const updateOpeningBalanceBundleSyncMetadata = async (
  batchId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<OpeningBalanceBatch, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentBatch = await db.openingBalanceBatches.get(batchId);
  if (!currentBatch || currentBatch.updated_at !== sourceUpdatedAt) return;

  await db.transaction('rw', db.openingBalanceBatches, db.openingBalanceLines, async () => {
    await db.openingBalanceBatches.update(batchId, syncMetadata);
    await db.openingBalanceLines
      .where('batch_id')
      .equals(batchId)
      .modify((line) => {
        line.sync_status = syncMetadata.sync_status;
        line.sync_error = syncMetadata.sync_error;
        line.last_synced_at = syncMetadata.last_synced_at;
        line.remote_updated_at = syncMetadata.remote_updated_at;
      });
  });
};

const updateProjectSyncMetadata = async (
  projectId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<Project, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentProject = await db.projects.get(projectId);
  if (!currentProject || currentProject.updated_at !== sourceUpdatedAt) return;

  await db.projects.update(projectId, syncMetadata);
};

const updateProductSyncMetadata = async (
  productId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<Product, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentProduct = await db.products.get(productId);
  if (!currentProduct || currentProduct.updated_at !== sourceUpdatedAt) return;

  await db.products.update(productId, syncMetadata);
};

const updatePurchaseDocumentSyncMetadata = async (
  documentId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<PurchaseDocument, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentDocument = await db.purchaseDocuments.get(documentId);
  if (!currentDocument || currentDocument.updated_at !== sourceUpdatedAt) return;

  await db.purchaseDocuments.update(documentId, syncMetadata);
};

const updateSalesDocumentSyncMetadata = async (
  documentId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<SalesDocument, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentDocument = await db.salesDocuments.get(documentId);
  if (!currentDocument || currentDocument.updated_at !== sourceUpdatedAt) return;

  await db.salesDocuments.update(documentId, syncMetadata);
};

const updateStockOpnameSyncMetadata = async (
  opnameId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<StockOpname, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentOpname = await db.stockOpnames.get(opnameId);
  if (!currentOpname || currentOpname.updated_at !== sourceUpdatedAt) return;

  await db.stockOpnames.update(opnameId, syncMetadata);
};

const updateProductionOrderSyncMetadata = async (
  productionOrderId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<ProductionOrder, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentOrder = await db.productionOrders.get(productionOrderId);
  if (!currentOrder || currentOrder.updated_at !== sourceUpdatedAt) return;

  await db.productionOrders.update(productionOrderId, syncMetadata);
};

const updateTaxSyncMetadata = async (
  taxId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<Tax, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentTax = await db.taxes.get(taxId);
  if (!currentTax || currentTax.updated_at !== sourceUpdatedAt) return;

  await db.taxes.update(taxId, syncMetadata);
};

const updateWarehouseSyncMetadata = async (
  warehouseId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<Warehouse, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentWarehouse = await db.warehouses.get(warehouseId);
  if (!currentWarehouse || currentWarehouse.updated_at !== sourceUpdatedAt) return;

  await db.warehouses.update(warehouseId, syncMetadata);
};

const updateCurrencySyncMetadata = async (
  currencyId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<Currency, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentCurrency = await db.currencies.get(currencyId);
  if (!currentCurrency || currentCurrency.updated_at !== sourceUpdatedAt) return;

  await db.currencies.update(currencyId, syncMetadata);
};

const updateCurrencyRateSyncMetadata = async (
  rateId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<CurrencyRate, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentRate = await db.currencyRates.get(rateId);
  if (!currentRate || currentRate.updated_at !== sourceUpdatedAt) return;

  await db.currencyRates.update(rateId, syncMetadata);
};

const updateCooperativeAreaSyncMetadata = async (
  areaId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<CooperativeArea, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentArea = await db.cooperativeAreas.get(areaId);
  if (!currentArea || currentArea.updated_at !== sourceUpdatedAt) return;

  await db.cooperativeAreas.update(areaId, syncMetadata);
};

const markQueueItemPending = async (queueItemId: string) => {
  await db.syncQueue.update(queueItemId, {
    status: 'pending',
    updated_at: new Date().toISOString(),
  });
};

const markQueueItemSynced = async (queueItemId: string, syncedAt: string) => {
  await db.syncQueue.update(queueItemId, {
    status: 'synced',
    error_message: undefined,
    updated_at: syncedAt,
  });
};

const markQueueItemFailed = async (queueItem: SyncQueueItem, error: unknown) => {
  const errorMessage = getErrorMessage(error);
  const now = new Date().toISOString();

  await db.syncQueue.update(queueItem.id, {
    status: 'failed',
    error_message: errorMessage,
    updated_at: now,
  });

  if (queueItem.entity === AUTH_USER_ENTITY && isRemoteAuthUserDto(queueItem.payload)) {
    await updateAuthUserSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === CASHIER_SESSION_ENTITY && isRemoteCashierSessionDto(queueItem.payload)) {
    await updateCashierSessionSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === ROLE_ENTITY && isRemoteRoleDto(queueItem.payload)) {
    await updateRoleSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === ROLE_PERMISSION_ENTITY && isRemoteRolePermissionDto(queueItem.payload)) {
    await updateRolePermissionSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === CONTACT_ENTITY && isRemoteContactDto(queueItem.payload)) {
    await updateContactSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === COOPERATIVE_AREA_ENTITY && isRemoteCooperativeAreaDto(queueItem.payload)) {
    await updateCooperativeAreaSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === COOPERATIVE_LOAN_ENTITY && isRemoteCooperativeLoanDto(queueItem.payload)) {
    await updateCooperativeLoanSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (
    queueItem.entity === COOPERATIVE_LOAN_INSTALLMENT_ENTITY &&
    isRemoteCooperativeLoanInstallmentDto(queueItem.payload)
  ) {
    await updateCooperativeLoanInstallmentSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (
    queueItem.entity === COOPERATIVE_LOAN_COLLECTION_EVENT_ENTITY &&
    isRemoteCooperativeLoanCollectionEventDto(queueItem.payload)
  ) {
    await updateCooperativeLoanCollectionEventSyncMetadata(queueItem.entity_id, queueItem.payload.created_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === COOPERATIVE_LOAN_PAYMENT_ENTITY && isRemoteCooperativeLoanPaymentDto(queueItem.payload)) {
    await updateCooperativeLoanPaymentSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === COOPERATIVE_MEMBER_ENTITY && isRemoteCooperativeMemberDto(queueItem.payload)) {
    await updateCooperativeMemberSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (
    queueItem.entity === COOPERATIVE_MEMBER_SAVING_BALANCE_ENTITY &&
    isRemoteCooperativeMemberSavingBalanceDto(queueItem.payload)
  ) {
    await updateCooperativeMemberSavingBalanceSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (
    queueItem.entity === COOPERATIVE_SAVING_TRANSACTION_ENTITY &&
    isRemoteCooperativeSavingTransactionDto(queueItem.payload)
  ) {
    await updateCooperativeSavingTransactionSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === CURRENCY_ENTITY && isRemoteCurrencyDto(queueItem.payload)) {
    await updateCurrencySyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === CURRENCY_RATE_ENTITY && isRemoteCurrencyRateDto(queueItem.payload)) {
    await updateCurrencyRateSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === CHART_OF_ACCOUNT_ENTITY && isRemoteChartOfAccountDto(queueItem.payload)) {
    await updateChartOfAccountSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === FINANCE_ACCOUNT_MAPPING_ENTITY && isRemoteFinanceAccountMappingDto(queueItem.payload)) {
    await updateFinanceAccountMappingSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === ACCOUNTING_PROFILE_SETTING_ENTITY && isRemoteAccountingProfileSettingDto(queueItem.payload)) {
    await updateAccountingProfileSettingSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (
    queueItem.entity === ACCOUNTING_INITIAL_SETUP_SETTING_ENTITY &&
    isRemoteAccountingInitialSetupSettingDto(queueItem.payload)
  ) {
    await updateAccountingInitialSetupSettingSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === ENABLED_MODULE_ENTITY && isRemoteEnabledModuleDto(queueItem.payload)) {
    await updateEnabledModuleSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === GENERAL_LEDGER_SETTING_ENTITY && isRemoteGeneralLedgerSettingDto(queueItem.payload)) {
    await updateGeneralLedgerSettingSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === DEPARTMENT_ENTITY && isRemoteDepartmentDto(queueItem.payload)) {
    await updateDepartmentSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === EMPLOYEE_ENTITY && isRemoteEmployeeDto(queueItem.payload)) {
    await updateEmployeeSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === EMPLOYEE_AREA_ENTITY && isRemoteEmployeeAreaDto(queueItem.payload)) {
    await updateEmployeeAreaSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (
    queueItem.entity === EMPLOYEE_COLLECTION_SCHEDULE_ENTITY &&
    isRemoteEmployeeCollectionScheduleDto(queueItem.payload)
  ) {
    await updateEmployeeCollectionScheduleSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === PAYROLL_RUN_ENTITY && isRemotePayrollRunBundleDto(queueItem.payload)) {
    await updatePayrollRunSyncMetadata(queueItem.entity_id, queueItem.payload.run.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (
    queueItem.entity === EMPLOYEE_CASH_ADVANCE_ENTITY &&
    isRemoteEmployeeCashAdvanceBundleDto(queueItem.payload)
  ) {
    await updateEmployeeCashAdvanceSyncMetadata(queueItem.entity_id, queueItem.payload.cash_advance.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === FINANCE_TRANSACTION_ENTITY && isRemoteFinanceTransactionDto(queueItem.payload)) {
    await updateFinanceTransactionSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (
    queueItem.entity === CASH_BANK_RECONCILIATION_ENTITY &&
    isRemoteCashBankReconciliationDto(queueItem.payload)
  ) {
    await updateCashBankReconciliationSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (
    queueItem.entity === ACCOUNTING_PERIOD_ENTITY &&
    isRemoteAccountingPeriodDto(queueItem.payload)
  ) {
    await updateAccountingPeriodSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (
    queueItem.entity === CLOSING_RUN_ENTITY &&
    isRemoteClosingRunDto(queueItem.payload)
  ) {
    await updateClosingRunSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === JOURNAL_ENTRY_ENTITY && isRemoteJournalEntryBundleDto(queueItem.payload)) {
    await updateJournalEntrySyncMetadata(queueItem.entity_id, queueItem.payload.entry.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === OPENING_BALANCE_ENTITY && isRemoteOpeningBalanceBundleDto(queueItem.payload)) {
    await updateOpeningBalanceBundleSyncMetadata(queueItem.entity_id, queueItem.payload.batch.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === PROJECT_ENTITY && isRemoteProjectDto(queueItem.payload)) {
    await updateProjectSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === PRODUCT_ENTITY && isRemoteProductDto(queueItem.payload)) {
    await updateProductSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === PURCHASE_DOCUMENT_ENTITY && isRemotePurchaseDocumentBundleDto(queueItem.payload)) {
    await updatePurchaseDocumentSyncMetadata(queueItem.entity_id, queueItem.payload.document.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === SALES_DOCUMENT_ENTITY && isRemoteSalesDocumentBundleDto(queueItem.payload)) {
    await updateSalesDocumentSyncMetadata(queueItem.entity_id, queueItem.payload.document.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === STOCK_OPNAME_ENTITY && isRemoteStockOpnameBundleDto(queueItem.payload)) {
    await updateStockOpnameSyncMetadata(queueItem.entity_id, queueItem.payload.opname.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === PRODUCTION_ORDER_ENTITY && isRemoteProductionOrderBundleDto(queueItem.payload)) {
    await updateProductionOrderSyncMetadata(queueItem.entity_id, queueItem.payload.order.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === TAX_ENTITY && isRemoteTaxDto(queueItem.payload)) {
    await updateTaxSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }

  if (queueItem.entity === WAREHOUSE_ENTITY && isRemoteWarehouseDto(queueItem.payload)) {
    await updateWarehouseSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
      sync_status: 'failed',
      sync_error: errorMessage,
    });
  }
};

const processActivityLogQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    throw new Error('Activity log sync queue tidak mendukung operasi delete.');
  }

  if (!isRemoteActivityLogDto(queueItem.payload)) {
    throw new Error('Payload activity log sync queue tidak valid.');
  }

  return activityLogPostgresAdapter.upsert(queueItem.payload);
};

const processAuthUserQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    throw new Error('Auth user sync queue tidak mendukung operasi delete.');
  }

  if (!isRemoteAuthUserDto(queueItem.payload)) {
    throw new Error('Payload auth user sync queue tidak valid.');
  }

  return authUserPostgresAdapter.upsert(queueItem.payload);
};

const processRoleQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    throw new Error('Role sync queue tidak mendukung operasi delete.');
  }

  if (!isRemoteRoleDto(queueItem.payload)) {
    throw new Error('Payload role sync queue tidak valid.');
  }

  return rolePostgresAdapter.upsert(queueItem.payload);
};

const processRolePermissionQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    throw new Error('Role permission sync queue tidak mendukung operasi delete.');
  }

  if (!isRemoteRolePermissionDto(queueItem.payload)) {
    throw new Error('Payload role permission sync queue tidak valid.');
  }

  return rolePermissionPostgresAdapter.upsert(queueItem.payload);
};

const processContactQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    return contactPostgresAdapter.delete(queueItem.entity_id);
  }

  if (!isRemoteContactDto(queueItem.payload)) {
    throw new Error('Payload contact sync queue tidak valid.');
  }

  return contactPostgresAdapter.upsert(queueItem.payload);
};

const processCooperativeAreaQueueItem = async (queueItem: SyncQueueItem) => {
  if (!isRemoteCooperativeAreaDto(queueItem.payload)) {
    throw new Error('Payload area koperasi sync queue tidak valid.');
  }

  return cooperativeAreaPostgresAdapter.upsert(queueItem.payload);
};

const processCooperativeMemberQueueItem = async (queueItem: SyncQueueItem) => {
  if (!isRemoteCooperativeMemberDto(queueItem.payload)) {
    throw new Error('Payload anggota koperasi sync queue tidak valid.');
  }

  return cooperativeMemberPostgresAdapter.upsert(queueItem.payload);
};

const processCooperativeSavingTransactionQueueItem = async (queueItem: SyncQueueItem) => {
  if (!isRemoteCooperativeSavingTransactionDto(queueItem.payload)) {
    throw new Error('Payload transaksi simpanan koperasi sync queue tidak valid.');
  }

  return cooperativeSavingTransactionPostgresAdapter.upsert(queueItem.payload);
};

const processCooperativeMemberSavingBalanceQueueItem = async (queueItem: SyncQueueItem) => {
  if (!isRemoteCooperativeMemberSavingBalanceDto(queueItem.payload)) {
    throw new Error('Payload saldo simpanan koperasi sync queue tidak valid.');
  }

  return cooperativeMemberSavingBalancePostgresAdapter.upsert(queueItem.payload);
};

const processCooperativeLoanQueueItem = async (queueItem: SyncQueueItem) => {
  if (!isRemoteCooperativeLoanDto(queueItem.payload)) {
    throw new Error('Payload pinjaman koperasi sync queue tidak valid.');
  }

  return cooperativeLoanPostgresAdapter.upsert(queueItem.payload);
};

const processCooperativeLoanInstallmentQueueItem = async (queueItem: SyncQueueItem) => {
  if (!isRemoteCooperativeLoanInstallmentDto(queueItem.payload)) {
    throw new Error('Payload jadwal angsuran koperasi sync queue tidak valid.');
  }

  return cooperativeLoanInstallmentPostgresAdapter.upsert(queueItem.payload);
};

const processCooperativeLoanCollectionEventQueueItem = async (
  queueItem: SyncQueueItem,
): Promise<RemoteRecordCooperativeLoanCollectionEventResult> => {
  if (queueItem.operation === 'delete') {
    throw new Error('Event penagihan koperasi sync queue tidak mendukung operasi delete.');
  }

  if (!isRemoteCooperativeLoanCollectionEventDto(queueItem.payload)) {
    throw new Error('Payload event penagihan koperasi sync queue tidak valid.');
  }

  const sessionToken = await getCurrentSyncServerSessionToken();
  if (!sessionToken) {
    throw new Error(MISSING_SERVER_SESSION_TOKEN_SYNC_ERROR);
  }

  const result = await cooperativeCollectionEventPostgresAdapter.record({
    session_token: sessionToken,
    event_id: queueItem.payload.id,
    installment_id: queueItem.payload.installment_id,
    collection_status: queueItem.payload.collection_status,
    follow_up_date: queueItem.payload.follow_up_date,
    collection_notes: queueItem.payload.collection_notes,
  });
  if (!result) {
    throw new Error('Upload event penagihan koperasi tidak menghasilkan data remote.');
  }

  return result;
};

const processCooperativeLoanPaymentQueueItem = async (
  queueItem: SyncQueueItem,
): Promise<RemoteCooperativeLoanPaymentDto> => {
  if (!isRemoteCooperativeLoanPaymentDto(queueItem.payload)) {
    throw new Error('Payload pembayaran angsuran koperasi sync queue tidak valid.');
  }

  const remotePayment = await cooperativeLoanPaymentPostgresAdapter.upsert(queueItem.payload);
  if (!remotePayment) {
    throw new Error('Upload pembayaran angsuran koperasi tidak menghasilkan data remote.');
  }

  return remotePayment;
};

const processCurrencyQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    return currencyPostgresAdapter.delete(queueItem.entity_id);
  }

  if (!isRemoteCurrencyDto(queueItem.payload)) {
    throw new Error('Payload mata uang sync queue tidak valid.');
  }

  return currencyPostgresAdapter.upsert(queueItem.payload);
};

const processCurrencyRateQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    return currencyRatePostgresAdapter.delete(queueItem.entity_id);
  }

  if (!isRemoteCurrencyRateDto(queueItem.payload)) {
    throw new Error('Payload kurs mata uang sync queue tidak valid.');
  }

  return currencyRatePostgresAdapter.upsert(queueItem.payload);
};

const processChartOfAccountQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    return chartOfAccountPostgresAdapter.delete(queueItem.entity_id);
  }

  if (!isRemoteChartOfAccountDto(queueItem.payload)) {
    throw new Error('Payload chart of account sync queue tidak valid.');
  }

  return chartOfAccountPostgresAdapter.upsert(queueItem.payload);
};

const processFinanceAccountMappingQueueItem = async (queueItem: SyncQueueItem) => {
  if (!isRemoteFinanceAccountMappingDto(queueItem.payload)) {
    throw new Error('Payload finance account mapping sync queue tidak valid.');
  }

  return financeAccountMappingPostgresAdapter.upsert(queueItem.payload);
};

const processAccountingProfileSettingQueueItem = async (queueItem: SyncQueueItem) => {
  if (!isRemoteAccountingProfileSettingDto(queueItem.payload)) {
    throw new Error('Payload accounting profile setting sync queue tidak valid.');
  }

  return accountingProfileSettingPostgresAdapter.upsert(queueItem.payload);
};

const processAccountingInitialSetupSettingQueueItem = async (queueItem: SyncQueueItem) => {
  if (!isRemoteAccountingInitialSetupSettingDto(queueItem.payload)) {
    throw new Error('Payload accounting initial setup setting sync queue tidak valid.');
  }

  return accountingInitialSetupSettingPostgresAdapter.upsert(queueItem.payload);
};

const processEnabledModuleQueueItem = async (queueItem: SyncQueueItem) => {
  if (!isRemoteEnabledModuleDto(queueItem.payload)) {
    throw new Error('Payload enabled module sync queue tidak valid.');
  }

  return enabledModulePostgresAdapter.upsert(queueItem.payload);
};

const processGeneralLedgerSettingQueueItem = async (queueItem: SyncQueueItem) => {
  if (!isRemoteGeneralLedgerSettingDto(queueItem.payload)) {
    throw new Error('Payload general ledger setting sync queue tidak valid.');
  }

  return generalLedgerSettingPostgresAdapter.upsert(queueItem.payload);
};

const processDepartmentQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    return departmentPostgresAdapter.delete(queueItem.entity_id);
  }

  if (!isRemoteDepartmentDto(queueItem.payload)) {
    throw new Error('Payload department sync queue tidak valid.');
  }

  return departmentPostgresAdapter.upsert(queueItem.payload);
};

const processCashierSessionQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    throw new Error('Sesi kasir sync queue tidak mendukung operasi delete.');
  }

  if (!isRemoteCashierSessionDto(queueItem.payload)) {
    throw new Error('Payload sesi kasir sync queue tidak valid.');
  }

  return cashierSessionPostgresAdapter.upsert(queueItem.payload);
};

const processEmployeeQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    throw new Error('Employee sync queue tidak mendukung operasi delete.');
  }

  if (!isRemoteEmployeeDto(queueItem.payload)) {
    throw new Error('Payload employee sync queue tidak valid.');
  }

  return employeePostgresAdapter.upsert(queueItem.payload);
};

const processEmployeeAreaQueueItem = async (queueItem: SyncQueueItem) => {
  if (!isRemoteEmployeeAreaDto(queueItem.payload)) {
    throw new Error('Payload area karyawan sync queue tidak valid.');
  }

  return employeeAreaPostgresAdapter.upsert(queueItem.payload);
};

const processEmployeeCollectionScheduleQueueItem = async (queueItem: SyncQueueItem) => {
  if (!isRemoteEmployeeCollectionScheduleDto(queueItem.payload)) {
    throw new Error('Payload jadwal penagihan karyawan sync queue tidak valid.');
  }

  return employeeCollectionSchedulePostgresAdapter.upsert(queueItem.payload);
};

const processPayrollRunQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    throw new Error('Payroll sync queue tidak mendukung operasi delete.');
  }

  if (!isRemotePayrollRunBundleDto(queueItem.payload)) {
    throw new Error('Payload payroll sync queue tidak valid.');
  }

  return payrollRunPostgresAdapter.upsert(queueItem.payload);
};

const processEmployeeCashAdvanceQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    throw new Error('Kasbon karyawan sync queue tidak mendukung operasi delete.');
  }

  if (!isRemoteEmployeeCashAdvanceBundleDto(queueItem.payload)) {
    throw new Error('Payload kasbon karyawan sync queue tidak valid.');
  }

  return employeeCashAdvancePostgresAdapter.upsert(queueItem.payload);
};

const processFinanceTransactionQueueItem = async (queueItem: SyncQueueItem) => {
  if (!isRemoteFinanceTransactionDto(queueItem.payload)) {
    throw new Error('Payload finance transaction sync queue tidak valid.');
  }

  return financeTransactionPostgresAdapter.upsert(queueItem.payload);
};

const processCashBankReconciliationQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    throw new Error('Rekonsiliasi kas/bank sync queue tidak mendukung operasi delete.');
  }

  if (!isRemoteCashBankReconciliationDto(queueItem.payload)) {
    throw new Error('Payload rekonsiliasi kas/bank sync queue tidak valid.');
  }

  return cashBankReconciliationPostgresAdapter.upsert(queueItem.payload);
};

const processAccountingPeriodQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    throw new Error('Periode akuntansi sync queue tidak mendukung operasi delete.');
  }

  if (!isRemoteAccountingPeriodDto(queueItem.payload)) {
    throw new Error('Payload periode akuntansi sync queue tidak valid.');
  }

  return accountingPeriodPostgresAdapter.upsert(queueItem.payload);
};

const processClosingRunQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    throw new Error('Closing run sync queue tidak mendukung operasi delete.');
  }

  if (!isRemoteClosingRunDto(queueItem.payload)) {
    throw new Error('Payload closing run sync queue tidak valid.');
  }

  return closingRunPostgresAdapter.upsert(queueItem.payload);
};

const processJournalEntryQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    throw new Error('Journal entry sync queue tidak mendukung operasi delete.');
  }

  if (!isRemoteJournalEntryBundleDto(queueItem.payload)) {
    throw new Error('Payload journal entry sync queue tidak valid.');
  }

  return journalEntryPostgresAdapter.upsert(queueItem.payload);
};

const processOpeningBalanceQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    throw new Error('Opening balance sync queue tidak mendukung operasi delete.');
  }

  if (!isRemoteOpeningBalanceBundleDto(queueItem.payload)) {
    throw new Error('Payload opening balance sync queue tidak valid.');
  }

  return openingBalancePostgresAdapter.upsert(queueItem.payload);
};

const processProjectQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    return projectPostgresAdapter.delete(queueItem.entity_id);
  }

  if (!isRemoteProjectDto(queueItem.payload)) {
    throw new Error('Payload project sync queue tidak valid.');
  }

  return projectPostgresAdapter.upsert(queueItem.payload);
};

const processProductQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    return productPostgresAdapter.delete(queueItem.entity_id);
  }

  if (!isRemoteProductDto(queueItem.payload)) {
    throw new Error('Payload product sync queue tidak valid.');
  }

  return productPostgresAdapter.upsert(queueItem.payload);
};

const processPurchaseDocumentQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    throw new Error('Purchase document sync queue tidak mendukung operasi delete.');
  }

  if (!isRemotePurchaseDocumentBundleDto(queueItem.payload)) {
    throw new Error('Payload purchase document sync queue tidak valid.');
  }

  return purchaseDocumentPostgresAdapter.upsert(queueItem.payload);
};

const processSalesDocumentQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    throw new Error('Sales document sync queue tidak mendukung operasi delete.');
  }

  if (!isRemoteSalesDocumentBundleDto(queueItem.payload)) {
    throw new Error('Payload sales document sync queue tidak valid.');
  }

  return salesDocumentPostgresAdapter.upsert(queueItem.payload);
};

const processStockMutationQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    throw new Error('Stock mutation sync queue tidak mendukung operasi delete.');
  }

  if (!isRemoteStockMutationDto(queueItem.payload)) {
    throw new Error('Payload stock mutation sync queue tidak valid.');
  }

  return stockMutationPostgresAdapter.upsert(queueItem.payload);
};

const processStockOpnameQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    throw new Error('Stock opname sync queue tidak mendukung operasi delete.');
  }

  if (!isRemoteStockOpnameBundleDto(queueItem.payload)) {
    throw new Error('Payload stock opname sync queue tidak valid.');
  }

  return stockOpnamePostgresAdapter.upsert(queueItem.payload);
};

const processProductionOrderQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    throw new Error('Production order sync queue tidak mendukung operasi delete.');
  }

  if (!isRemoteProductionOrderBundleDto(queueItem.payload)) {
    throw new Error('Payload production order sync queue tidak valid.');
  }

  return productionOrderPostgresAdapter.upsert(queueItem.payload);
};

const processTaxQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    return taxPostgresAdapter.delete(queueItem.entity_id);
  }

  if (!isRemoteTaxDto(queueItem.payload)) {
    throw new Error('Payload tax sync queue tidak valid.');
  }

  return taxPostgresAdapter.upsert(queueItem.payload);
};

const processWarehouseQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    return warehousePostgresAdapter.delete(queueItem.entity_id);
  }

  if (!isRemoteWarehouseDto(queueItem.payload)) {
    throw new Error('Payload gudang sync queue tidak valid.');
  }

  return warehousePostgresAdapter.upsert(queueItem.payload);
};

export const recoverStaleProcessingSyncQueueItems = async () => {
  if (!isTauriRuntime()) {
    return {
      recovered: 0,
      failed: 0,
    };
  }

  const staleBefore = Date.now() - SYNC_QUEUE_PROCESSING_TIMEOUT_MS;
  const processingQueueItems = await db.syncQueue
    .where('status')
    .equals('processing')
    .toArray();
  const staleQueueItems = processingQueueItems.filter((queueItem) => {
    const updatedAt = Date.parse(queueItem.updated_at);
    return Number.isNaN(updatedAt) || updatedAt <= staleBefore;
  });
  const now = new Date().toISOString();
  let recovered = 0;
  let failed = 0;

  await Promise.all(staleQueueItems.map((queueItem) => {
    const shouldRetry = queueItem.attempts < SYNC_QUEUE_MAX_ATTEMPTS;
    if (shouldRetry) {
      recovered += 1;
      return db.syncQueue.update(queueItem.id, {
        status: 'pending',
        error_message: 'Recovered stale processing queue item.',
        updated_at: now,
      });
    }

    failed += 1;
    return db.syncQueue.update(queueItem.id, {
      status: 'failed',
      error_message: 'Exceeded maximum sync queue attempts after stale processing recovery.',
      updated_at: now,
    });
  }));

  return {
    recovered,
    failed,
  };
};

const processSyncQueueItem = async (queueItem: SyncQueueItem) => {
  const currentQueueItem = await db.syncQueue.get(queueItem.id);
  if (!currentQueueItem || currentQueueItem.status !== 'pending') return;

  const processingAt = new Date().toISOString();
  await db.syncQueue.update(currentQueueItem.id, {
    status: 'processing',
    attempts: currentQueueItem.attempts + 1,
    error_message: undefined,
    updated_at: processingAt,
  });

  try {
    let remoteActivityLog: RemoteActivityLogDto | null = null;
    let remoteAuthUser: RemoteAuthUserDto | null = null;
    let remoteContact: RemoteContactDto | null = null;
    let remoteCooperativeArea: RemoteCooperativeAreaDto | null = null;
    let remoteCooperativeLoanCollectionEventResult: RemoteRecordCooperativeLoanCollectionEventResult | null = null;
    let remoteCooperativeLoan: RemoteCooperativeLoanDto | null = null;
    let remoteCooperativeLoanInstallment: RemoteCooperativeLoanInstallmentDto | null = null;
    let remoteCooperativeLoanPayment: RemoteCooperativeLoanPaymentDto | null = null;
    let remoteCooperativeMember: RemoteCooperativeMemberDto | null = null;
    let remoteCooperativeMemberSavingBalance: RemoteCooperativeMemberSavingBalanceDto | null = null;
    let remoteCooperativeSavingTransaction: RemoteCooperativeSavingTransactionDto | null = null;
    let remoteCurrency: RemoteCurrencyDto | null = null;
    let remoteCurrencyRate: RemoteCurrencyRateDto | null = null;
    let remoteChartOfAccount: RemoteChartOfAccountDto | null = null;
    let remoteFinanceAccountMapping: RemoteFinanceAccountMappingDto | null = null;
    let remoteAccountingProfileSetting: RemoteAccountingProfileSettingDto | null = null;
    let remoteAccountingInitialSetupSetting: RemoteAccountingInitialSetupSettingDto | null = null;
    let remoteEnabledModule: RemoteEnabledModuleDto | null = null;
    let remoteGeneralLedgerSetting: RemoteGeneralLedgerSettingDto | null = null;
    let remoteCashierSession: RemoteCashierSessionDto | null = null;
    let remoteDepartment: RemoteDepartmentDto | null = null;
    let remoteEmployee: RemoteEmployeeDto | null = null;
    let remoteEmployeeArea: RemoteEmployeeAreaDto | null = null;
    let remoteEmployeeCashAdvanceBundle: RemoteEmployeeCashAdvanceBundleDto | null = null;
    let remoteEmployeeCollectionSchedule: RemoteEmployeeCollectionScheduleDto | null = null;
    let remoteFinanceTransaction: RemoteFinanceTransactionDto | null = null;
    let remoteCashBankReconciliation: RemoteCashBankReconciliationDto | null = null;
    let remoteAccountingPeriod: RemoteAccountingPeriodDto | null = null;
    let remoteClosingRun: RemoteClosingRunDto | null = null;
    let remoteJournalEntryBundle: RemoteJournalEntryBundleDto | null = null;
    let remoteOpeningBalanceBundle: RemoteOpeningBalanceBundleDto | null = null;
    let remotePayrollRunBundle: RemotePayrollRunBundleDto | null = null;
    let remoteProduct: RemoteProductDto | null = null;
    let remoteProductionOrderBundle: RemoteProductionOrderBundleDto | null = null;
    let remoteProject: RemoteProjectDto | null = null;
    let remotePurchaseDocumentBundle: RemotePurchaseDocumentBundleDto | null = null;
    let remoteRole: RemoteRoleDto | null = null;
    let remoteRolePermission: RemoteRolePermissionDto | null = null;
    let remoteSalesDocumentBundle: RemoteSalesDocumentBundleDto | null = null;
    let remoteStockOpnameBundle: RemoteStockOpnameBundleDto | null = null;
    let remoteStockMutation: RemoteStockMutationDto | null = null;
    let remoteTax: RemoteTaxDto | null = null;
    let remoteWarehouse: RemoteWarehouseDto | null = null;

    if (currentQueueItem.entity === ACTIVITY_LOG_ENTITY) {
      remoteActivityLog = await processActivityLogQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === AUTH_USER_ENTITY) {
      remoteAuthUser = await processAuthUserQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === CONTACT_ENTITY) {
      remoteContact = await processContactQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === COOPERATIVE_AREA_ENTITY) {
      remoteCooperativeArea = await processCooperativeAreaQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === COOPERATIVE_LOAN_ENTITY) {
      remoteCooperativeLoan = await processCooperativeLoanQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === COOPERATIVE_LOAN_INSTALLMENT_ENTITY) {
      remoteCooperativeLoanInstallment = await processCooperativeLoanInstallmentQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === COOPERATIVE_LOAN_COLLECTION_EVENT_ENTITY) {
      remoteCooperativeLoanCollectionEventResult = await processCooperativeLoanCollectionEventQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === COOPERATIVE_LOAN_PAYMENT_ENTITY) {
      remoteCooperativeLoanPayment = await processCooperativeLoanPaymentQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === COOPERATIVE_MEMBER_ENTITY) {
      remoteCooperativeMember = await processCooperativeMemberQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === COOPERATIVE_MEMBER_SAVING_BALANCE_ENTITY) {
      remoteCooperativeMemberSavingBalance = await processCooperativeMemberSavingBalanceQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === COOPERATIVE_SAVING_TRANSACTION_ENTITY) {
      remoteCooperativeSavingTransaction = await processCooperativeSavingTransactionQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === CURRENCY_ENTITY) {
      remoteCurrency = await processCurrencyQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === CURRENCY_RATE_ENTITY) {
      remoteCurrencyRate = await processCurrencyRateQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === CHART_OF_ACCOUNT_ENTITY) {
      remoteChartOfAccount = await processChartOfAccountQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === FINANCE_ACCOUNT_MAPPING_ENTITY) {
      remoteFinanceAccountMapping = await processFinanceAccountMappingQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === ACCOUNTING_PROFILE_SETTING_ENTITY) {
      remoteAccountingProfileSetting = await processAccountingProfileSettingQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === ACCOUNTING_INITIAL_SETUP_SETTING_ENTITY) {
      remoteAccountingInitialSetupSetting = await processAccountingInitialSetupSettingQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === ENABLED_MODULE_ENTITY) {
      remoteEnabledModule = await processEnabledModuleQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === GENERAL_LEDGER_SETTING_ENTITY) {
      remoteGeneralLedgerSetting = await processGeneralLedgerSettingQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === CASHIER_SESSION_ENTITY) {
      remoteCashierSession = await processCashierSessionQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === DEPARTMENT_ENTITY) {
      remoteDepartment = await processDepartmentQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === EMPLOYEE_ENTITY) {
      remoteEmployee = await processEmployeeQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === EMPLOYEE_AREA_ENTITY) {
      remoteEmployeeArea = await processEmployeeAreaQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === EMPLOYEE_CASH_ADVANCE_ENTITY) {
      remoteEmployeeCashAdvanceBundle = await processEmployeeCashAdvanceQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === EMPLOYEE_COLLECTION_SCHEDULE_ENTITY) {
      remoteEmployeeCollectionSchedule = await processEmployeeCollectionScheduleQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === FINANCE_TRANSACTION_ENTITY) {
      remoteFinanceTransaction = await processFinanceTransactionQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === CASH_BANK_RECONCILIATION_ENTITY) {
      remoteCashBankReconciliation = await processCashBankReconciliationQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === ACCOUNTING_PERIOD_ENTITY) {
      remoteAccountingPeriod = await processAccountingPeriodQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === CLOSING_RUN_ENTITY) {
      remoteClosingRun = await processClosingRunQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === JOURNAL_ENTRY_ENTITY) {
      remoteJournalEntryBundle = await processJournalEntryQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === OPENING_BALANCE_ENTITY) {
      remoteOpeningBalanceBundle = await processOpeningBalanceQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === PAYROLL_RUN_ENTITY) {
      remotePayrollRunBundle = await processPayrollRunQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === PRODUCT_ENTITY) {
      remoteProduct = await processProductQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === PRODUCTION_ORDER_ENTITY) {
      remoteProductionOrderBundle = await processProductionOrderQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === PROJECT_ENTITY) {
      remoteProject = await processProjectQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === PURCHASE_DOCUMENT_ENTITY) {
      remotePurchaseDocumentBundle = await processPurchaseDocumentQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === ROLE_ENTITY) {
      remoteRole = await processRoleQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === ROLE_PERMISSION_ENTITY) {
      remoteRolePermission = await processRolePermissionQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === SALES_DOCUMENT_ENTITY) {
      remoteSalesDocumentBundle = await processSalesDocumentQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === STOCK_OPNAME_ENTITY) {
      remoteStockOpnameBundle = await processStockOpnameQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === STOCK_MUTATION_ENTITY) {
      remoteStockMutation = await processStockMutationQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === TAX_ENTITY) {
      remoteTax = await processTaxQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === WAREHOUSE_ENTITY) {
      remoteWarehouse = await processWarehouseQueueItem(currentQueueItem);
    } else {
      throw new Error(`Entity sync queue tidak didukung: ${currentQueueItem.entity}`);
    }

    if (
      currentQueueItem.entity === CONTACT_ENTITY &&
      !remoteContact &&
      currentQueueItem.operation === 'delete' &&
      isRemoteContactDto(currentQueueItem.payload)
    ) {
      const syncedAt = new Date().toISOString();
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateContactSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
      });
      return;
    }

    if (
      currentQueueItem.entity === CHART_OF_ACCOUNT_ENTITY &&
      !remoteChartOfAccount &&
      currentQueueItem.operation === 'delete' &&
      isRemoteChartOfAccountDto(currentQueueItem.payload)
    ) {
      const syncedAt = new Date().toISOString();
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateChartOfAccountSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
      });
      return;
    }

    if (
      currentQueueItem.entity === DEPARTMENT_ENTITY &&
      !remoteDepartment &&
      currentQueueItem.operation === 'delete' &&
      isRemoteDepartmentDto(currentQueueItem.payload)
    ) {
      const syncedAt = new Date().toISOString();
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateDepartmentSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
      });
      return;
    }

    if (
      currentQueueItem.entity === EMPLOYEE_AREA_ENTITY &&
      currentQueueItem.operation === 'delete' &&
      isRemoteEmployeeAreaDto(currentQueueItem.payload)
    ) {
      const syncedAt = new Date().toISOString();
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      return;
    }

    if (
      currentQueueItem.entity === EMPLOYEE_COLLECTION_SCHEDULE_ENTITY &&
      currentQueueItem.operation === 'delete' &&
      isRemoteEmployeeCollectionScheduleDto(currentQueueItem.payload)
    ) {
      const syncedAt = new Date().toISOString();
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      return;
    }

    if (
      currentQueueItem.entity === CURRENCY_ENTITY &&
      !remoteCurrency &&
      currentQueueItem.operation === 'delete' &&
      isRemoteCurrencyDto(currentQueueItem.payload)
    ) {
      const syncedAt = new Date().toISOString();
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateCurrencySyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
      });
      return;
    }

    if (
      currentQueueItem.entity === CURRENCY_RATE_ENTITY &&
      !remoteCurrencyRate &&
      currentQueueItem.operation === 'delete' &&
      isRemoteCurrencyRateDto(currentQueueItem.payload)
    ) {
      const syncedAt = new Date().toISOString();
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateCurrencyRateSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
      });
      return;
    }

    if (
      currentQueueItem.entity === PRODUCT_ENTITY &&
      !remoteProduct &&
      currentQueueItem.operation === 'delete' &&
      isRemoteProductDto(currentQueueItem.payload)
    ) {
      const syncedAt = new Date().toISOString();
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      return;
    }

    if (
      currentQueueItem.entity === PROJECT_ENTITY &&
      !remoteProject &&
      currentQueueItem.operation === 'delete' &&
      isRemoteProjectDto(currentQueueItem.payload)
    ) {
      const syncedAt = new Date().toISOString();
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateProjectSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
      });
      return;
    }

    if (
      currentQueueItem.entity === TAX_ENTITY &&
      !remoteTax &&
      currentQueueItem.operation === 'delete' &&
      isRemoteTaxDto(currentQueueItem.payload)
    ) {
      const syncedAt = new Date().toISOString();
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateTaxSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
      });
      return;
    }

    if (
      currentQueueItem.entity === WAREHOUSE_ENTITY &&
      !remoteWarehouse &&
      currentQueueItem.operation === 'delete' &&
      isRemoteWarehouseDto(currentQueueItem.payload)
    ) {
      const syncedAt = new Date().toISOString();
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateWarehouseSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
      });
      return;
    }

    const syncedAt = new Date().toISOString();

    if (remoteActivityLog && isRemoteActivityLogDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      return;
    }

    if (remoteAuthUser && isRemoteAuthUserDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateAuthUserSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteAuthUser.updated_at,
      });
      await mergeRemoteAuthUsersIntoDexie([remoteAuthUser], syncedAt);
      return;
    }

    if (remoteContact && isRemoteContactDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateContactSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteContact.updated_at,
      });
      await mergeRemoteContactsIntoDexie([remoteContact], syncedAt);
      return;
    }

    if (remoteCooperativeLoan && isRemoteCooperativeLoanDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateCooperativeLoanSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteCooperativeLoan.updated_at,
      });
      await mergeRemoteCooperativeLoansIntoDexie([remoteCooperativeLoan], syncedAt);
      return;
    }

    if (remoteCooperativeArea && isRemoteCooperativeAreaDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateCooperativeAreaSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteCooperativeArea.updated_at,
      });
      await mergeRemoteCooperativeAreasIntoDexie([remoteCooperativeArea], syncedAt);
      return;
    }

    if (remoteCooperativeLoanInstallment && isRemoteCooperativeLoanInstallmentDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateCooperativeLoanInstallmentSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteCooperativeLoanInstallment.updated_at,
      });
      await mergeRemoteCooperativeLoanInstallmentsIntoDexie([remoteCooperativeLoanInstallment], syncedAt);
      return;
    }

    if (
      remoteCooperativeLoanCollectionEventResult &&
      isRemoteCooperativeLoanCollectionEventDto(currentQueueItem.payload)
    ) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateCooperativeLoanCollectionEventSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.created_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteCooperativeLoanCollectionEventResult.event.created_at,
      });
      await Promise.all([
        mergeRemoteCooperativeCollectionEventsIntoDexie([remoteCooperativeLoanCollectionEventResult.event], syncedAt),
        mergeRemoteCooperativeLoanInstallmentsIntoDexie([remoteCooperativeLoanCollectionEventResult.installment], syncedAt),
      ]);
      return;
    }

    if (remoteCooperativeLoanPayment && isRemoteCooperativeLoanPaymentDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateCooperativeLoanPaymentSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteCooperativeLoanPayment.updated_at,
      });
      await mergeRemoteCooperativeLoanPaymentsIntoDexie([remoteCooperativeLoanPayment], syncedAt);
      return;
    }

    if (remoteCooperativeMember && isRemoteCooperativeMemberDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateCooperativeMemberSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteCooperativeMember.updated_at,
      });
      await mergeRemoteCooperativeMembersIntoDexie([remoteCooperativeMember], syncedAt);
      return;
    }

    if (
      remoteCooperativeMemberSavingBalance &&
      isRemoteCooperativeMemberSavingBalanceDto(currentQueueItem.payload)
    ) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateCooperativeMemberSavingBalanceSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteCooperativeMemberSavingBalance.updated_at,
      });
      await mergeRemoteCooperativeMemberSavingBalancesIntoDexie([remoteCooperativeMemberSavingBalance], syncedAt);
      return;
    }

    if (
      remoteCooperativeSavingTransaction &&
      isRemoteCooperativeSavingTransactionDto(currentQueueItem.payload)
    ) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateCooperativeSavingTransactionSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteCooperativeSavingTransaction.updated_at,
      });
      await mergeRemoteCooperativeSavingTransactionsIntoDexie([remoteCooperativeSavingTransaction], syncedAt);
      return;
    }

    if (remoteCurrency && isRemoteCurrencyDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateCurrencySyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteCurrency.updated_at,
      });
      await mergeRemoteCurrenciesIntoDexie([remoteCurrency], syncedAt);
      return;
    }

    if (remoteCurrencyRate && isRemoteCurrencyRateDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateCurrencyRateSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteCurrencyRate.updated_at,
      });
      await mergeRemoteCurrencyRatesIntoDexie([remoteCurrencyRate], syncedAt);
      return;
    }

    if (remoteChartOfAccount && isRemoteChartOfAccountDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateChartOfAccountSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteChartOfAccount.updated_at,
      });
      await mergeRemoteChartOfAccountsIntoDexie([remoteChartOfAccount], syncedAt);
      return;
    }

    if (remoteFinanceAccountMapping && isRemoteFinanceAccountMappingDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateFinanceAccountMappingSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteFinanceAccountMapping.updated_at,
      });
      await mergeRemoteFinanceAccountMappingsIntoDexie([remoteFinanceAccountMapping], syncedAt);
      return;
    }

    if (remoteAccountingProfileSetting && isRemoteAccountingProfileSettingDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateAccountingProfileSettingSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteAccountingProfileSetting.updated_at,
      });
      await mergeRemoteAccountingProfileSettingIntoDexie(remoteAccountingProfileSetting, syncedAt);
      return;
    }

    if (
      remoteAccountingInitialSetupSetting &&
      isRemoteAccountingInitialSetupSettingDto(currentQueueItem.payload)
    ) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateAccountingInitialSetupSettingSyncMetadata(
        currentQueueItem.entity_id,
        currentQueueItem.payload.updated_at,
        {
          sync_status: 'synced',
          sync_error: undefined,
          last_synced_at: syncedAt,
          remote_updated_at: remoteAccountingInitialSetupSetting.updated_at,
        },
      );
      await mergeRemoteAccountingInitialSetupSettingIntoDexie(remoteAccountingInitialSetupSetting, syncedAt);
      return;
    }

    if (remoteEnabledModule && isRemoteEnabledModuleDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateEnabledModuleSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteEnabledModule.updated_at,
      });
      await mergeRemoteEnabledModulesIntoDexie([remoteEnabledModule], syncedAt);
      return;
    }

    if (remoteGeneralLedgerSetting && isRemoteGeneralLedgerSettingDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateGeneralLedgerSettingSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteGeneralLedgerSetting.updated_at,
      });
      await mergeRemoteGeneralLedgerSettingIntoDexie(remoteGeneralLedgerSetting, syncedAt);
      return;
    }

    if (remoteCashierSession && isRemoteCashierSessionDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateCashierSessionSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteCashierSession.updated_at,
      });
      await mergeRemoteCashierSessionsIntoDexie([remoteCashierSession], syncedAt);
      return;
    }

    if (remoteDepartment && isRemoteDepartmentDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateDepartmentSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteDepartment.updated_at,
      });
      await mergeRemoteDepartmentsIntoDexie([remoteDepartment], syncedAt);
      return;
    }

    if (remoteEmployee && isRemoteEmployeeDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateEmployeeSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteEmployee.updated_at,
      });
      await mergeRemoteEmployeesIntoDexie([remoteEmployee], syncedAt);
      return;
    }

    if (remoteEmployeeArea && isRemoteEmployeeAreaDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateEmployeeAreaSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteEmployeeArea.updated_at,
      });
      await mergeRemoteEmployeeAreasIntoDexie([remoteEmployeeArea], syncedAt);
      return;
    }

    if (
      remoteEmployeeCollectionSchedule &&
      isRemoteEmployeeCollectionScheduleDto(currentQueueItem.payload)
    ) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateEmployeeCollectionScheduleSyncMetadata(
        currentQueueItem.entity_id,
        currentQueueItem.payload.updated_at,
        {
          sync_status: 'synced',
          sync_error: undefined,
          last_synced_at: syncedAt,
          remote_updated_at: remoteEmployeeCollectionSchedule.updated_at,
        },
      );
      await mergeRemoteEmployeeCollectionSchedulesIntoDexie([remoteEmployeeCollectionSchedule], syncedAt);
      return;
    }

    if (remotePayrollRunBundle && isRemotePayrollRunBundleDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updatePayrollRunSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.run.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remotePayrollRunBundle.run.updated_at,
      });
      await mergeRemotePayrollRunBundlesIntoDexie([remotePayrollRunBundle], syncedAt);
      return;
    }

    if (
      remoteEmployeeCashAdvanceBundle &&
      isRemoteEmployeeCashAdvanceBundleDto(currentQueueItem.payload)
    ) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateEmployeeCashAdvanceSyncMetadata(
        currentQueueItem.entity_id,
        currentQueueItem.payload.cash_advance.updated_at,
        {
          sync_status: 'synced',
          sync_error: undefined,
          last_synced_at: syncedAt,
          remote_updated_at: remoteEmployeeCashAdvanceBundle.cash_advance.updated_at,
        },
      );
      await mergeRemoteEmployeeCashAdvanceBundlesIntoDexie([remoteEmployeeCashAdvanceBundle], syncedAt);
      return;
    }

    if (remoteFinanceTransaction && isRemoteFinanceTransactionDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateFinanceTransactionSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteFinanceTransaction.updated_at,
      });
      await mergeRemoteFinanceTransactionsIntoDexie([remoteFinanceTransaction], syncedAt);
      return;
    }

    if (remoteCashBankReconciliation && isRemoteCashBankReconciliationDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateCashBankReconciliationSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteCashBankReconciliation.updated_at,
      });
      await mergeRemoteCashBankReconciliationsIntoDexie([remoteCashBankReconciliation], syncedAt);
      return;
    }

    if (remoteAccountingPeriod && isRemoteAccountingPeriodDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateAccountingPeriodSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteAccountingPeriod.updated_at,
      });
      await mergeRemoteAccountingPeriodsIntoDexie([remoteAccountingPeriod], syncedAt);
      return;
    }

    if (remoteClosingRun && isRemoteClosingRunDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateClosingRunSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteClosingRun.updated_at,
      });
      await mergeRemoteClosingRunsIntoDexie([remoteClosingRun], syncedAt);
      return;
    }

    if (remoteJournalEntryBundle && isRemoteJournalEntryBundleDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateJournalEntrySyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.entry.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteJournalEntryBundle.entry.updated_at,
      });
      await mergeRemoteJournalEntryBundlesIntoDexie([remoteJournalEntryBundle], syncedAt);
      return;
    }

    if (remoteOpeningBalanceBundle && isRemoteOpeningBalanceBundleDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateOpeningBalanceBundleSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.batch.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteOpeningBalanceBundle.batch.updated_at,
      });
      await mergeRemoteOpeningBalanceBundlesIntoDexie([remoteOpeningBalanceBundle], syncedAt);
      return;
    }

    if (remoteProduct && isRemoteProductDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateProductSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteProduct.updated_at,
      });
      await mergeRemoteProductsIntoDexie([remoteProduct], syncedAt);
      return;
    }

    if (remoteProject && isRemoteProjectDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateProjectSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteProject.updated_at,
      });
      await mergeRemoteProjectsIntoDexie([remoteProject], syncedAt);
      return;
    }

    if (remotePurchaseDocumentBundle && isRemotePurchaseDocumentBundleDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updatePurchaseDocumentSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.document.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remotePurchaseDocumentBundle.document.updated_at,
      });
      await mergeRemotePurchaseDocumentBundlesIntoDexie([remotePurchaseDocumentBundle], syncedAt);
      return;
    }

    if (remoteRole && isRemoteRoleDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateRoleSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteRole.updated_at,
      });
      await mergeRemoteRolesIntoDexie([remoteRole], syncedAt);
      return;
    }

    if (remoteRolePermission && isRemoteRolePermissionDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateRolePermissionSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteRolePermission.updated_at,
      });
      await mergeRemoteRolePermissionsIntoDexie([remoteRolePermission], syncedAt);
      return;
    }

    if (remoteSalesDocumentBundle && isRemoteSalesDocumentBundleDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateSalesDocumentSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.document.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteSalesDocumentBundle.document.updated_at,
      });
      await mergeRemoteSalesDocumentBundlesIntoDexie([remoteSalesDocumentBundle], syncedAt);
      return;
    }

    if (remoteStockOpnameBundle && isRemoteStockOpnameBundleDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateStockOpnameSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.opname.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteStockOpnameBundle.opname.updated_at,
      });
      await mergeRemoteStockOpnameBundlesIntoDexie([remoteStockOpnameBundle], syncedAt);
      return;
    }

    if (remoteProductionOrderBundle && isRemoteProductionOrderBundleDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateProductionOrderSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.order.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteProductionOrderBundle.order.updated_at,
      });
      await mergeRemoteProductionOrderBundlesIntoDexie([remoteProductionOrderBundle], syncedAt);
      return;
    }

    if (remoteStockMutation && isRemoteStockMutationDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      return;
    }

    if (remoteTax && isRemoteTaxDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateTaxSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteTax.updated_at,
      });
      await mergeRemoteTaxesIntoDexie([remoteTax], syncedAt);
      return;
    }

    if (remoteWarehouse && isRemoteWarehouseDto(currentQueueItem.payload)) {
      await markQueueItemSynced(currentQueueItem.id, syncedAt);
      await updateWarehouseSyncMetadata(currentQueueItem.entity_id, currentQueueItem.payload.updated_at, {
        sync_status: 'synced',
        sync_error: undefined,
        last_synced_at: syncedAt,
        remote_updated_at: remoteWarehouse.updated_at,
      });
      await mergeRemoteWarehousesIntoDexie([remoteWarehouse], syncedAt);
      return;
    }

    await markQueueItemPending(currentQueueItem.id);
  } catch (error) {
    await markQueueItemFailed(currentQueueItem, error);
    console.error('Failed to process PostgreSQL sync queue item', error);
  }
};

export const processPendingSyncQueue = async (limit = SYNC_QUEUE_BATCH_SIZE) => {
  if (isProcessingSyncQueue || !isTauriRuntime()) return;

  isProcessingSyncQueue = true;
  try {
    await recoverStaleProcessingSyncQueueItems();

    const isPostgresAvailable = await isPostgresAvailableForSync();
    if (!isPostgresAvailable) return;

    const pendingQueueItems = (await db.syncQueue
      .where('status')
      .equals('pending')
      .sortBy('created_at'))
      .slice(0, limit);

    for (const queueItem of pendingQueueItems) {
      await processSyncQueueItem(queueItem);
    }
  } finally {
    isProcessingSyncQueue = false;
  }

  const pendingQueueCount = await db.syncQueue.where('status').equals('pending').count();
  if (pendingQueueCount > 0) {
    void processPendingSyncQueue(limit);
  }
};

export const enqueueActivityLogSync = async (log: ActivityLog) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: ACTIVITY_LOG_ENTITY,
    entity_id: log.id,
    operation: 'create',
    payload: mapActivityLogToRemoteDto(log),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueAuthUserSync = async (
  user: AuthUser,
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: AUTH_USER_ENTITY,
    entity_id: user.id,
    operation,
    payload: mapAuthUserToRemoteDto(user),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueRoleSync = async (
  role: Role,
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: ROLE_ENTITY,
    entity_id: role.id,
    operation,
    payload: mapRoleToRemoteDto(role),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueRolePermissionSync = async (
  permission: RolePermission,
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: ROLE_PERMISSION_ENTITY,
    entity_id: permission.id,
    operation,
    payload: mapRolePermissionToRemoteDto(permission),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueRolePermissionDeleteSync = async (
  permission: RolePermission,
  deletedAt: string,
) => {
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: ROLE_PERMISSION_ENTITY,
    entity_id: permission.id,
    operation: 'update',
    payload: mapDeletedRolePermissionToRemoteDto(permission, deletedAt),
    status: 'pending',
    attempts: 0,
    created_at: deletedAt,
    updated_at: deletedAt,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueuePendingRolesForSync = async () => {
  const roles = (await db.roles.toArray())
    .filter((role) => role.sync_status === 'pending' || role.sync_status === 'failed');

  for (const role of roles) {
    const existingQueueItem = (await db.syncQueue
      .where('entity')
      .equals(ROLE_ENTITY)
      .toArray())
      .find((queueItem) => (
        queueItem.entity_id === role.id &&
        queueItem.status !== 'synced' &&
        isRemoteRoleDto(queueItem.payload) &&
        queueItem.payload.updated_at === role.updated_at
      ));

    if (!existingQueueItem) {
      await enqueueRoleSync(role, 'update');
    }
  }
};

export const enqueuePendingRolePermissionsForSync = async () => {
  const permissions = (await db.rolePermissions.toArray())
    .filter((permission) => permission.sync_status === 'pending' || permission.sync_status === 'failed');

  for (const permission of permissions) {
    const existingQueueItem = (await db.syncQueue
      .where('entity')
      .equals(ROLE_PERMISSION_ENTITY)
      .toArray())
      .find((queueItem) => (
        queueItem.entity_id === permission.id &&
        queueItem.status !== 'synced' &&
        isRemoteRolePermissionDto(queueItem.payload) &&
        queueItem.payload.updated_at === permission.updated_at
      ));

    if (!existingQueueItem) {
      await enqueueRolePermissionSync(permission, 'update');
    }
  }
};

export const enqueuePendingAuthUsersForSync = async () => {
  const authUsers = (await db.authUsers.toArray())
    .filter((user) => user.sync_status === 'pending' || user.sync_status === 'failed');

  for (const user of authUsers) {
    const existingQueueItem = (await db.syncQueue
      .where('entity')
      .equals(AUTH_USER_ENTITY)
      .toArray())
      .find((queueItem) => (
        queueItem.entity_id === user.id &&
        queueItem.status !== 'synced' &&
        isRemoteAuthUserDto(queueItem.payload) &&
        queueItem.payload.updated_at === user.updated_at
      ));

    if (!existingQueueItem) {
      await enqueueAuthUserSync(user, 'update');
    }
  }
};

export const enqueueContactSync = async (
  contact: Contact,
  operation: SyncQueueOperation,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: CONTACT_ENTITY,
    entity_id: contact.id,
    operation,
    payload: mapContactToRemoteDto(contact),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueuePendingContactsForSync = async () => {
  const contacts = (await db.contacts.toArray())
    .filter((contact) => contact.sync_status === 'pending' || contact.sync_status === 'failed');

  const contactQueueItems = await db.syncQueue
    .where('entity')
    .equals(CONTACT_ENTITY)
    .toArray();

  for (const contact of contacts) {
    const existingQueueItem = contactQueueItems.find((queueItem) => (
      queueItem.entity_id === contact.id &&
      queueItem.status !== 'synced' &&
      isRemoteContactDto(queueItem.payload) &&
      queueItem.payload.updated_at === contact.updated_at
    ));

    if (!existingQueueItem) {
      await enqueueContactSync(contact, 'update');
    }
  }
};

export const enqueueCooperativeMemberSync = async (
  member: CooperativeMember,
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: COOPERATIVE_MEMBER_ENTITY,
    entity_id: member.id,
    operation,
    payload: mapCooperativeMemberToRemoteDto(member),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueCooperativeAreaSync = async (
  area: CooperativeArea,
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: COOPERATIVE_AREA_ENTITY,
    entity_id: area.id,
    operation,
    payload: mapCooperativeAreaToRemoteDto(area),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueCooperativeSavingTransactionSync = async (
  transaction: CooperativeSavingTransaction,
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: COOPERATIVE_SAVING_TRANSACTION_ENTITY,
    entity_id: transaction.id,
    operation,
    payload: mapCooperativeSavingTransactionToRemoteDto(transaction),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueCooperativeMemberSavingBalanceSync = async (
  balance: CooperativeMemberSavingBalance,
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: COOPERATIVE_MEMBER_SAVING_BALANCE_ENTITY,
    entity_id: balance.id,
    operation,
    payload: mapCooperativeMemberSavingBalanceToRemoteDto(balance),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueCooperativeLoanSync = async (
  loan: CooperativeLoan,
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: COOPERATIVE_LOAN_ENTITY,
    entity_id: loan.id,
    operation,
    payload: mapCooperativeLoanToRemoteDto(loan),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueCooperativeLoanInstallmentSync = async (
  installment: CooperativeLoanInstallment,
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: COOPERATIVE_LOAN_INSTALLMENT_ENTITY,
    entity_id: installment.id,
    operation,
    payload: mapCooperativeLoanInstallmentToRemoteDto(installment),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueCooperativeLoanCollectionEventSync = async (
  event: CooperativeLoanCollectionEvent,
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: COOPERATIVE_LOAN_COLLECTION_EVENT_ENTITY,
    entity_id: event.id,
    operation,
    payload: mapCooperativeLoanCollectionEventToRemoteDto(event),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueCooperativeLoanPaymentSync = async (
  payment: CooperativeLoanPayment,
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: COOPERATIVE_LOAN_PAYMENT_ENTITY,
    entity_id: payment.id,
    operation,
    payload: mapCooperativeLoanPaymentToRemoteDto(payment),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueuePendingCooperativeDataForSync = async () => {
  const [
    areaQueueItems,
    memberQueueItems,
    savingTransactionQueueItems,
    savingBalanceQueueItems,
    loanQueueItems,
    loanInstallmentQueueItems,
    loanCollectionEventQueueItems,
    loanPaymentQueueItems,
  ] = await Promise.all([
    db.syncQueue.where('entity').equals(COOPERATIVE_AREA_ENTITY).toArray(),
    db.syncQueue.where('entity').equals(COOPERATIVE_MEMBER_ENTITY).toArray(),
    db.syncQueue.where('entity').equals(COOPERATIVE_SAVING_TRANSACTION_ENTITY).toArray(),
    db.syncQueue.where('entity').equals(COOPERATIVE_MEMBER_SAVING_BALANCE_ENTITY).toArray(),
    db.syncQueue.where('entity').equals(COOPERATIVE_LOAN_ENTITY).toArray(),
    db.syncQueue.where('entity').equals(COOPERATIVE_LOAN_INSTALLMENT_ENTITY).toArray(),
    db.syncQueue.where('entity').equals(COOPERATIVE_LOAN_COLLECTION_EVENT_ENTITY).toArray(),
    db.syncQueue.where('entity').equals(COOPERATIVE_LOAN_PAYMENT_ENTITY).toArray(),
  ]);

  const areas = (await db.cooperativeAreas.toArray())
    .filter((area) => area.sync_status === 'pending' || area.sync_status === 'failed');
  for (const area of areas) {
    const existingQueueItem = areaQueueItems.find((queueItem) => (
      queueItem.entity_id === area.id &&
      queueItem.status !== 'synced' &&
      isRemoteCooperativeAreaDto(queueItem.payload) &&
      queueItem.payload.updated_at === area.updated_at
    ));

    if (!existingQueueItem) {
      await enqueueCooperativeAreaSync(area, 'update');
    }
  }

  const members = (await db.cooperativeMembers.toArray())
    .filter((member) => member.sync_status === 'pending' || member.sync_status === 'failed');
  for (const member of members) {
    const existingQueueItem = memberQueueItems.find((queueItem) => (
      queueItem.entity_id === member.id &&
      queueItem.status !== 'synced' &&
      isRemoteCooperativeMemberDto(queueItem.payload) &&
      queueItem.payload.updated_at === member.updated_at
    ));

    if (!existingQueueItem) {
      await enqueueCooperativeMemberSync(member, 'update');
    }
  }

  const savingTransactions = (await db.cooperativeSavingTransactions.toArray())
    .filter((transaction) => transaction.sync_status === 'pending' || transaction.sync_status === 'failed');
  for (const transaction of savingTransactions) {
    const existingQueueItem = savingTransactionQueueItems.find((queueItem) => (
      queueItem.entity_id === transaction.id &&
      queueItem.status !== 'synced' &&
      isRemoteCooperativeSavingTransactionDto(queueItem.payload) &&
      queueItem.payload.updated_at === transaction.updated_at
    ));

    if (!existingQueueItem) {
      await enqueueCooperativeSavingTransactionSync(transaction, 'update');
    }
  }

  const savingBalances = (await db.cooperativeMemberSavingBalances.toArray())
    .filter((balance) => balance.sync_status === 'pending' || balance.sync_status === 'failed');
  for (const balance of savingBalances) {
    const existingQueueItem = savingBalanceQueueItems.find((queueItem) => (
      queueItem.entity_id === balance.id &&
      queueItem.status !== 'synced' &&
      isRemoteCooperativeMemberSavingBalanceDto(queueItem.payload) &&
      queueItem.payload.updated_at === balance.updated_at
    ));

    if (!existingQueueItem) {
      await enqueueCooperativeMemberSavingBalanceSync(balance, 'update');
    }
  }

  const loans = (await db.cooperativeLoans.toArray())
    .filter((loan) => loan.sync_status === 'pending' || loan.sync_status === 'failed');
  for (const loan of loans) {
    const existingQueueItem = loanQueueItems.find((queueItem) => (
      queueItem.entity_id === loan.id &&
      queueItem.status !== 'synced' &&
      isRemoteCooperativeLoanDto(queueItem.payload) &&
      queueItem.payload.updated_at === loan.updated_at
    ));

    if (!existingQueueItem) {
      await enqueueCooperativeLoanSync(loan, 'update');
    }
  }

  const loanInstallments = (await db.cooperativeLoanInstallments.toArray())
    .filter((installment) => installment.sync_status === 'pending' || installment.sync_status === 'failed');
  for (const installment of loanInstallments) {
    const existingQueueItem = loanInstallmentQueueItems.find((queueItem) => (
      queueItem.entity_id === installment.id &&
      queueItem.status !== 'synced' &&
      isRemoteCooperativeLoanInstallmentDto(queueItem.payload) &&
      queueItem.payload.updated_at === installment.updated_at
    ));

    if (!existingQueueItem) {
      await enqueueCooperativeLoanInstallmentSync(installment, 'update');
    }
  }

  const loanCollectionEvents = (await db.cooperativeLoanCollectionEvents.toArray())
    .filter((event) => event.sync_status === 'pending' || event.sync_status === 'failed');
  for (const event of loanCollectionEvents) {
    const existingQueueItem = loanCollectionEventQueueItems.find((queueItem) => (
      queueItem.entity_id === event.id &&
      queueItem.status !== 'synced' &&
      isRemoteCooperativeLoanCollectionEventDto(queueItem.payload) &&
      queueItem.payload.created_at === event.created_at
    ));

    if (
      existingQueueItem?.status === 'failed' &&
      existingQueueItem.error_message === MISSING_SERVER_SESSION_TOKEN_SYNC_ERROR &&
      await getCurrentSyncServerSessionToken()
    ) {
      const now = new Date().toISOString();
      await db.syncQueue.update(existingQueueItem.id, {
        status: 'pending',
        attempts: 0,
        error_message: undefined,
        updated_at: now,
      });
      await updateCooperativeLoanCollectionEventSyncMetadata(event.id, event.created_at, {
        sync_status: 'pending',
        sync_error: undefined,
      });
    } else if (!existingQueueItem) {
      await enqueueCooperativeLoanCollectionEventSync(event, 'create');
    }
  }

  const loanPayments = (await db.cooperativeLoanPayments.toArray())
    .filter((payment) => payment.sync_status === 'pending' || payment.sync_status === 'failed');
  for (const payment of loanPayments) {
    const existingQueueItem = loanPaymentQueueItems.find((queueItem) => (
      queueItem.entity_id === payment.id &&
      queueItem.status !== 'synced' &&
      isRemoteCooperativeLoanPaymentDto(queueItem.payload) &&
      queueItem.payload.updated_at === payment.updated_at
    ));

    if (!existingQueueItem) {
      await enqueueCooperativeLoanPaymentSync(payment, 'update');
    }
  }
};

export const enqueueCurrencySync = async (
  currency: Currency,
  operation: SyncQueueOperation,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: CURRENCY_ENTITY,
    entity_id: currency.id,
    operation,
    payload: mapCurrencyToRemoteDto(currency),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueCurrencyRateSync = async (
  rate: CurrencyRate,
  operation: SyncQueueOperation,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: CURRENCY_RATE_ENTITY,
    entity_id: rate.id,
    operation,
    payload: mapCurrencyRateToRemoteDto(rate),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueChartOfAccountSync = async (
  account: ChartOfAccount,
  operation: SyncQueueOperation,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: CHART_OF_ACCOUNT_ENTITY,
    entity_id: account.id,
    operation,
    payload: mapChartOfAccountToRemoteDto(account),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueuePendingChartOfAccountsForSync = async () => {
  const accountQueueItems = await db.syncQueue
    .where('entity')
    .equals(CHART_OF_ACCOUNT_ENTITY)
    .toArray();

  const accounts = (await db.chartOfAccounts.toArray())
    .filter((account) => account.sync_status === 'pending' || account.sync_status === 'failed');
  for (const account of accounts) {
    const existingQueueItem = accountQueueItems.find((queueItem) => (
      queueItem.entity_id === account.id &&
      queueItem.status !== 'synced' &&
      isRemoteChartOfAccountDto(queueItem.payload) &&
      queueItem.payload.updated_at === account.updated_at
    ));

    if (!existingQueueItem) {
      await enqueueChartOfAccountSync(account, 'update');
    }
  }
};

export const enqueueFinanceAccountMappingSync = async (
  mapping: FinanceAccountMapping,
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: FINANCE_ACCOUNT_MAPPING_ENTITY,
    entity_id: mapping.id,
    operation,
    payload: mapFinanceAccountMappingToRemoteDto(mapping),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueAccountingProfileSettingSync = async (
  setting: AccountingProfileSetting,
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: ACCOUNTING_PROFILE_SETTING_ENTITY,
    entity_id: setting.id,
    operation,
    payload: mapAccountingProfileSettingToRemoteDto(setting),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueAccountingInitialSetupSettingSync = async (
  setting: AccountingInitialSetupSetting,
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: ACCOUNTING_INITIAL_SETUP_SETTING_ENTITY,
    entity_id: setting.id,
    operation,
    payload: mapAccountingInitialSetupSettingToRemoteDto(setting),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueEnabledModuleSync = async (
  module: EnabledModule,
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: ENABLED_MODULE_ENTITY,
    entity_id: module.id,
    operation,
    payload: mapEnabledModuleToRemoteDto(module),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueGeneralLedgerSettingSync = async (
  setting: GeneralLedgerSetting,
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: GENERAL_LEDGER_SETTING_ENTITY,
    entity_id: setting.id,
    operation,
    payload: mapGeneralLedgerSettingToRemoteDto(setting),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueuePendingAccountingSettingsForSync = async () => {
  const [
    mappingQueueItems,
    profileQueueItems,
    initialSetupQueueItems,
    moduleQueueItems,
    glQueueItems,
  ] = await Promise.all([
    db.syncQueue.where('entity').equals(FINANCE_ACCOUNT_MAPPING_ENTITY).toArray(),
    db.syncQueue.where('entity').equals(ACCOUNTING_PROFILE_SETTING_ENTITY).toArray(),
    db.syncQueue.where('entity').equals(ACCOUNTING_INITIAL_SETUP_SETTING_ENTITY).toArray(),
    db.syncQueue.where('entity').equals(ENABLED_MODULE_ENTITY).toArray(),
    db.syncQueue.where('entity').equals(GENERAL_LEDGER_SETTING_ENTITY).toArray(),
  ]);

  const mappings = (await db.financeAccountMappings.toArray())
    .filter((mapping) => mapping.sync_status === 'pending' || mapping.sync_status === 'failed');
  for (const mapping of mappings) {
    const existing = mappingQueueItems.find((queueItem) => (
      queueItem.entity_id === mapping.id &&
      queueItem.status !== 'synced' &&
      isRemoteFinanceAccountMappingDto(queueItem.payload) &&
      queueItem.payload.updated_at === mapping.updated_at
    ));
    if (!existing) await enqueueFinanceAccountMappingSync(mapping, 'update');
  }

  const profiles = (await db.accountingProfileSetting.toArray())
    .filter((profile) => profile.sync_status === 'pending' || profile.sync_status === 'failed');
  for (const profile of profiles) {
    const existing = profileQueueItems.find((queueItem) => (
      queueItem.entity_id === profile.id &&
      queueItem.status !== 'synced' &&
      isRemoteAccountingProfileSettingDto(queueItem.payload) &&
      queueItem.payload.updated_at === profile.updated_at
    ));
    if (!existing) await enqueueAccountingProfileSettingSync(profile, 'update');
  }

  const initialSetupSettings = (await db.accountingInitialSetupSetting.toArray())
    .filter((setting) => setting.sync_status === 'pending' || setting.sync_status === 'failed');
  for (const setting of initialSetupSettings) {
    const existing = initialSetupQueueItems.find((queueItem) => (
      queueItem.entity_id === setting.id &&
      queueItem.status !== 'synced' &&
      isRemoteAccountingInitialSetupSettingDto(queueItem.payload) &&
      queueItem.payload.updated_at === setting.updated_at
    ));
    if (!existing) await enqueueAccountingInitialSetupSettingSync(setting, 'update');
  }

  const modules = (await db.enabledModules.toArray())
    .filter((module) => module.sync_status === 'pending' || module.sync_status === 'failed');
  for (const module of modules) {
    const existing = moduleQueueItems.find((queueItem) => (
      queueItem.entity_id === module.id &&
      queueItem.status !== 'synced' &&
      isRemoteEnabledModuleDto(queueItem.payload) &&
      queueItem.payload.updated_at === module.updated_at
    ));
    if (!existing) await enqueueEnabledModuleSync(module, 'update');
  }

  const glSettings = (await db.generalLedgerSetting.toArray())
    .filter((setting) => setting.sync_status === 'pending' || setting.sync_status === 'failed');
  for (const setting of glSettings) {
    const existing = glQueueItems.find((queueItem) => (
      queueItem.entity_id === setting.id &&
      queueItem.status !== 'synced' &&
      isRemoteGeneralLedgerSettingDto(queueItem.payload) &&
      queueItem.payload.updated_at === setting.updated_at
    ));
    if (!existing) await enqueueGeneralLedgerSettingSync(setting, 'update');
  }
};

export const enqueueCashierSessionSync = async (
  session: CashierSession,
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: CASHIER_SESSION_ENTITY,
    entity_id: session.id,
    operation,
    payload: mapCashierSessionToRemoteDto(session),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueuePendingCashierSessionsForSync = async () => {
  const sessions = (await db.cashierSessions.toArray())
    .filter((session) => session.sync_status === 'pending' || session.sync_status === 'failed');
  const queueItems = await db.syncQueue
    .where('entity')
    .equals(CASHIER_SESSION_ENTITY)
    .toArray();

  for (const session of sessions) {
    const existingQueueItem = queueItems.find((queueItem) => (
      queueItem.entity_id === session.id &&
      queueItem.status !== 'synced' &&
      isRemoteCashierSessionDto(queueItem.payload) &&
      queueItem.payload.updated_at === session.updated_at
    ));

    if (!existingQueueItem) {
      await enqueueCashierSessionSync(session, 'update');
    }
  }
};

export const enqueueDepartmentSync = async (
  department: Department,
  operation: SyncQueueOperation,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: DEPARTMENT_ENTITY,
    entity_id: department.id,
    operation,
    payload: mapDepartmentToRemoteDto(department),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueEmployeeSync = async (
  employee: Employee,
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: EMPLOYEE_ENTITY,
    entity_id: employee.id,
    operation,
    payload: mapEmployeeToRemoteDto(employee),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueEmployeeAreaSync = async (
  assignment: EmployeeArea,
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: EMPLOYEE_AREA_ENTITY,
    entity_id: assignment.id,
    operation,
    payload: mapEmployeeAreaToRemoteDto(assignment),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueEmployeeAreaDeleteSync = async (
  assignment: EmployeeArea,
  deletedAt: string,
) => {
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: EMPLOYEE_AREA_ENTITY,
    entity_id: assignment.id,
    operation: 'delete',
    payload: mapDeletedEmployeeAreaToRemoteDto(assignment, deletedAt),
    status: 'pending',
    attempts: 0,
    created_at: deletedAt,
    updated_at: deletedAt,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueEmployeeCollectionScheduleSync = async (
  schedule: EmployeeCollectionSchedule,
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: EMPLOYEE_COLLECTION_SCHEDULE_ENTITY,
    entity_id: schedule.id,
    operation,
    payload: mapEmployeeCollectionScheduleToRemoteDto(schedule),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueEmployeeCollectionScheduleDeleteSync = async (
  schedule: EmployeeCollectionSchedule,
  deletedAt: string,
) => {
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: EMPLOYEE_COLLECTION_SCHEDULE_ENTITY,
    entity_id: schedule.id,
    operation: 'delete',
    payload: mapDeletedEmployeeCollectionScheduleToRemoteDto(schedule, deletedAt),
    status: 'pending',
    attempts: 0,
    created_at: deletedAt,
    updated_at: deletedAt,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueuePendingEmployeesForSync = async () => {
  const [
    employeeQueueItems,
    employeeAreaQueueItems,
    employeeCollectionScheduleQueueItems,
  ] = await Promise.all([
    db.syncQueue.where('entity').equals(EMPLOYEE_ENTITY).toArray(),
    db.syncQueue.where('entity').equals(EMPLOYEE_AREA_ENTITY).toArray(),
    db.syncQueue.where('entity').equals(EMPLOYEE_COLLECTION_SCHEDULE_ENTITY).toArray(),
  ]);

  const employees = (await db.employees.toArray())
    .filter((employee) => employee.sync_status === 'pending' || employee.sync_status === 'failed');
  for (const employee of employees) {
    const existingQueueItem = employeeQueueItems.find((queueItem) => (
      queueItem.entity_id === employee.id &&
      queueItem.status !== 'synced' &&
      isRemoteEmployeeDto(queueItem.payload) &&
      queueItem.payload.updated_at === employee.updated_at
    ));

    if (!existingQueueItem) {
      await enqueueEmployeeSync(employee, 'update');
    }
  }

  const assignments = (await db.employeeAreas.toArray())
    .filter((assignment) => assignment.sync_status === 'pending' || assignment.sync_status === 'failed');
  for (const assignment of assignments) {
    const existingQueueItem = employeeAreaQueueItems.find((queueItem) => (
      queueItem.entity_id === assignment.id &&
      queueItem.status !== 'synced' &&
      isRemoteEmployeeAreaDto(queueItem.payload) &&
      queueItem.payload.updated_at === assignment.updated_at
    ));

    if (!existingQueueItem) {
      await enqueueEmployeeAreaSync(assignment, 'update');
    }
  }

  const schedules = (await db.employeeCollectionSchedules.toArray())
    .filter((schedule) => schedule.sync_status === 'pending' || schedule.sync_status === 'failed');
  for (const schedule of schedules) {
    const existingQueueItem = employeeCollectionScheduleQueueItems.find((queueItem) => (
      queueItem.entity_id === schedule.id &&
      queueItem.status !== 'synced' &&
      isRemoteEmployeeCollectionScheduleDto(queueItem.payload) &&
      queueItem.payload.updated_at === schedule.updated_at
    ));

    if (!existingQueueItem) {
      await enqueueEmployeeCollectionScheduleSync(schedule, 'update');
    }
  }
};

export const enqueuePayrollRunBundleSync = async (
  run: PayrollRun,
  items: PayrollRunItem[],
  cashAdvanceRepayments: EmployeeCashAdvanceRepayment[],
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: PAYROLL_RUN_ENTITY,
    entity_id: run.id,
    operation,
    payload: mapPayrollRunBundleToRemoteDto(run, items, cashAdvanceRepayments),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueEmployeeCashAdvanceBundleSync = async (
  cashAdvance: EmployeeCashAdvance,
  repayments: EmployeeCashAdvanceRepayment[],
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: EMPLOYEE_CASH_ADVANCE_ENTITY,
    entity_id: cashAdvance.id,
    operation,
    payload: mapEmployeeCashAdvanceBundleToRemoteDto(cashAdvance, repayments),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueuePendingPayrollDataForSync = async () => {
  const [
    payrollRunQueueItems,
    cashAdvanceQueueItems,
  ] = await Promise.all([
    db.syncQueue.where('entity').equals(PAYROLL_RUN_ENTITY).toArray(),
    db.syncQueue.where('entity').equals(EMPLOYEE_CASH_ADVANCE_ENTITY).toArray(),
  ]);

  const payrollRuns = (await db.payrollRuns.toArray())
    .filter((run) => run.sync_status === 'pending' || run.sync_status === 'failed');
  for (const run of payrollRuns) {
    const existingQueueItem = payrollRunQueueItems.find((queueItem) => (
      queueItem.entity_id === run.id &&
      queueItem.status !== 'synced' &&
      isRemotePayrollRunBundleDto(queueItem.payload) &&
      queueItem.payload.run.updated_at === run.updated_at
    ));

    if (!existingQueueItem) {
      const [items, repayments] = await Promise.all([
        db.payrollRunItems.where('payroll_run_id').equals(run.id).toArray(),
        db.employeeCashAdvanceRepayments.where('payroll_run_id').equals(run.id).toArray(),
      ]);
      await enqueuePayrollRunBundleSync(run, items, repayments, 'update');
    }
  }

  const cashAdvances = (await db.employeeCashAdvances.toArray())
    .filter((cashAdvance) => cashAdvance.sync_status === 'pending' || cashAdvance.sync_status === 'failed');
  for (const cashAdvance of cashAdvances) {
    const existingQueueItem = cashAdvanceQueueItems.find((queueItem) => (
      queueItem.entity_id === cashAdvance.id &&
      queueItem.status !== 'synced' &&
      isRemoteEmployeeCashAdvanceBundleDto(queueItem.payload) &&
      queueItem.payload.cash_advance.updated_at === cashAdvance.updated_at
    ));

    if (!existingQueueItem) {
      const repayments = await db.employeeCashAdvanceRepayments
        .where('cash_advance_id')
        .equals(cashAdvance.id)
        .toArray();
      await enqueueEmployeeCashAdvanceBundleSync(cashAdvance, repayments, 'update');
    }
  }
};

export const enqueueFinanceTransactionSync = async (
  transaction: FinanceTransaction,
  operation: Extract<SyncQueueOperation, 'create' | 'update' | 'delete'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: FINANCE_TRANSACTION_ENTITY,
    entity_id: transaction.id,
    operation,
    payload: mapFinanceTransactionToRemoteDto(transaction),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueCashBankReconciliationSync = async (
  reconciliation: CashBankReconciliation,
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: CASH_BANK_RECONCILIATION_ENTITY,
    entity_id: reconciliation.id,
    operation,
    payload: mapCashBankReconciliationToRemoteDto(reconciliation),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueAccountingPeriodSync = async (
  period: AccountingPeriod,
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: ACCOUNTING_PERIOD_ENTITY,
    entity_id: period.id,
    operation,
    payload: mapAccountingPeriodToRemoteDto(period),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueClosingRunSync = async (
  run: ClosingRun,
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: CLOSING_RUN_ENTITY,
    entity_id: run.id,
    operation,
    payload: mapClosingRunToRemoteDto(run),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueuePendingFinanceTransactionsForSync = async () => {
  const financeTransactions = (await db.financeTransactions.toArray())
    .filter((transaction) => transaction.sync_status === 'pending' || transaction.sync_status === 'failed');

  const financeTransactionQueueItems = await db.syncQueue
    .where('entity')
    .equals(FINANCE_TRANSACTION_ENTITY)
    .toArray();

  for (const transaction of financeTransactions) {
    const sourceUpdatedAt = transaction.updated_at ?? transaction.created_at;
    const existingQueueItem = financeTransactionQueueItems.find((queueItem) => (
      queueItem.entity_id === transaction.id &&
      queueItem.status !== 'synced' &&
      isRemoteFinanceTransactionDto(queueItem.payload) &&
      queueItem.payload.updated_at === sourceUpdatedAt &&
      queueItem.payload.version === (transaction.version ?? 1)
    ));

    if (!existingQueueItem) {
      await enqueueFinanceTransactionSync(transaction, 'update');
    }
  }
};

export const enqueuePendingCashBankReconciliationsForSync = async () => {
  const reconciliations = (await db.cashBankReconciliations.toArray())
    .filter((reconciliation) => (
      reconciliation.sync_status === 'pending' ||
      reconciliation.sync_status === 'failed'
    ));

  const queueItems = await db.syncQueue
    .where('entity')
    .equals(CASH_BANK_RECONCILIATION_ENTITY)
    .toArray();

  for (const reconciliation of reconciliations) {
    const existingQueueItem = queueItems.find((queueItem) => (
      queueItem.entity_id === reconciliation.id &&
      queueItem.status !== 'synced' &&
      isRemoteCashBankReconciliationDto(queueItem.payload) &&
      queueItem.payload.updated_at === reconciliation.updated_at &&
      queueItem.payload.version === (reconciliation.version ?? 1)
    ));

    if (!existingQueueItem) {
      await enqueueCashBankReconciliationSync(reconciliation, 'update');
    }
  }
};

export const enqueuePendingAccountingPeriodsForSync = async () => {
  const periods = (await db.accountingPeriods.toArray())
    .filter((period) => (
      period.sync_status === 'pending' ||
      period.sync_status === 'failed'
    ));

  const queueItems = await db.syncQueue
    .where('entity')
    .equals(ACCOUNTING_PERIOD_ENTITY)
    .toArray();

  for (const period of periods) {
    const existingQueueItem = queueItems.find((queueItem) => (
      queueItem.entity_id === period.id &&
      queueItem.status !== 'synced' &&
      isRemoteAccountingPeriodDto(queueItem.payload) &&
      queueItem.payload.updated_at === period.updated_at &&
      queueItem.payload.version === (period.version ?? 1)
    ));

    if (!existingQueueItem) {
      await enqueueAccountingPeriodSync(period, 'update');
    }
  }
};

export const enqueuePendingClosingRunsForSync = async () => {
  const runs = (await db.closingRuns.toArray())
    .filter((run) => (
      run.sync_status === 'pending' ||
      run.sync_status === 'failed'
    ));

  const queueItems = await db.syncQueue
    .where('entity')
    .equals(CLOSING_RUN_ENTITY)
    .toArray();

  for (const run of runs) {
    const existingQueueItem = queueItems.find((queueItem) => (
      queueItem.entity_id === run.id &&
      queueItem.status !== 'synced' &&
      isRemoteClosingRunDto(queueItem.payload) &&
      queueItem.payload.updated_at === run.updated_at &&
      queueItem.payload.version === (run.version ?? 1)
    ));

    if (!existingQueueItem) {
      await enqueueClosingRunSync(run, 'update');
    }
  }
};

export const enqueueJournalEntryBundleSync = async (
  entry: JournalEntry,
  lines: JournalEntryLine[],
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: JOURNAL_ENTRY_ENTITY,
    entity_id: entry.id,
    operation,
    payload: mapJournalEntryBundleToRemoteDto(entry, lines),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueOpeningBalanceBundleSync = async (
  batch: OpeningBalanceBatch,
  lines: OpeningBalanceLine[],
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: OPENING_BALANCE_ENTITY,
    entity_id: batch.id,
    operation,
    payload: mapOpeningBalanceBundleToRemoteDto(batch, lines),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueuePendingJournalEntriesForSync = async () => {
  const journalEntries = (await db.journalEntries.toArray())
    .filter((entry) => entry.sync_status === 'pending' || entry.sync_status === 'failed');

  const journalEntryQueueItems = await db.syncQueue
    .where('entity')
    .equals(JOURNAL_ENTRY_ENTITY)
    .toArray();

  for (const entry of journalEntries) {
    const existingQueueItem = journalEntryQueueItems.find((queueItem) => (
      queueItem.entity_id === entry.id &&
      queueItem.status !== 'synced' &&
      isRemoteJournalEntryBundleDto(queueItem.payload) &&
      queueItem.payload.entry.updated_at === entry.updated_at &&
      queueItem.payload.entry.version === (entry.version ?? 1)
    ));

    if (!existingQueueItem) {
      const lines = await db.journalEntryLines.where('journal_entry_id').equals(entry.id).toArray();
      await enqueueJournalEntryBundleSync(entry, lines, 'update');
    }
  }
};

export const enqueuePendingOpeningBalancesForSync = async () => {
  const batches = (await db.openingBalanceBatches.toArray())
    .filter((batch) => batch.sync_status === 'pending' || batch.sync_status === 'failed');

  const openingBalanceQueueItems = await db.syncQueue
    .where('entity')
    .equals(OPENING_BALANCE_ENTITY)
    .toArray();

  for (const batch of batches) {
    const existingQueueItem = openingBalanceQueueItems.find((queueItem) => (
      queueItem.entity_id === batch.id &&
      queueItem.status !== 'synced' &&
      isRemoteOpeningBalanceBundleDto(queueItem.payload) &&
      queueItem.payload.batch.updated_at === batch.updated_at &&
      queueItem.payload.batch.version === (batch.version ?? 1)
    ));

    if (!existingQueueItem) {
      const lines = await db.openingBalanceLines.where('batch_id').equals(batch.id).toArray();
      await enqueueOpeningBalanceBundleSync(batch, lines, 'update');
    }
  }
};

export const enqueueProjectSync = async (
  project: Project,
  operation: SyncQueueOperation,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: PROJECT_ENTITY,
    entity_id: project.id,
    operation,
    payload: mapProjectToRemoteDto(project),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueProductSync = async (
  product: Product,
  operation: SyncQueueOperation,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: PRODUCT_ENTITY,
    entity_id: product.id,
    operation,
    payload: mapProductToRemoteDto(product),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueSalesDocumentBundleSync = async (
  document: SalesDocument,
  items: SalesDocumentItem[],
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: SALES_DOCUMENT_ENTITY,
    entity_id: document.id,
    operation,
    payload: mapSalesDocumentBundleToRemoteDto(document, items),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueStockOpnameBundleSync = async (
  opname: StockOpname,
  items: StockOpnameItem[],
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: STOCK_OPNAME_ENTITY,
    entity_id: opname.id,
    operation,
    payload: mapStockOpnameBundleToRemoteDto(opname, items),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueProductionOrderBundleSync = async (
  order: ProductionOrder,
  items: ProductionOrderItem[],
  costs: ProductionOrderCost[],
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: PRODUCTION_ORDER_ENTITY,
    entity_id: order.id,
    operation,
    payload: mapProductionOrderBundleToRemoteDto(order, items, costs),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueuePurchaseDocumentBundleSync = async (
  document: PurchaseDocument,
  items: PurchaseDocumentItem[],
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: PURCHASE_DOCUMENT_ENTITY,
    entity_id: document.id,
    operation,
    payload: mapPurchaseDocumentBundleToRemoteDto(document, items),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueuePendingPurchaseDocumentsForSync = async () => {
  const purchaseDocuments = (await db.purchaseDocuments.toArray())
    .filter((document) => document.sync_status === 'pending' || document.sync_status === 'failed');

  const purchaseDocumentQueueItems = await db.syncQueue
    .where('entity')
    .equals(PURCHASE_DOCUMENT_ENTITY)
    .toArray();

  for (const document of purchaseDocuments) {
    const existingQueueItem = purchaseDocumentQueueItems.find((queueItem) => (
      queueItem.entity_id === document.id &&
      queueItem.status !== 'synced' &&
      isRemotePurchaseDocumentBundleDto(queueItem.payload) &&
      queueItem.payload.document.updated_at === document.updated_at &&
      queueItem.payload.document.version === (document.version ?? 1)
    ));

    if (!existingQueueItem) {
      const items = await db.purchaseDocumentItems.where('document_id').equals(document.id).toArray();
      await enqueuePurchaseDocumentBundleSync(document, items, 'update');
    }
  }
};

export const enqueuePendingSalesDocumentsForSync = async () => {
  const salesDocuments = (await db.salesDocuments.toArray())
    .filter((document) => document.sync_status === 'pending' || document.sync_status === 'failed');

  const salesDocumentQueueItems = await db.syncQueue
    .where('entity')
    .equals(SALES_DOCUMENT_ENTITY)
    .toArray();

  for (const document of salesDocuments) {
    const existingQueueItem = salesDocumentQueueItems.find((queueItem) => (
      queueItem.entity_id === document.id &&
      queueItem.status !== 'synced' &&
      isRemoteSalesDocumentBundleDto(queueItem.payload) &&
      queueItem.payload.document.updated_at === document.updated_at &&
      queueItem.payload.document.version === (document.version ?? 1)
    ));

    if (!existingQueueItem) {
      const items = await db.salesDocumentItems.where('document_id').equals(document.id).toArray();
      await enqueueSalesDocumentBundleSync(document, items, 'update');
    }
  }
};

export const enqueuePendingStockOpnamesForSync = async () => {
  const stockOpnames = (await db.stockOpnames.toArray())
    .filter((opname) => opname.sync_status === 'pending' || opname.sync_status === 'failed');

  const stockOpnameQueueItems = await db.syncQueue
    .where('entity')
    .equals(STOCK_OPNAME_ENTITY)
    .toArray();

  for (const opname of stockOpnames) {
    const existingQueueItem = stockOpnameQueueItems.find((queueItem) => (
      queueItem.entity_id === opname.id &&
      queueItem.status !== 'synced' &&
      isRemoteStockOpnameBundleDto(queueItem.payload) &&
      queueItem.payload.opname.updated_at === opname.updated_at
    ));

    if (!existingQueueItem) {
      const items = await db.stockOpnameItems.where('opname_id').equals(opname.id).toArray();
      await enqueueStockOpnameBundleSync(opname, items, 'update');
    }
  }
};

export const enqueuePendingProductionOrdersForSync = async () => {
  const productionOrders = (await db.productionOrders.toArray())
    .filter((order) => order.sync_status === 'pending' || order.sync_status === 'failed');

  const productionOrderQueueItems = await db.syncQueue
    .where('entity')
    .equals(PRODUCTION_ORDER_ENTITY)
    .toArray();

  for (const order of productionOrders) {
    const existingQueueItem = productionOrderQueueItems.find((queueItem) => (
      queueItem.entity_id === order.id &&
      queueItem.status !== 'synced' &&
      isRemoteProductionOrderBundleDto(queueItem.payload) &&
      queueItem.payload.order.updated_at === order.updated_at
    ));

    if (!existingQueueItem) {
      const [items, costs] = await Promise.all([
        db.productionOrderItems.where('production_order_id').equals(order.id).toArray(),
        db.productionOrderCosts.where('production_order_id').equals(order.id).toArray(),
      ]);
      await enqueueProductionOrderBundleSync(order, items, costs, 'update');
    }
  }
};

export const enqueueStockMutationSync = async (mutation: StockMutation) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: STOCK_MUTATION_ENTITY,
    entity_id: mutation.id,
    operation: 'create',
    payload: mapStockMutationToRemoteDto(mutation),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueueTaxSync = async (
  tax: Tax,
  operation: SyncQueueOperation,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: TAX_ENTITY,
    entity_id: tax.id,
    operation,
    payload: mapTaxToRemoteDto(tax),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const enqueuePendingTaxesForSync = async () => {
  const taxes = (await db.taxes.toArray())
    .filter((tax) => tax.sync_status === 'pending' || tax.sync_status === 'failed');

  const taxQueueItems = await db.syncQueue
    .where('entity')
    .equals(TAX_ENTITY)
    .toArray();

  for (const tax of taxes) {
    const existingQueueItem = taxQueueItems.find((queueItem) => (
      queueItem.entity_id === tax.id &&
      queueItem.status !== 'synced' &&
      isRemoteTaxDto(queueItem.payload) &&
      queueItem.payload.updated_at === tax.updated_at
    ));

    if (!existingQueueItem) {
      await enqueueTaxSync(tax, 'update');
    }
  }
};

export const enqueueWarehouseSync = async (
  warehouse: Warehouse,
  operation: SyncQueueOperation,
) => {
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    id: crypto.randomUUID(),
    entity: WAREHOUSE_ENTITY,
    entity_id: warehouse.id,
    operation,
    payload: mapWarehouseToRemoteDto(warehouse),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };

  await db.syncQueue.add(queueItem);
  void processPendingSyncQueue();

  return queueItem;
};

export const retryFailedSyncQueueItems = async () => {
  const failedQueueItems = await db.syncQueue.where('status').equals('failed').toArray();
  const now = new Date().toISOString();

  await Promise.all(failedQueueItems.map((queueItem) => (
    db.syncQueue.update(queueItem.id, {
      status: 'pending',
      error_message: undefined,
      updated_at: now,
    })
  )));

  void processPendingSyncQueue();
};
