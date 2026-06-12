import { invoke } from '@tauri-apps/api/core';
import type {
  AccountType,
  CooperativeLoanBillingFrequency,
  CooperativeLoanDeductionMethod,
  CooperativeLoanInstallmentCollectionStatus,
  CooperativeLoanInstallmentStatus,
  CooperativeLoanInterestCalculationType,
  CooperativeLoanPaymentStatus,
  CooperativeLoanPaymentType,
  CooperativeLoanStatus,
  CooperativeMemberStatus,
  CooperativeSavingTransactionStatus,
  CooperativeSavingTransactionType,
  CooperativeSavingType,
  FinanceTransactionType,
  JournalEntryStatus,
  JournalSourceType,
  PaymentMethod,
  Permission,
  ProductUnit,
  ProductUnitMapping,
  PromoType,
  CurrencyRateBasis,
  CurrencyRateSource,
  PurchaseDocumentStatus,
  PurchaseDocumentType,
  PurchaseAdditionalCostTreatment,
  PurchaseCostEstimateSource,
  PurchaseCostStatus,
  PurchaseInvoicePaymentStatus,
  SalesDocumentStatus,
  SalesDocumentType,
  SalesInvoicePaymentStatus,
  StockMutationSourceType,
  TaxCalculationMode,
  UserRole,
  WholesalePrice,
} from '@/types';

export interface RemoteAuthUserDto {
  id: string;
  name: string;
  email?: string | null;
  role: UserRole;
  role_id?: string | null;
  role_name?: string | null;
  employee_id?: string | null;
  pin_hash: string;
  pin_salt: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemoteActivityLogDto {
  id: string;
  user_id?: string | null;
  user_name?: string | null;
  role?: UserRole | null;
  action: string;
  entity: string;
  entity_id?: string | null;
  description: string;
  created_at: string;
}

export interface RemoteRoleDto {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  is_system: boolean;
  is_owner: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemoteRolePermissionDto {
  id: string;
  role_id: string;
  permission_code: Permission;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemoteDepartmentDto {
  id: string;
  code?: string | null;
  name: string;
  description?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemoteProjectDto {
  id: string;
  code?: string | null;
  name: string;
  status: string;
  contact_id?: string | null;
  contact_name?: string | null;
  department_id?: string | null;
  department_code?: string | null;
  department_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  budget_amount?: number | null;
  description?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemoteTaxDto {
  id: string;
  code?: string | null;
  name: string;
  rate: number;
  rate_type: string;
  calculation_mode: string;
  description?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemoteContactDto {
  id: string;
  name: string;
  contact_type: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  company_name?: string | null;
  tax_number?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemoteWarehouseDto {
  id: string;
  code?: string | null;
  name: string;
  address?: string | null;
  phone?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemoteCurrencyDto {
  id: string;
  code: string;
  name: string;
  symbol?: string | null;
  decimal_places: number;
  is_base: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemoteCurrencyRateDto {
  id: string;
  currency_code: string;
  base_currency_code: string;
  rate_date: string;
  source: CurrencyRateSource;
  unit_amount: number;
  bi_buy_rate?: number | null;
  bi_sell_rate?: number | null;
  middle_rate: number;
  fetched_at?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface BiKursTransaksiRateDto {
  currency_code: string;
  rate_date: string;
  unit_amount: number;
  bi_buy_rate: number;
  bi_sell_rate: number;
  middle_rate: number;
}

export interface RemoteProductDto {
  id: string;
  name: string;
  category?: string | null;
  purchase_unit: ProductUnit;
  selling_unit: ProductUnit;
  purchase_price: number;
  selling_price: number;
  stock: number;
  sku?: string | null;
  wholesale_prices?: WholesalePrice[] | null;
  sellable_units?: ProductUnit[] | null;
  unit_mappings?: ProductUnitMapping[] | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemoteStockMutationDto {
  id: string;
  product_id: string;
  product_name: string;
  sku?: string | null;
  warehouse_id?: string | null;
  warehouse_code?: string | null;
  warehouse_name?: string | null;
  source_type: StockMutationSourceType;
  source_id: string;
  source_number?: string | null;
  source_line_id: string;
  quantity_delta: number;
  unit: ProductUnit;
  stock_unit: ProductUnit;
  source_quantity?: number | null;
  source_unit?: ProductUnit | null;
  reason?: string | null;
  actor_user_id?: string | null;
  actor_user_name?: string | null;
  occurred_at: string;
  created_at: string;
}

export interface RemoteSalesDocumentDto {
  id: string;
  document_number: string;
  type: SalesDocumentType;
  status: SalesDocumentStatus;
  contact_id?: string | null;
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  customer_address?: string | null;
  customer_company_name?: string | null;
  customer_tax_number?: string | null;
  department_id?: string | null;
  department_code?: string | null;
  department_name?: string | null;
  project_id?: string | null;
  project_code?: string | null;
  project_name?: string | null;
  document_date: string;
  expired_at?: string | null;
  due_date?: string | null;
  warehouse_id?: string | null;
  warehouse_code?: string | null;
  warehouse_name?: string | null;
  source_document_id?: string | null;
  source_document_number?: string | null;
  source_document_type?: SalesDocumentType | null;
  currency_code?: string | null;
  currency_name?: string | null;
  currency_symbol?: string | null;
  base_currency_code?: string | null;
  exchange_rate?: number | null;
  exchange_rate_source?: CurrencyRateSource | null;
  exchange_rate_basis?: CurrencyRateBasis | null;
  exchange_rate_date?: string | null;
  subtotal_amount?: number | null;
  foreign_subtotal_amount?: number | null;
  discount_type?: PromoType | null;
  discount_value?: number | null;
  discount_amount?: number | null;
  foreign_discount_amount?: number | null;
  discount_account_id?: string | null;
  discount_account_code?: string | null;
  discount_account_name?: string | null;
  tax_id?: string | null;
  tax_name?: string | null;
  tax_code?: string | null;
  tax_rate?: number | null;
  tax_calculation_mode?: TaxCalculationMode | null;
  tax_amount?: number | null;
  foreign_tax_amount?: number | null;
  total_amount?: number | null;
  foreign_total_amount?: number | null;
  payment_status?: SalesInvoicePaymentStatus | null;
  paid_amount?: number | null;
  paid_at?: string | null;
  payment_method?: PaymentMethod | null;
  cash_account_id?: string | null;
  cash_account_code?: string | null;
  cash_account_name?: string | null;
  finance_transaction_id?: string | null;
  notes?: string | null;
  issued_at?: string | null;
  voided_at?: string | null;
  void_reason?: string | null;
  version: number;
  created_by?: string | null;
  created_by_name?: string | null;
  updated_by?: string | null;
  updated_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RemoteSalesDocumentItemDto {
  id: string;
  document_id: string;
  product_id: string;
  product_name: string;
  sku?: string | null;
  unit: ProductUnit;
  quantity: number;
  ordered_quantity?: number | null;
  delivered_quantity?: number | null;
  price?: number | null;
  currency_code?: string | null;
  exchange_rate?: number | null;
  exchange_rate_source?: CurrencyRateSource | null;
  exchange_rate_basis?: CurrencyRateBasis | null;
  exchange_rate_date?: string | null;
  foreign_price?: number | null;
  discount_type?: PromoType | null;
  discount_value?: number | null;
  discount_amount?: number | null;
  foreign_discount_amount?: number | null;
  tax_id?: string | null;
  tax_name?: string | null;
  tax_code?: string | null;
  tax_rate?: number | null;
  tax_calculation_mode?: TaxCalculationMode | null;
  tax_base_amount?: number | null;
  foreign_tax_base_amount?: number | null;
  tax_amount?: number | null;
  foreign_tax_amount?: number | null;
  subtotal?: number | null;
  foreign_subtotal?: number | null;
  total_amount?: number | null;
  foreign_total_amount?: number | null;
  purchase_price?: number | null;
  original_price?: number | null;
  is_price_edited?: boolean | null;
  price_edited_by?: string | null;
  price_edited_at?: string | null;
  created_at: string;
}

export interface RemoteSalesDocumentBundleDto {
  document: RemoteSalesDocumentDto;
  items: RemoteSalesDocumentItemDto[];
}

export interface RemotePurchaseDocumentDto {
  id: string;
  document_number: string;
  type: PurchaseDocumentType;
  status: PurchaseDocumentStatus;
  contact_id?: string | null;
  supplier_name: string;
  supplier_phone?: string | null;
  supplier_email?: string | null;
  supplier_address?: string | null;
  supplier_company_name?: string | null;
  supplier_tax_number?: string | null;
  department_id?: string | null;
  department_code?: string | null;
  department_name?: string | null;
  project_id?: string | null;
  project_code?: string | null;
  project_name?: string | null;
  document_date: string;
  required_date?: string | null;
  quotation_due_date?: string | null;
  due_date?: string | null;
  warehouse_id?: string | null;
  warehouse_code?: string | null;
  warehouse_name?: string | null;
  source_document_id?: string | null;
  source_document_number?: string | null;
  source_document_type?: PurchaseDocumentType | null;
  currency_code?: string | null;
  currency_name?: string | null;
  currency_symbol?: string | null;
  base_currency_code?: string | null;
  exchange_rate?: number | null;
  exchange_rate_source?: CurrencyRateSource | null;
  exchange_rate_basis?: CurrencyRateBasis | null;
  exchange_rate_date?: string | null;
  subtotal_amount?: number | null;
  foreign_subtotal_amount?: number | null;
  discount_type?: PromoType | null;
  discount_value?: number | null;
  discount_amount?: number | null;
  foreign_discount_amount?: number | null;
  discount_account_id?: string | null;
  discount_account_code?: string | null;
  discount_account_name?: string | null;
  tax_id?: string | null;
  tax_name?: string | null;
  tax_code?: string | null;
  tax_rate?: number | null;
  tax_calculation_mode?: TaxCalculationMode | null;
  tax_amount?: number | null;
  foreign_tax_amount?: number | null;
  total_amount?: number | null;
  foreign_total_amount?: number | null;
  payment_status?: PurchaseInvoicePaymentStatus | null;
  paid_amount?: number | null;
  paid_at?: string | null;
  payment_method?: PaymentMethod | null;
  cash_account_id?: string | null;
  cash_account_code?: string | null;
  cash_account_name?: string | null;
  finance_transaction_id?: string | null;
  notes?: string | null;
  cost_status?: PurchaseCostStatus | null;
  delivery_note_number?: string | null;
  delivery_note_date?: string | null;
  supplier_invoice_number?: string | null;
  supplier_invoice_date?: string | null;
  additional_cost_treatment?: PurchaseAdditionalCostTreatment | null;
  additional_cost_amount?: number | null;
  supplier_discount_amount?: number | null;
  supplier_tax_amount?: number | null;
  cost_finalized_at?: string | null;
  cost_finalized_by?: string | null;
  cost_finalized_by_name?: string | null;
  issued_at?: string | null;
  voided_at?: string | null;
  void_reason?: string | null;
  version: number;
  created_by?: string | null;
  created_by_name?: string | null;
  updated_by?: string | null;
  updated_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RemotePurchaseDocumentItemDto {
  id: string;
  document_id: string;
  product_id: string;
  product_name: string;
  sku?: string | null;
  unit: ProductUnit;
  quantity: number;
  ordered_quantity?: number | null;
  received_quantity?: number | null;
  price?: number | null;
  currency_code?: string | null;
  exchange_rate?: number | null;
  exchange_rate_source?: CurrencyRateSource | null;
  exchange_rate_basis?: CurrencyRateBasis | null;
  exchange_rate_date?: string | null;
  foreign_price?: number | null;
  discount_type?: PromoType | null;
  discount_value?: number | null;
  discount_amount?: number | null;
  foreign_discount_amount?: number | null;
  tax_id?: string | null;
  tax_name?: string | null;
  tax_code?: string | null;
  tax_rate?: number | null;
  tax_calculation_mode?: TaxCalculationMode | null;
  tax_base_amount?: number | null;
  foreign_tax_base_amount?: number | null;
  tax_amount?: number | null;
  foreign_tax_amount?: number | null;
  subtotal?: number | null;
  foreign_subtotal?: number | null;
  total_amount?: number | null;
  foreign_total_amount?: number | null;
  cost_status?: PurchaseCostStatus | null;
  estimate_source?: PurchaseCostEstimateSource | null;
  estimated_price?: number | null;
  final_price?: number | null;
  invoiced_quantity?: number | null;
  quantity_variance?: number | null;
  additional_cost_allocation?: number | null;
  supplier_discount_allocation?: number | null;
  supplier_tax_allocation?: number | null;
  final_landed_cost_per_unit?: number | null;
  cost_finalized_at?: string | null;
  cost_variance_amount?: number | null;
  created_at: string;
}

export interface RemotePurchaseDocumentBundleDto {
  document: RemotePurchaseDocumentDto;
  items: RemotePurchaseDocumentItemDto[];
}

export interface RemoteFinanceTransactionDto {
  id: string;
  type: FinanceTransactionType;
  category: string;
  amount: number;
  description: string;
  reference_id?: string | null;
  account_id?: string | null;
  account_code?: string | null;
  account_name?: string | null;
  account_type?: AccountType | null;
  payment_method?: PaymentMethod | null;
  payment_channel?: string | null;
  cash_account_id?: string | null;
  cash_account_code?: string | null;
  cash_account_name?: string | null;
  transfer_group_id?: string | null;
  transfer_direction?: 'OUT' | 'IN' | null;
  reversal_of_transfer_group_id?: string | null;
  version: number;
  created_by?: string | null;
  created_by_name?: string | null;
  updated_by?: string | null;
  updated_by_name?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemoteJournalEntryDto {
  id: string;
  entry_number: string;
  entry_date: string;
  status: JournalEntryStatus;
  source_type: JournalSourceType;
  source_id?: string | null;
  source_number?: string | null;
  source_event?: string | null;
  description: string;
  total_debit: number;
  total_credit: number;
  posted_at?: string | null;
  voided_at?: string | null;
  reversed_entry_id?: string | null;
  version: number;
  created_by?: string | null;
  created_by_name?: string | null;
  updated_by?: string | null;
  updated_by_name?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemoteJournalEntryLineDto {
  id: string;
  journal_entry_id: string;
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  debit: number;
  credit: number;
  description?: string | null;
  department_id?: string | null;
  project_id?: string | null;
  created_at: string;
}

export interface RemoteJournalEntryBundleDto {
  entry: RemoteJournalEntryDto;
  lines: RemoteJournalEntryLineDto[];
}

export interface RemoteCooperativeMemberDto {
  id: string;
  member_number: string;
  name: string;
  identity_number?: string | null;
  phone?: string | null;
  address?: string | null;
  area_id?: string | null;
  area_name?: string | null;
  area_code?: string | null;
  officer_id?: string | null;
  officer_name?: string | null;
  officer_position?: string | null;
  join_date: string;
  status: CooperativeMemberStatus;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  created_by_name?: string | null;
  updated_by?: string | null;
  updated_by_name?: string | null;
}

export interface RemoteCooperativeSavingTransactionDto {
  id: string;
  member_id: string;
  member_number: string;
  member_name: string;
  saving_type: CooperativeSavingType;
  transaction_type: CooperativeSavingTransactionType;
  amount: number;
  transaction_date: string;
  status: CooperativeSavingTransactionStatus;
  cash_account_id?: string | null;
  cash_account_code?: string | null;
  cash_account_name?: string | null;
  payment_method?: PaymentMethod | null;
  payment_channel?: string | null;
  finance_transaction_id?: string | null;
  journal_entry_id?: string | null;
  reversal_of_transaction_id?: string | null;
  reversal_transaction_id?: string | null;
  reversal_finance_transaction_id?: string | null;
  reversal_journal_entry_id?: string | null;
  reversed_at?: string | null;
  reversal_reason?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  created_by_name?: string | null;
  updated_by?: string | null;
  updated_by_name?: string | null;
}

export interface RemoteCooperativeMemberSavingBalanceDto {
  id: string;
  member_id: string;
  member_number: string;
  member_name: string;
  saving_type: CooperativeSavingType;
  balance: number;
  updated_at: string;
}

export interface RemoteCooperativeLoanDto {
  id: string;
  loan_number: string;
  member_id: string;
  member_number: string;
  member_name: string;
  principal_amount: number;
  interest_rate_per_month: number;
  tenor_months: number;
  interest_calculation_type?: CooperativeLoanInterestCalculationType | null;
  billing_frequency?: CooperativeLoanBillingFrequency | null;
  installment_count?: number | null;
  loan_service_rate?: number | null;
  loan_service_amount?: number | null;
  admin_fee_rate?: number | null;
  admin_fee_amount?: number | null;
  mandatory_saving_rate?: number | null;
  mandatory_saving_amount?: number | null;
  deduction_method?: CooperativeLoanDeductionMethod | null;
  net_disbursement_amount?: number | null;
  total_interest_amount: number;
  total_payable_amount: number;
  outstanding_principal_amount: number;
  outstanding_interest_amount: number;
  outstanding_penalty_amount: number;
  status: CooperativeLoanStatus;
  application_date: string;
  approved_at?: string | null;
  approved_by?: string | null;
  approved_by_name?: string | null;
  approval_notes?: string | null;
  rejected_at?: string | null;
  rejected_by?: string | null;
  rejected_by_name?: string | null;
  rejection_reason?: string | null;
  disbursed_at?: string | null;
  cash_account_id?: string | null;
  cash_account_code?: string | null;
  cash_account_name?: string | null;
  payment_method?: PaymentMethod | null;
  payment_channel?: string | null;
  finance_transaction_id?: string | null;
  journal_entry_id?: string | null;
  disbursement_notes?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  created_by_name?: string | null;
  updated_by?: string | null;
  updated_by_name?: string | null;
}

export interface RemoteCooperativeLoanInstallmentDto {
  id: string;
  loan_id: string;
  loan_number: string;
  member_id: string;
  member_number: string;
  member_name: string;
  installment_number: number;
  due_date: string;
  principal_amount: number;
  interest_amount: number;
  penalty_amount: number;
  paid_principal_amount: number;
  paid_interest_amount: number;
  paid_penalty_amount: number;
  status: CooperativeLoanInstallmentStatus;
  paid_at?: string | null;
  collection_status?: CooperativeLoanInstallmentCollectionStatus | null;
  follow_up_date?: string | null;
  collection_notes?: string | null;
  last_contacted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RemoteCooperativeLoanPaymentDto {
  id: string;
  payment_number: string;
  payment_type?: CooperativeLoanPaymentType | null;
  loan_id: string;
  loan_number: string;
  installment_id?: string | null;
  member_id: string;
  member_number: string;
  member_name: string;
  amount: number;
  principal_amount: number;
  interest_amount: number;
  penalty_amount: number;
  payment_date: string;
  status: CooperativeLoanPaymentStatus;
  cash_account_id?: string | null;
  cash_account_code?: string | null;
  cash_account_name?: string | null;
  payment_method?: PaymentMethod | null;
  payment_channel?: string | null;
  collector_id?: string | null;
  collector_name?: string | null;
  collector_position?: string | null;
  received_by?: string | null;
  received_by_name?: string | null;
  posted_at?: string | null;
  finance_transaction_id?: string | null;
  journal_entry_id?: string | null;
  reversal_of_payment_id?: string | null;
  reversal_payment_id?: string | null;
  reversal_finance_transaction_id?: string | null;
  reversal_journal_entry_id?: string | null;
  reversed_at?: string | null;
  reversal_reason?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  created_by_name?: string | null;
  updated_by?: string | null;
  updated_by_name?: string | null;
}

export type PostgresHealthStatus = 'available' | 'unconfigured' | 'unreachable' | 'migration_failed';

export interface PostgresHealth {
  available: boolean;
  status: PostgresHealthStatus;
  message?: string | null;
}

export interface PostgresCommandError {
  code: string;
  status?: PostgresHealthStatus | null;
  message: string;
}

export interface PostgresListOptions {
  updatedAfter?: string;
  limit?: number;
}

export const isTauriRuntime = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const isPostgresUnavailableError = (error: unknown): error is PostgresCommandError => (
  Boolean(error) &&
  typeof error === 'object' &&
  (error as Partial<PostgresCommandError>).code === 'postgres_unavailable'
);

export const postgresAdapter = {
  async healthCheck() {
    if (!isTauriRuntime()) {
      return {
        available: false,
        status: 'unconfigured',
        message: 'Tauri runtime is not available.',
      } satisfies PostgresHealth;
    }

    try {
      return await invoke<PostgresHealth>('postgres_health_check');
    } catch {
      return {
        available: false,
        status: 'unreachable',
        message: 'PostgreSQL health check failed.',
      } satisfies PostgresHealth;
    }
  },
};

export const authUserPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteAuthUserDto[]>('postgres_list_auth_users');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteAuthUserDto | null>('postgres_get_auth_user', { id });
  },

  async upsert(input: RemoteAuthUserDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteAuthUserDto>('postgres_upsert_auth_user', { input });
  },
};

export const rolePostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteRoleDto[]>('postgres_list_roles');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteRoleDto | null>('postgres_get_role', { id });
  },

  async upsert(input: RemoteRoleDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteRoleDto>('postgres_upsert_role', { input });
  },
};

export const rolePermissionPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteRolePermissionDto[]>('postgres_list_role_permissions');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteRolePermissionDto | null>('postgres_get_role_permission', { id });
  },

  async upsert(input: RemoteRolePermissionDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteRolePermissionDto>('postgres_upsert_role_permission', { input });
  },
};

export const activityLogPostgresAdapter = {
  async list(limit = 200) {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteActivityLogDto[]>('postgres_list_activity_logs', { limit });
  },

  async upsert(input: RemoteActivityLogDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteActivityLogDto>('postgres_upsert_activity_log', { input });
  },
};

export const departmentPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteDepartmentDto[]>('postgres_list_departments');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteDepartmentDto | null>('postgres_get_department', { id });
  },

  async upsert(input: RemoteDepartmentDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteDepartmentDto>('postgres_upsert_department', { input });
  },

  async delete(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteDepartmentDto | null>('postgres_delete_department', { id });
  },
};

export const projectPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteProjectDto[]>('postgres_list_projects');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteProjectDto | null>('postgres_get_project', { id });
  },

  async upsert(input: RemoteProjectDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteProjectDto>('postgres_upsert_project', { input });
  },

  async delete(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteProjectDto | null>('postgres_delete_project', { id });
  },
};

export const taxPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteTaxDto[]>('postgres_list_taxes');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteTaxDto | null>('postgres_get_tax', { id });
  },

  async upsert(input: RemoteTaxDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteTaxDto>('postgres_upsert_tax', { input });
  },

  async delete(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteTaxDto | null>('postgres_delete_tax', { id });
  },
};

export const contactPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteContactDto[]>('postgres_list_contacts');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteContactDto | null>('postgres_get_contact', { id });
  },

  async upsert(input: RemoteContactDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteContactDto>('postgres_upsert_contact', { input });
  },

  async delete(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteContactDto | null>('postgres_delete_contact', { id });
  },
};

export const warehousePostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteWarehouseDto[]>('postgres_list_warehouses');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteWarehouseDto | null>('postgres_get_warehouse', { id });
  },

  async upsert(input: RemoteWarehouseDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteWarehouseDto>('postgres_upsert_warehouse', { input });
  },

  async delete(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteWarehouseDto | null>('postgres_delete_warehouse', { id });
  },
};

export const currencyPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteCurrencyDto[]>('postgres_list_currencies');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCurrencyDto | null>('postgres_get_currency', { id });
  },

  async upsert(input: RemoteCurrencyDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCurrencyDto>('postgres_upsert_currency', { input });
  },

  async delete(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCurrencyDto | null>('postgres_delete_currency', { id });
  },
};

export const currencyRatePostgresAdapter = {
  async list(options: { baseCurrencyCode?: string } = {}) {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteCurrencyRateDto[]>('postgres_list_currency_rates', {
      baseCurrencyCode: options.baseCurrencyCode,
    });
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCurrencyRateDto | null>('postgres_get_currency_rate', { id });
  },

  async upsert(input: RemoteCurrencyRateDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCurrencyRateDto>('postgres_upsert_currency_rate', { input });
  },

  async delete(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCurrencyRateDto | null>('postgres_delete_currency_rate', { id });
  },
};

export const biKursAdapter = {
  async fetchKursTransaksi(input: { currencyCode: string; startDate: string; endDate: string }) {
    if (!isTauriRuntime()) return [];
    return invoke<BiKursTransaksiRateDto[]>('fetch_bi_kurs_transaksi', input);
  },
};

export const productPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteProductDto[]>('postgres_list_products');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteProductDto | null>('postgres_get_product', { id });
  },

  async upsert(input: RemoteProductDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteProductDto>('postgres_upsert_product', { input });
  },

  async delete(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteProductDto | null>('postgres_delete_product', { id });
  },
};

export const stockMutationPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteStockMutationDto[]>('postgres_list_stock_mutations');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteStockMutationDto | null>('postgres_get_stock_mutation', { id });
  },

  async upsert(input: RemoteStockMutationDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteStockMutationDto>('postgres_upsert_stock_mutation', { input });
  },
};

export const salesDocumentPostgresAdapter = {
  async list(options: PostgresListOptions = {}) {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteSalesDocumentBundleDto[]>('postgres_list_sales_document_bundles', {
      updatedAfter: options.updatedAfter,
      limit: options.limit,
    });
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteSalesDocumentBundleDto | null>('postgres_get_sales_document_bundle', { id });
  },

  async upsert(input: RemoteSalesDocumentBundleDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteSalesDocumentBundleDto>('postgres_upsert_sales_document_bundle', { input });
  },
};

export const purchaseDocumentPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemotePurchaseDocumentBundleDto[]>('postgres_list_purchase_document_bundles');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemotePurchaseDocumentBundleDto | null>('postgres_get_purchase_document_bundle', { id });
  },

  async upsert(input: RemotePurchaseDocumentBundleDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemotePurchaseDocumentBundleDto>('postgres_upsert_purchase_document_bundle', { input });
  },
};

export const financeTransactionPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteFinanceTransactionDto[]>('postgres_list_finance_transactions');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteFinanceTransactionDto | null>('postgres_get_finance_transaction', { id });
  },

  async upsert(input: RemoteFinanceTransactionDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteFinanceTransactionDto>('postgres_upsert_finance_transaction', { input });
  },
};

export const journalEntryPostgresAdapter = {
  async list(options: PostgresListOptions = {}) {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteJournalEntryBundleDto[]>('postgres_list_journal_entry_bundles', {
      updatedAfter: options.updatedAfter,
      limit: options.limit,
    });
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteJournalEntryBundleDto | null>('postgres_get_journal_entry_bundle', { id });
  },

  async upsert(input: RemoteJournalEntryBundleDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteJournalEntryBundleDto>('postgres_upsert_journal_entry_bundle', { input });
  },
};

export const cooperativeMemberPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteCooperativeMemberDto[]>('postgres_list_cooperative_members');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCooperativeMemberDto | null>('postgres_get_cooperative_member', { id });
  },

  async upsert(input: RemoteCooperativeMemberDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCooperativeMemberDto>('postgres_upsert_cooperative_member', { input });
  },
};

export const cooperativeSavingTransactionPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteCooperativeSavingTransactionDto[]>('postgres_list_cooperative_saving_transactions');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCooperativeSavingTransactionDto | null>('postgres_get_cooperative_saving_transaction', { id });
  },

  async upsert(input: RemoteCooperativeSavingTransactionDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCooperativeSavingTransactionDto>('postgres_upsert_cooperative_saving_transaction', { input });
  },
};

export const cooperativeMemberSavingBalancePostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteCooperativeMemberSavingBalanceDto[]>('postgres_list_cooperative_member_saving_balances');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCooperativeMemberSavingBalanceDto | null>('postgres_get_cooperative_member_saving_balance', { id });
  },

  async upsert(input: RemoteCooperativeMemberSavingBalanceDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCooperativeMemberSavingBalanceDto>('postgres_upsert_cooperative_member_saving_balance', { input });
  },
};

export const cooperativeLoanPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteCooperativeLoanDto[]>('postgres_list_cooperative_loans');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCooperativeLoanDto | null>('postgres_get_cooperative_loan', { id });
  },

  async upsert(input: RemoteCooperativeLoanDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCooperativeLoanDto>('postgres_upsert_cooperative_loan', { input });
  },
};

export const cooperativeLoanInstallmentPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteCooperativeLoanInstallmentDto[]>('postgres_list_cooperative_loan_installments');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCooperativeLoanInstallmentDto | null>('postgres_get_cooperative_loan_installment', { id });
  },

  async upsert(input: RemoteCooperativeLoanInstallmentDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCooperativeLoanInstallmentDto>('postgres_upsert_cooperative_loan_installment', { input });
  },
};

export const cooperativeLoanPaymentPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteCooperativeLoanPaymentDto[]>('postgres_list_cooperative_loan_payments');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCooperativeLoanPaymentDto | null>('postgres_get_cooperative_loan_payment', { id });
  },

  async upsert(input: RemoteCooperativeLoanPaymentDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCooperativeLoanPaymentDto>('postgres_upsert_cooperative_loan_payment', { input });
  },
};
