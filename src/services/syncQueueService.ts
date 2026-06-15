import { db } from '@/lib/db';
import {
  mergeRemoteAuthUsersIntoDexie,
  mergeRemoteRolePermissionsIntoDexie,
  mergeRemoteRolesIntoDexie,
} from '@/auth/authReadService';
import { mergeRemoteContactsIntoDexie } from '@/services/contactReadService';
import {
  mergeRemoteCooperativeLoanInstallmentsIntoDexie,
  mergeRemoteCooperativeLoanPaymentsIntoDexie,
  mergeRemoteCooperativeLoansIntoDexie,
  mergeRemoteCooperativeMembersIntoDexie,
  mergeRemoteCooperativeMemberSavingBalancesIntoDexie,
  mergeRemoteCooperativeSavingTransactionsIntoDexie,
} from '@/services/cooperativeReadService';
import { mergeRemoteCurrenciesIntoDexie, mergeRemoteCurrencyRatesIntoDexie } from '@/services/currencyReadService';
import { mergeRemoteDepartmentsIntoDexie } from '@/services/departmentReadService';
import { mergeRemoteFinanceTransactionsIntoDexie } from '@/services/financeTransactionReadService';
import { mergeRemoteJournalEntryBundlesIntoDexie } from '@/services/journalEntryReadService';
import { mergeRemoteProductsIntoDexie } from '@/services/productReadService';
import { mergeRemotePurchaseDocumentBundlesIntoDexie } from '@/services/purchaseDocumentReadService';
import { mergeRemoteProjectsIntoDexie } from '@/services/projectReadService';
import { mergeRemoteSalesDocumentBundlesIntoDexie } from '@/services/salesDocumentReadService';
import { mergeRemoteStockOpnameBundlesIntoDexie } from '@/services/stockOpnameReadService';
import { mergeRemoteTaxesIntoDexie } from '@/services/taxReadService';
import { mergeRemoteWarehousesIntoDexie } from '@/services/warehouseReadService';
import {
  activityLogPostgresAdapter,
  authUserPostgresAdapter,
  contactPostgresAdapter,
  cooperativeLoanInstallmentPostgresAdapter,
  cooperativeLoanPaymentPostgresAdapter,
  cooperativeLoanPostgresAdapter,
  cooperativeMemberPostgresAdapter,
  cooperativeMemberSavingBalancePostgresAdapter,
  cooperativeSavingTransactionPostgresAdapter,
  currencyPostgresAdapter,
  currencyRatePostgresAdapter,
  departmentPostgresAdapter,
  financeTransactionPostgresAdapter,
  isTauriRuntime,
  journalEntryPostgresAdapter,
  postgresAdapter,
  productPostgresAdapter,
  purchaseDocumentPostgresAdapter,
  projectPostgresAdapter,
  rolePermissionPostgresAdapter,
  rolePostgresAdapter,
  salesDocumentPostgresAdapter,
  stockOpnamePostgresAdapter,
  stockMutationPostgresAdapter,
  taxPostgresAdapter,
  warehousePostgresAdapter,
  type RemoteActivityLogDto,
  type RemoteAuthUserDto,
  type RemoteContactDto,
  type RemoteCooperativeLoanDto,
  type RemoteCooperativeLoanInstallmentDto,
  type RemoteCooperativeLoanPaymentDto,
  type RemoteCooperativeMemberDto,
  type RemoteCooperativeMemberSavingBalanceDto,
  type RemoteCooperativeSavingTransactionDto,
  type RemoteCurrencyDto,
  type RemoteCurrencyRateDto,
  type RemoteDepartmentDto,
  type RemoteFinanceTransactionDto,
  type RemoteJournalEntryBundleDto,
  type RemoteJournalEntryDto,
  type RemoteJournalEntryLineDto,
  type RemoteProductDto,
  type RemotePurchaseDocumentBundleDto,
  type RemotePurchaseDocumentDto,
  type RemotePurchaseDocumentItemDto,
  type RemoteProjectDto,
  type RemoteRoleDto,
  type RemoteRolePermissionDto,
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
import type { ActivityLog, AuthUser, Contact, CooperativeLoan, CooperativeLoanInstallment, CooperativeLoanPayment, CooperativeMember, CooperativeMemberSavingBalance, CooperativeSavingTransaction, Currency, CurrencyRate, Department, FinanceTransaction, JournalEntry, JournalEntryLine, Product, Project, PurchaseDocument, PurchaseDocumentItem, Role, RolePermission, SalesDocument, SalesDocumentItem, StockMutation, StockOpname, StockOpnameItem, SyncQueueItem, SyncQueueOperation, Tax, Warehouse } from '@/types';

const SYNC_QUEUE_BATCH_SIZE = 20;
const SYNC_QUEUE_MAX_ATTEMPTS = 3;
const SYNC_QUEUE_PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;
const ACTIVITY_LOG_ENTITY = 'activityLogs';
const AUTH_USER_ENTITY = 'authUsers';
const CONTACT_ENTITY = 'contacts';
const COOPERATIVE_LOAN_ENTITY = 'cooperativeLoans';
const COOPERATIVE_LOAN_INSTALLMENT_ENTITY = 'cooperativeLoanInstallments';
const COOPERATIVE_LOAN_PAYMENT_ENTITY = 'cooperativeLoanPayments';
const COOPERATIVE_MEMBER_ENTITY = 'cooperativeMembers';
const COOPERATIVE_MEMBER_SAVING_BALANCE_ENTITY = 'cooperativeMemberSavingBalances';
const COOPERATIVE_SAVING_TRANSACTION_ENTITY = 'cooperativeSavingTransactions';
const CURRENCY_ENTITY = 'currencies';
const CURRENCY_RATE_ENTITY = 'currencyRates';
const DEPARTMENT_ENTITY = 'departments';
const FINANCE_TRANSACTION_ENTITY = 'financeTransactions';
const JOURNAL_ENTRY_ENTITY = 'journalEntries';
const PRODUCT_ENTITY = 'products';
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
  cash_account_id: loan.cash_account_id,
  cash_account_code: loan.cash_account_code,
  cash_account_name: loan.cash_account_name,
  payment_method: loan.payment_method,
  payment_channel: loan.payment_channel,
  finance_transaction_id: loan.finance_transaction_id,
  journal_entry_id: loan.journal_entry_id,
  disbursement_notes: loan.disbursement_notes,
  notes: loan.notes,
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

const mapCooperativeLoanPaymentToRemoteDto = (
  payment: CooperativeLoanPayment,
): RemoteCooperativeLoanPaymentDto => ({
  id: payment.id,
  payment_number: payment.payment_number,
  payment_type: payment.payment_type,
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
  version: transaction.version ?? 1,
  created_by: transaction.created_by,
  created_by_name: transaction.created_by_name,
  updated_by: transaction.updated_by,
  updated_by_name: transaction.updated_by_name,
  created_at: transaction.created_at,
  updated_at: transaction.updated_at ?? transaction.created_at,
  deleted_at: transaction.deleted_at,
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

const updateDepartmentSyncMetadata = async (
  departmentId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<Department, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentDepartment = await db.departments.get(departmentId);
  if (!currentDepartment || currentDepartment.updated_at !== sourceUpdatedAt) return;

  await db.departments.update(departmentId, syncMetadata);
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

const updateJournalEntrySyncMetadata = async (
  entryId: string,
  sourceUpdatedAt: string,
  syncMetadata: Partial<Pick<JournalEntry, 'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'>>,
) => {
  const currentEntry = await db.journalEntries.get(entryId);
  if (!currentEntry || currentEntry.updated_at !== sourceUpdatedAt) return;

  await db.journalEntries.update(entryId, syncMetadata);
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

  if (queueItem.entity === DEPARTMENT_ENTITY && isRemoteDepartmentDto(queueItem.payload)) {
    await updateDepartmentSyncMetadata(queueItem.entity_id, queueItem.payload.updated_at, {
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

  if (queueItem.entity === JOURNAL_ENTRY_ENTITY && isRemoteJournalEntryBundleDto(queueItem.payload)) {
    await updateJournalEntrySyncMetadata(queueItem.entity_id, queueItem.payload.entry.updated_at, {
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

const processCooperativeLoanPaymentQueueItem = async (queueItem: SyncQueueItem) => {
  if (!isRemoteCooperativeLoanPaymentDto(queueItem.payload)) {
    throw new Error('Payload pembayaran angsuran koperasi sync queue tidak valid.');
  }

  return cooperativeLoanPaymentPostgresAdapter.upsert(queueItem.payload);
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

const processDepartmentQueueItem = async (queueItem: SyncQueueItem) => {
  if (queueItem.operation === 'delete') {
    return departmentPostgresAdapter.delete(queueItem.entity_id);
  }

  if (!isRemoteDepartmentDto(queueItem.payload)) {
    throw new Error('Payload department sync queue tidak valid.');
  }

  return departmentPostgresAdapter.upsert(queueItem.payload);
};

const processFinanceTransactionQueueItem = async (queueItem: SyncQueueItem) => {
  if (!isRemoteFinanceTransactionDto(queueItem.payload)) {
    throw new Error('Payload finance transaction sync queue tidak valid.');
  }

  return financeTransactionPostgresAdapter.upsert(queueItem.payload);
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
    let remoteCooperativeLoan: RemoteCooperativeLoanDto | null = null;
    let remoteCooperativeLoanInstallment: RemoteCooperativeLoanInstallmentDto | null = null;
    let remoteCooperativeLoanPayment: RemoteCooperativeLoanPaymentDto | null = null;
    let remoteCooperativeMember: RemoteCooperativeMemberDto | null = null;
    let remoteCooperativeMemberSavingBalance: RemoteCooperativeMemberSavingBalanceDto | null = null;
    let remoteCooperativeSavingTransaction: RemoteCooperativeSavingTransactionDto | null = null;
    let remoteCurrency: RemoteCurrencyDto | null = null;
    let remoteCurrencyRate: RemoteCurrencyRateDto | null = null;
    let remoteDepartment: RemoteDepartmentDto | null = null;
    let remoteFinanceTransaction: RemoteFinanceTransactionDto | null = null;
    let remoteJournalEntryBundle: RemoteJournalEntryBundleDto | null = null;
    let remoteProduct: RemoteProductDto | null = null;
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
    } else if (currentQueueItem.entity === COOPERATIVE_LOAN_ENTITY) {
      remoteCooperativeLoan = await processCooperativeLoanQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === COOPERATIVE_LOAN_INSTALLMENT_ENTITY) {
      remoteCooperativeLoanInstallment = await processCooperativeLoanInstallmentQueueItem(currentQueueItem);
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
    } else if (currentQueueItem.entity === DEPARTMENT_ENTITY) {
      remoteDepartment = await processDepartmentQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === FINANCE_TRANSACTION_ENTITY) {
      remoteFinanceTransaction = await processFinanceTransactionQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === JOURNAL_ENTRY_ENTITY) {
      remoteJournalEntryBundle = await processJournalEntryQueueItem(currentQueueItem);
    } else if (currentQueueItem.entity === PRODUCT_ENTITY) {
      remoteProduct = await processProductQueueItem(currentQueueItem);
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
    memberQueueItems,
    savingTransactionQueueItems,
    savingBalanceQueueItems,
    loanQueueItems,
    loanInstallmentQueueItems,
    loanPaymentQueueItems,
  ] = await Promise.all([
    db.syncQueue.where('entity').equals(COOPERATIVE_MEMBER_ENTITY).toArray(),
    db.syncQueue.where('entity').equals(COOPERATIVE_SAVING_TRANSACTION_ENTITY).toArray(),
    db.syncQueue.where('entity').equals(COOPERATIVE_MEMBER_SAVING_BALANCE_ENTITY).toArray(),
    db.syncQueue.where('entity').equals(COOPERATIVE_LOAN_ENTITY).toArray(),
    db.syncQueue.where('entity').equals(COOPERATIVE_LOAN_INSTALLMENT_ENTITY).toArray(),
    db.syncQueue.where('entity').equals(COOPERATIVE_LOAN_PAYMENT_ENTITY).toArray(),
  ]);

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
