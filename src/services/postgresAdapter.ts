import { invoke } from '@tauri-apps/api/core';
import type {
  AccountType,
  AccountingFiscalYearStatus,
  AccountingPeriodStatus,
  AccountingPeriodType,
  ClosingRunStatus,
  CashBankReconciliationStatus,
  CashierSessionBalanceStatus,
  CashierSessionStatus,
  CooperativeCollectionWeekday,
  CooperativeLoanBillingFrequency,
  CooperativeLoanDeductionMethod,
  CooperativeLoanCollectionEvent,
  CooperativeLoanInstallmentCollectionStatus,
  CooperativeLoanInstallmentStatus,
  CooperativeLoanInterestCalculationType,
  CooperativeLoanPaymentStatus,
  CooperativeLoanPaymentType,
  CooperativeLoanStatus,
  CooperativeMemberStatus,
  CooperativePaymentApprovalAction,
  CooperativePaymentApprovalStatus,
  CooperativeSavingTransactionStatus,
  CooperativeSavingTransactionType,
  CooperativeSavingType,
  CooperativeSavingWithdrawalSource,
  EmployeeCashAdvanceRepaymentStatus,
  EmployeeCashAdvanceStatus,
  FinanceTransactionType,
  JournalEntryStatus,
  JournalSourceType,
  OpeningBalanceBatchStatus,
  OpeningBalanceLineSettlementStatus,
  OpeningBalanceModule,
  PaymentMethod,
  PaymentMethodCategory,
  PayrollRunStatus,
  Permission,
  ProductUnit,
  ProductUnitMapping,
  PromoType,
  ProductionOrderStatus,
  CurrencyRateBasis,
  CurrencyRateSource,
  PurchaseDocumentStatus,
  PurchaseDocumentType,
  RetailMembershipStatus,
  PurchaseAdditionalCostTreatment,
  PurchaseCostEstimateSource,
  PurchaseCostStatus,
  PurchaseInvoicePaymentStatus,
  SalesDocumentStatus,
  SalesDocumentType,
  SalesInvoicePaymentStatus,
  StockMutationSourceType,
  StockOpnameStatus,
  TaxCalculationMode,
  TaxFlow,
  UserRole,
  WholesalePrice,
  FixedAsset,
  FixedAssetDepreciationRun,
  FixedAssetDepreciationRunLine,
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
  actor_type?: 'USER' | 'EMPLOYEE' | null;
}

export interface RemoteServerAuthSessionDto {
  token: string;
  user: RemoteAuthUserDto;
  expires_at: string;
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

export interface RemoteEmployeeDto {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  position?: string | null;
  user_id?: string | null;
  user_name?: string | null;
  login_role_id?: string | null;
  field_cash_account_id?: string | null;
  field_cash_account_code?: string | null;
  field_cash_account_name?: string | null;
  pin_hash?: string | null;
  pin_salt?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemoteEmployeeAreaDto {
  id: string;
  employee_id: string;
  area_id: string;
  area_name: string;
  area_code?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemoteEmployeeCollectionScheduleDto {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_position?: string | null;
  area_id: string;
  area_name: string;
  area_code?: string | null;
  weekday: CooperativeCollectionWeekday;
  effective_from?: string | null;
  effective_until?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemotePayrollRunDto {
  id: string;
  payroll_number: string;
  period_start: string;
  period_end: string;
  status: PayrollRunStatus;
  employee_count: number;
  gross_amount: number;
  allowance_amount: number;
  bonus_amount: number;
  other_deduction_amount: number;
  cash_advance_deduction_amount: number;
  deduction_amount: number;
  net_amount: number;
  payment_method?: PaymentMethod | null;
  payment_channel?: string | null;
  cash_account_id?: string | null;
  cash_account_code?: string | null;
  cash_account_name?: string | null;
  finance_transaction_id?: string | null;
  notes?: string | null;
  approved_at?: string | null;
  paid_at?: string | null;
  voided_at?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  updated_by?: string | null;
  updated_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RemotePayrollRunItemDto {
  id: string;
  payroll_run_id: string;
  employee_id: string;
  employee_name: string;
  employee_position?: string | null;
  base_salary: number;
  allowance_amount: number;
  bonus_amount: number;
  other_deduction_amount: number;
  cash_advance_deduction_amount: number;
  deduction_amount: number;
  gross_amount: number;
  net_amount: number;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RemoteEmployeeCashAdvanceDto {
  id: string;
  advance_number: string;
  employee_id: string;
  employee_name: string;
  employee_position?: string | null;
  amount: number;
  outstanding_amount: number;
  status: EmployeeCashAdvanceStatus;
  disbursed_at: string;
  payment_method?: PaymentMethod | null;
  payment_channel?: string | null;
  cash_account_id?: string | null;
  cash_account_code?: string | null;
  cash_account_name?: string | null;
  finance_transaction_id?: string | null;
  notes?: string | null;
  voided_at?: string | null;
  void_reason?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  updated_by?: string | null;
  updated_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RemoteEmployeeCashAdvanceRepaymentDto {
  id: string;
  cash_advance_id: string;
  cash_advance_number: string;
  payroll_run_id: string;
  payroll_run_item_id: string;
  payroll_number?: string | null;
  employee_id: string;
  employee_name: string;
  amount: number;
  status: EmployeeCashAdvanceRepaymentStatus;
  allocated_at: string;
  posted_at?: string | null;
  voided_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RemotePayrollRunBundleDto {
  run: RemotePayrollRunDto;
  items: RemotePayrollRunItemDto[];
  cash_advance_repayments: RemoteEmployeeCashAdvanceRepaymentDto[];
}

export interface RemoteEmployeeCashAdvanceBundleDto {
  cash_advance: RemoteEmployeeCashAdvanceDto;
  repayments: RemoteEmployeeCashAdvanceRepaymentDto[];
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

export interface RemoteCashierSessionDto {
  id: string;
  session_number: string;
  status: CashierSessionStatus;
  cashier_user_id?: string | null;
  cashier_user_name?: string | null;
  opened_at: string;
  opening_cash_amount: number;
  opening_note?: string | null;
  closed_at?: string | null;
  closed_by_user_id?: string | null;
  closed_by_user_name?: string | null;
  closing_cash_amount?: number | null;
  closing_note?: string | null;
  expected_cash_amount?: number | null;
  cash_sales_amount?: number | null;
  non_cash_sales_amount?: number | null;
  total_sales_amount?: number | null;
  voided_sales_amount?: number | null;
  transaction_count?: number | null;
  voided_transaction_count?: number | null;
  cash_difference_amount?: number | null;
  balance_status?: CashierSessionBalanceStatus | null;
  created_at: string;
  updated_at: string;
}

export interface RemoteChartOfAccountDto {
  id: string;
  code: string;
  name: string;
  type: string;
  normal_balance: string;
  parent_id?: string | null;
  parent_code?: string | null;
  parent_name?: string | null;
  is_postable: boolean;
  is_system: boolean;
  is_active: boolean;
  description?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemoteFinanceAccountMappingDto {
  id: string;
  key: string;
  category?: string | null;
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface RemoteAccountingProfileSettingDto {
  id: string;
  accounting_profile: string;
  industry_extension: string;
  template_id?: string | null;
  locked_after_transaction?: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface RemoteEnabledModuleDto {
  id: string;
  code: string;
  is_enabled: boolean;
  source: string;
  requires_profile?: string | null;
  requires_extension?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RemoteGeneralLedgerSettingDto {
  id: string;
  is_ready: boolean;
  cutoff_date?: string | null;
  inventory_policy: string;
  opening_balance_journal_id?: string | null;
  activated_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RemoteAccountingInitialSetupSettingDto {
  id: string;
  business_template_code: string;
  accounting_profile: string;
  industry_extension: string;
  template_id: string;
  cutoff_date: string;
  fiscal_period_start: string;
  fiscal_period_end: string;
  current_period_start: string;
  current_period_end: string;
  current_period_id?: string | null;
  base_currency_code: string;
  inventory_policy: string;
  setup_completed_at?: string | null;
  setup_completed_by?: string | null;
  setup_completed_by_name?: string | null;
  version: number;
  created_at: string;
  updated_at: string;
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

type WithoutLocalSyncMetadata<T> = Omit<
  T,
  'sync_status' | 'sync_error' | 'last_synced_at' | 'remote_updated_at'
>;

export type RemoteFixedAssetDto = WithoutLocalSyncMetadata<FixedAsset>;
export type RemoteFixedAssetDepreciationRunDto = WithoutLocalSyncMetadata<FixedAssetDepreciationRun>;
export type RemoteFixedAssetDepreciationRunLineDto = FixedAssetDepreciationRunLine;
export interface RemoteFixedAssetDepreciationRunBundleDto {
  run: RemoteFixedAssetDepreciationRunDto;
  lines: RemoteFixedAssetDepreciationRunLineDto[];
}

export interface RemoteTaxDto {
  id: string;
  code?: string | null;
  name: string;
  rate: number;
  rate_type: string;
  calculation_mode: string;
  tax_flow?: TaxFlow | null;
  sales_tax_account_id?: string | null;
  sales_tax_account_code?: string | null;
  sales_tax_account_name?: string | null;
  sales_tax_account_type?: AccountType | null;
  purchase_tax_account_id?: string | null;
  purchase_tax_account_code?: string | null;
  purchase_tax_account_name?: string | null;
  purchase_tax_account_type?: AccountType | null;
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
  is_member?: boolean | null;
  membership_number?: string | null;
  membership_status?: RetailMembershipStatus | null;
  membership_joined_at?: string | null;
  membership_points_balance?: number | null;
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

export interface RemotePaymentMethodDto {
  id: string;
  code: string;
  name: string;
  category: PaymentMethodCategory;
  posting_account_id?: string | null;
  posting_account_code?: string | null;
  posting_account_name?: string | null;
  requires_reference: boolean;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
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

export interface RemoteStockOpnameDto {
  id: string;
  opname_number: string;
  status: StockOpnameStatus;
  counted_at: string;
  reviewed_at?: string | null;
  posted_at?: string | null;
  cancelled_at?: string | null;
  warehouse_id?: string | null;
  warehouse_code?: string | null;
  warehouse_name?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  reviewed_by?: string | null;
  reviewed_by_name?: string | null;
  posted_by?: string | null;
  posted_by_name?: string | null;
  cancelled_by?: string | null;
  cancelled_by_name?: string | null;
  cancel_reason?: string | null;
  total_items: number;
  total_adjustment_in: number;
  total_adjustment_out: number;
  total_variance_value: number;
  created_at: string;
  updated_at: string;
}

export interface RemoteStockOpnameItemDto {
  id: string;
  opname_id: string;
  product_id: string;
  product_name: string;
  sku?: string | null;
  category?: string | null;
  system_quantity: number;
  counted_quantity?: number | null;
  quantity_delta: number;
  unit: ProductUnit;
  cost_per_unit: number;
  variance_value: number;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RemoteStockOpnameBundleDto {
  opname: RemoteStockOpnameDto;
  items: RemoteStockOpnameItemDto[];
}

export interface RemoteProductionOrderDto {
  id: string;
  production_number: string;
  status: ProductionOrderStatus;
  finished_product_id: string;
  finished_product_name: string;
  quantity_produced: number;
  unit: ProductUnit;
  material_cost: number;
  additional_cost: number;
  total_cost: number;
  unit_cost: number;
  produced_at: string;
  posted_at?: string | null;
  voided_at?: string | null;
  void_reason?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RemoteProductionOrderItemDto {
  id: string;
  production_order_id: string;
  material_product_id: string;
  material_product_name: string;
  sku?: string | null;
  quantity_used: number;
  unit: ProductUnit;
  stock_quantity_used: number;
  stock_unit: ProductUnit;
  cost_per_unit: number;
  total_cost: number;
  created_at: string;
  updated_at: string;
}

export interface RemoteProductionOrderCostDto {
  id: string;
  production_order_id: string;
  name: string;
  amount: number;
  account_id?: string | null;
  account_code?: string | null;
  account_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RemoteProductionOrderBundleDto {
  order: RemoteProductionOrderDto;
  items: RemoteProductionOrderItemDto[];
  costs: RemoteProductionOrderCostDto[];
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
  tax_flow?: TaxFlow | null;
  tax_account_id?: string | null;
  tax_account_code?: string | null;
  tax_account_name?: string | null;
  tax_account_type?: AccountType | null;
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
  tax_flow?: TaxFlow | null;
  tax_account_id?: string | null;
  tax_account_code?: string | null;
  tax_account_name?: string | null;
  tax_account_type?: AccountType | null;
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
  tax_flow?: TaxFlow | null;
  tax_account_id?: string | null;
  tax_account_code?: string | null;
  tax_account_name?: string | null;
  tax_account_type?: AccountType | null;
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
  tax_flow?: TaxFlow | null;
  tax_account_id?: string | null;
  tax_account_code?: string | null;
  tax_account_name?: string | null;
  tax_account_type?: AccountType | null;
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
  field_cash_session_id?: string | null;
  field_cash_session_number?: string | null;
  field_employee_id?: string | null;
  field_employee_name?: string | null;
  field_cash_movement_kind?: string | null;
  cash_bank_reconciliation_id?: string | null;
  cash_bank_reconciled_at?: string | null;
  cash_bank_reconciled_by?: string | null;
  cash_bank_reconciled_by_name?: string | null;
  version: number;
  created_by?: string | null;
  created_by_name?: string | null;
  updated_by?: string | null;
  updated_by_name?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemoteCashBankReconciliationDto {
  id: string;
  reconciliation_number: string;
  cash_account_id: string;
  cash_account_code?: string | null;
  cash_account_name: string;
  statement_date: string;
  statement_reference?: string | null;
  statement_ending_balance: number;
  book_balance_amount: number;
  cleared_balance_amount: number;
  selected_transaction_total_amount: number;
  selected_transaction_count: number;
  selected_transaction_ids: string[];
  difference_amount: number;
  status: CashBankReconciliationStatus;
  notes?: string | null;
  voided_at?: string | null;
  void_reason?: string | null;
  version: number;
  created_by?: string | null;
  created_by_name?: string | null;
  updated_by?: string | null;
  updated_by_name?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemoteAccountingPeriodDto {
  id: string;
  name: string;
  period_type: AccountingPeriodType;
  start_date: string;
  end_date: string;
  status: AccountingPeriodStatus;
  locked_at?: string | null;
  locked_by?: string | null;
  locked_by_name?: string | null;
  closed_at?: string | null;
  closed_by?: string | null;
  closed_by_name?: string | null;
  closing_journal_entry_id?: string | null;
  reopened_at?: string | null;
  reopened_by?: string | null;
  reopened_by_name?: string | null;
  reopen_reason?: string | null;
  notes?: string | null;
  version: number;
  created_by?: string | null;
  created_by_name?: string | null;
  updated_by?: string | null;
  updated_by_name?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemoteAccountingFiscalYearDto {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: AccountingFiscalYearStatus;
  closed_at?: string | null;
  closed_by?: string | null;
  closed_by_name?: string | null;
  closing_journal_entry_id?: string | null;
  reopened_at?: string | null;
  reopened_by?: string | null;
  reopened_by_name?: string | null;
  reopen_reason?: string | null;
  notes?: string | null;
  version: number;
  created_by?: string | null;
  created_by_name?: string | null;
  updated_by?: string | null;
  updated_by_name?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemoteClosingRunDto {
  id: string;
  period_id: string;
  period_name: string;
  start_date: string;
  end_date: string;
  status: ClosingRunStatus;
  retained_earning_account_id: string;
  retained_earning_account_code: string;
  retained_earning_account_name: string;
  net_income_amount: number;
  total_revenue_amount: number;
  total_contra_revenue_amount: number;
  total_expense_amount: number;
  closing_journal_entry_id?: string | null;
  posted_at?: string | null;
  reversed_at?: string | null;
  reversed_by?: string | null;
  reversed_by_name?: string | null;
  reversal_journal_entry_id?: string | null;
  reversal_reason?: string | null;
  notes?: string | null;
  version: number;
  created_by?: string | null;
  created_by_name?: string | null;
  updated_by?: string | null;
  updated_by_name?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemoteFiscalYearClosingRunDto {
  id: string;
  fiscal_year_id: string;
  fiscal_year_name: string;
  start_date: string;
  end_date: string;
  status: ClosingRunStatus;
  retained_earning_account_id: string;
  retained_earning_account_code: string;
  retained_earning_account_name: string;
  net_income_amount: number;
  total_revenue_amount: number;
  total_contra_revenue_amount: number;
  total_expense_amount: number;
  closing_journal_entry_id?: string | null;
  posted_at?: string | null;
  reversed_at?: string | null;
  reversed_by?: string | null;
  reversed_by_name?: string | null;
  reversal_journal_entry_id?: string | null;
  reversal_reason?: string | null;
  notes?: string | null;
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

export interface RemoteOpeningBalanceBatchDto {
  id: string;
  batch_number?: string | null;
  company_id?: string | null;
  company_name?: string | null;
  module: OpeningBalanceModule;
  cutoff_date: string;
  accounting_start_date?: string | null;
  status: OpeningBalanceBatchStatus;
  revision_number?: number | null;
  previous_batch_id?: string | null;
  total_debit: number;
  total_credit: number;
  journal_entry_id?: string | null;
  posting_idempotency_key?: string | null;
  posted_at?: string | null;
  posted_by?: string | null;
  posted_by_name?: string | null;
  locked_at?: string | null;
  reversed_at?: string | null;
  reversed_by?: string | null;
  reversed_by_name?: string | null;
  reversal_journal_entry_id?: string | null;
  skipped_at?: string | null;
  validated_at?: string | null;
  validated_by?: string | null;
  validated_by_name?: string | null;
  notes?: string | null;
  version: number;
  created_by?: string | null;
  created_by_name?: string | null;
  updated_by?: string | null;
  updated_by_name?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemoteOpeningBalanceLineDto {
  id: string;
  batch_id: string;
  module: OpeningBalanceModule;
  line_number: number;
  contact_id?: string | null;
  party_name?: string | null;
  document_number?: string | null;
  document_date?: string | null;
  due_date?: string | null;
  currency_code?: string | null;
  currency_name?: string | null;
  currency_symbol?: string | null;
  base_currency_code?: string | null;
  fx_rate?: number | null;
  amount?: number | null;
  base_amount: number;
  paid_amount?: number | null;
  remaining_amount?: number | null;
  settlement_status?: OpeningBalanceLineSettlementStatus | null;
  last_paid_at?: string | null;
  account_id?: string | null;
  account_code?: string | null;
  account_name?: string | null;
  counter_account_id?: string | null;
  counter_account_code?: string | null;
  counter_account_name?: string | null;
  debit: number;
  credit: number;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RemoteOpeningBalanceBundleDto {
  batch: RemoteOpeningBalanceBatchDto;
  lines: RemoteOpeningBalanceLineDto[];
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

export interface RemoteCooperativeMemberCodeDto {
  id: string;
  code: string;
  created_at: string;
  updated_at: string;
}

export interface RemoteCooperativeAreaDto {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemoteCooperativeSavingTransactionDto {
  id: string;
  member_id: string;
  member_number: string;
  member_name: string;
  saving_type: CooperativeSavingType;
  transaction_type: CooperativeSavingTransactionType;
  withdrawal_source?: CooperativeSavingWithdrawalSource | null;
  interest_rate_per_month?: number | null;
  opening_interest_amount?: number | null;
  opening_interest_applied_amount?: number | null;
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
  scheduled_disbursement_date?: string | null;
  officer_id?: string | null;
  officer_name?: string | null;
  officer_position?: string | null;
  area_id?: string | null;
  area_name?: string | null;
  area_code?: string | null;
  collection_schedule_id?: string | null;
  collection_weekday?: CooperativeCollectionWeekday | null;
  cash_account_id?: string | null;
  cash_account_code?: string | null;
  cash_account_name?: string | null;
  payment_method?: PaymentMethod | null;
  payment_channel?: string | null;
  finance_transaction_id?: string | null;
  journal_entry_id?: string | null;
  reversal_finance_transaction_id?: string | null;
  reversal_journal_entry_id?: string | null;
  reversed_at?: string | null;
  reversal_reason?: string | null;
  disbursement_notes?: string | null;
  notes?: string | null;
  is_migration?: boolean | null;
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
  payment_group_id?: string | null;
  payment_group_number?: string | null;
  payment_group_sequence?: number | null;
  payment_group_total?: number | null;
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
  idempotency_key?: string | null;
}

export interface RemoteCooperativePostingAccountDto {
  id: string;
  account_key?: string | null;
  code: string;
  name: string;
  account_type: AccountType;
  is_postable: boolean;
  is_active: boolean;
  is_cash_or_bank: boolean;
  updated_at: string;
}

export interface RemotePostCooperativeLoanPaymentInput {
  session_token: string;
  idempotency_key: string;
  installment_id: string;
  amount: number;
  payment_date: string;
  payment_method: PaymentMethod;
  cash_account_id: string;
  payment_channel?: string | null;
  collector_id?: string | null;
  notes?: string | null;
}

export interface RemotePostCooperativeLoanPaymentResult {
  payment: RemoteCooperativeLoanPaymentDto;
  installment: RemoteCooperativeLoanInstallmentDto;
  loan: RemoteCooperativeLoanDto;
  finance_transaction: RemoteFinanceTransactionDto;
  journal_entry: RemoteJournalEntryBundleDto;
}

export interface RemotePostCooperativeLoanPaymentBatchResult {
  payments: RemoteCooperativeLoanPaymentDto[];
  installments: RemoteCooperativeLoanInstallmentDto[];
  loan: RemoteCooperativeLoanDto;
  finance_transactions: RemoteFinanceTransactionDto[];
  journal_entries: RemoteJournalEntryBundleDto[];
  payment_group_id?: string | null;
  payment_group_number?: string | null;
}

export interface RemoteCooperativePaymentApprovalRequestDto {
  id: string;
  action_type: CooperativePaymentApprovalAction;
  status: CooperativePaymentApprovalStatus;
  payment_id?: string | null;
  installment_id?: string | null;
  idempotency_key?: string | null;
  amount?: number | null;
  payment_date?: string | null;
  payment_method?: PaymentMethod | null;
  cash_account_id?: string | null;
  payment_channel?: string | null;
  collector_id?: string | null;
  maker_reason: string;
  maker_user_id: string;
  maker_user_name: string;
  requested_at: string;
  checker_user_id?: string | null;
  checker_user_name?: string | null;
  checker_notes?: string | null;
  decided_at?: string | null;
  result_payment_id?: string | null;
  created_at: string;
  updated_at: string;
}

export type RemotePostCooperativeLoanPaymentOutcome =
  | {
      status: 'POSTED';
      result: RemotePostCooperativeLoanPaymentResult;
    }
  | {
      status: 'PENDING_APPROVAL';
      approval_request: RemoteCooperativePaymentApprovalRequestDto;
    };

export type RemotePostCooperativeLoanPaymentBatchOutcome =
  | {
      status: 'POSTED';
      result: RemotePostCooperativeLoanPaymentBatchResult;
    }
  | {
      status: 'PENDING_APPROVAL';
      approval_request: RemoteCooperativePaymentApprovalRequestDto;
    };

export interface RemoteCooperativePaymentInstallmentReconciliationDto {
  installment_id: string;
  loan_id: string;
  loan_number: string;
  installment_number: number;
  expected_principal_amount: number;
  actual_principal_amount: number;
  expected_interest_amount: number;
  actual_interest_amount: number;
  expected_penalty_amount: number;
  actual_penalty_amount: number;
  difference_amount: number;
}

export interface RemoteCooperativeLoanCollectionEventDto {
  id: string;
  installment_id: string;
  loan_id: string;
  loan_number: string;
  member_id: string;
  member_number: string;
  member_name: string;
  collection_status: CooperativeLoanCollectionEvent['collection_status'];
  follow_up_date?: string | null;
  collection_notes: string;
  contacted_at: string;
  actor_user_id?: string | null;
  actor_user_name?: string | null;
  actor_employee_id?: string | null;
  created_at: string;
}

export interface RemoteRecordCooperativeLoanCollectionEventInput {
  session_token: string;
  event_id: string;
  installment_id: string;
  collection_status: CooperativeLoanCollectionEvent['collection_status'];
  follow_up_date?: string | null;
  collection_notes: string;
}

export interface RemoteRecordCooperativeLoanCollectionEventResult {
  event: RemoteCooperativeLoanCollectionEventDto;
  installment: RemoteCooperativeLoanInstallmentDto;
}

export interface RemoteAppSetupConfigDto {
  enabledModules: string[];
  configuredAt: string;
  configuredBy: string;
  moduleCatalogVersion: number;
}

export interface RemoteCompanyProfileSettingDto {
  id: 'default';
  companyName?: string | null;
  logoDataUrl?: string | null;
  logoFileName?: string | null;
  logoMimeType?: string | null;
  logoSize?: number | null;
  createdAt: string;
  updatedAt: string;
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
  async setDatabaseUrl(databaseUrl: string) {
    if (!isTauriRuntime()) {
      return {
        available: false,
        status: 'unconfigured',
        message: 'Tauri runtime is not available.',
      } satisfies PostgresHealth;
    }

    return invoke<PostgresHealth>('set_postgres_database_url', { databaseUrl });
  },

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

export const appSetupConfigPostgresAdapter = {
  async get() {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteAppSetupConfigDto | null>('postgres_get_app_setup_config');
  },

  async upsert(input: RemoteAppSetupConfigDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteAppSetupConfigDto>('postgres_upsert_app_setup_config', { input });
  },
};

export const companyProfileSettingPostgresAdapter = {
  async get() {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCompanyProfileSettingDto | null>('postgres_get_company_profile_setting');
  },

  async upsert(input: RemoteCompanyProfileSettingDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCompanyProfileSettingDto>('postgres_upsert_company_profile_setting', { input });
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

export const serverAuthSessionPostgresAdapter = {
  async authenticate(email: string, pin: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteServerAuthSessionDto>('postgres_authenticate_server_session', {
      input: { email, pin },
    });
  },

  async revoke(token: string) {
    if (!isTauriRuntime()) return;
    await invoke<void>('postgres_revoke_server_session', { token });
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

export const employeePostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteEmployeeDto[]>('postgres_list_employees');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteEmployeeDto | null>('postgres_get_employee', { id });
  },

  async upsert(input: RemoteEmployeeDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteEmployeeDto>('postgres_upsert_employee', { input });
  },
};

export const employeeAreaPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteEmployeeAreaDto[]>('postgres_list_employee_areas');
  },

  async upsert(input: RemoteEmployeeAreaDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteEmployeeAreaDto>('postgres_upsert_employee_area', { input });
  },
};

export const employeeCollectionSchedulePostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteEmployeeCollectionScheduleDto[]>('postgres_list_employee_collection_schedules');
  },

  async upsert(input: RemoteEmployeeCollectionScheduleDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteEmployeeCollectionScheduleDto>('postgres_upsert_employee_collection_schedule', { input });
  },
};

export const payrollRunPostgresAdapter = {
  async list(options: PostgresListOptions = {}) {
    if (!isTauriRuntime()) return [];
    return invoke<RemotePayrollRunBundleDto[]>('postgres_list_payroll_run_bundles', {
      updatedAfter: options.updatedAfter,
      limit: options.limit,
    });
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemotePayrollRunBundleDto | null>('postgres_get_payroll_run_bundle', { id });
  },

  async upsert(input: RemotePayrollRunBundleDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemotePayrollRunBundleDto>('postgres_upsert_payroll_run_bundle', { input });
  },
};

export const employeeCashAdvancePostgresAdapter = {
  async list(options: PostgresListOptions = {}) {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteEmployeeCashAdvanceBundleDto[]>('postgres_list_employee_cash_advance_bundles', {
      updatedAfter: options.updatedAfter,
      limit: options.limit,
    });
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteEmployeeCashAdvanceBundleDto | null>('postgres_get_employee_cash_advance_bundle', { id });
  },

  async upsert(input: RemoteEmployeeCashAdvanceBundleDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteEmployeeCashAdvanceBundleDto>('postgres_upsert_employee_cash_advance_bundle', { input });
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

export const cashierSessionPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteCashierSessionDto[]>('postgres_list_cashier_sessions');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCashierSessionDto | null>('postgres_get_cashier_session', { id });
  },

  async upsert(input: RemoteCashierSessionDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCashierSessionDto>('postgres_upsert_cashier_session', { input });
  },
};

export const chartOfAccountPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteChartOfAccountDto[]>('postgres_list_chart_of_accounts');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteChartOfAccountDto | null>('postgres_get_chart_of_account', { id });
  },

  async upsert(input: RemoteChartOfAccountDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteChartOfAccountDto>('postgres_upsert_chart_of_account', { input });
  },

  async delete(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteChartOfAccountDto | null>('postgres_delete_chart_of_account', { id });
  },
};

export const financeAccountMappingPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteFinanceAccountMappingDto[]>('postgres_list_finance_account_mappings');
  },

  async upsert(input: RemoteFinanceAccountMappingDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteFinanceAccountMappingDto>('postgres_upsert_finance_account_mapping', { input });
  },
};

export const accountingProfileSettingPostgresAdapter = {
  async get() {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteAccountingProfileSettingDto | null>('postgres_get_accounting_profile_setting');
  },

  async upsert(input: RemoteAccountingProfileSettingDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteAccountingProfileSettingDto>('postgres_upsert_accounting_profile_setting', { input });
  },
};

export const enabledModulePostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteEnabledModuleDto[]>('postgres_list_enabled_modules');
  },

  async upsert(input: RemoteEnabledModuleDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteEnabledModuleDto>('postgres_upsert_enabled_module', { input });
  },
};

export const generalLedgerSettingPostgresAdapter = {
  async get() {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteGeneralLedgerSettingDto | null>('postgres_get_general_ledger_setting');
  },

  async upsert(input: RemoteGeneralLedgerSettingDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteGeneralLedgerSettingDto>('postgres_upsert_general_ledger_setting', { input });
  },
};

export const accountingInitialSetupSettingPostgresAdapter = {
  async get() {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteAccountingInitialSetupSettingDto | null>('postgres_get_accounting_initial_setup_setting');
  },

  async upsert(input: RemoteAccountingInitialSetupSettingDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteAccountingInitialSetupSettingDto>('postgres_upsert_accounting_initial_setup_setting', { input });
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

export const fixedAssetPostgresAdapter = {
  async list(updatedAfter?: string, limit = 500) {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteFixedAssetDto[]>('postgres_list_fixed_assets', { updatedAfter, limit });
  },

  async upsert(input: RemoteFixedAssetDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteFixedAssetDto>('postgres_upsert_fixed_asset', { input });
  },
};

export const fixedAssetDepreciationRunPostgresAdapter = {
  async list(updatedAfter?: string, limit = 300) {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteFixedAssetDepreciationRunBundleDto[]>(
      'postgres_list_fixed_asset_depreciation_run_bundles',
      { updatedAfter, limit },
    );
  },

  async upsert(input: RemoteFixedAssetDepreciationRunBundleDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteFixedAssetDepreciationRunBundleDto>(
      'postgres_upsert_fixed_asset_depreciation_run_bundle',
      { input },
    );
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

export const paymentMethodPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemotePaymentMethodDto[]>('postgres_list_payment_methods');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemotePaymentMethodDto | null>('postgres_get_payment_method', { id });
  },

  async upsert(input: RemotePaymentMethodDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemotePaymentMethodDto>('postgres_upsert_payment_method', { input });
  },

  async delete(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemotePaymentMethodDto | null>('postgres_delete_payment_method', { id });
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

export const stockOpnamePostgresAdapter = {
  async list(options: PostgresListOptions = {}) {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteStockOpnameBundleDto[]>('postgres_list_stock_opname_bundles', {
      updatedAfter: options.updatedAfter,
      limit: options.limit,
    });
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteStockOpnameBundleDto | null>('postgres_get_stock_opname_bundle', { id });
  },

  async upsert(input: RemoteStockOpnameBundleDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteStockOpnameBundleDto>('postgres_upsert_stock_opname_bundle', { input });
  },
};

export const productionOrderPostgresAdapter = {
  async list(options: PostgresListOptions = {}) {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteProductionOrderBundleDto[]>('postgres_list_production_order_bundles', {
      updatedAfter: options.updatedAfter,
      limit: options.limit,
    });
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteProductionOrderBundleDto | null>('postgres_get_production_order_bundle', { id });
  },

  async upsert(input: RemoteProductionOrderBundleDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteProductionOrderBundleDto>('postgres_upsert_production_order_bundle', { input });
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

export const cashBankReconciliationPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteCashBankReconciliationDto[]>('postgres_list_cash_bank_reconciliations');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCashBankReconciliationDto | null>('postgres_get_cash_bank_reconciliation', { id });
  },

  async upsert(input: RemoteCashBankReconciliationDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCashBankReconciliationDto>('postgres_upsert_cash_bank_reconciliation', { input });
  },
};

export const accountingPeriodPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteAccountingPeriodDto[]>('postgres_list_accounting_periods');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteAccountingPeriodDto | null>('postgres_get_accounting_period', { id });
  },

  async upsert(input: RemoteAccountingPeriodDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteAccountingPeriodDto>('postgres_upsert_accounting_period', { input });
  },
};

export const accountingFiscalYearPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteAccountingFiscalYearDto[]>('postgres_list_accounting_fiscal_years');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteAccountingFiscalYearDto | null>('postgres_get_accounting_fiscal_year', { id });
  },

  async upsert(input: RemoteAccountingFiscalYearDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteAccountingFiscalYearDto>('postgres_upsert_accounting_fiscal_year', { input });
  },
};

export const closingRunPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteClosingRunDto[]>('postgres_list_closing_runs');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteClosingRunDto | null>('postgres_get_closing_run', { id });
  },

  async upsert(input: RemoteClosingRunDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteClosingRunDto>('postgres_upsert_closing_run', { input });
  },
};

export const fiscalYearClosingRunPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteFiscalYearClosingRunDto[]>('postgres_list_fiscal_year_closing_runs');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteFiscalYearClosingRunDto | null>('postgres_get_fiscal_year_closing_run', { id });
  },

  async upsert(input: RemoteFiscalYearClosingRunDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteFiscalYearClosingRunDto>('postgres_upsert_fiscal_year_closing_run', { input });
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

export const openingBalancePostgresAdapter = {
  async list(options: PostgresListOptions = {}) {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteOpeningBalanceBundleDto[]>('postgres_list_opening_balance_bundles', {
      updatedAfter: options.updatedAfter,
      limit: options.limit,
    });
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteOpeningBalanceBundleDto | null>('postgres_get_opening_balance_bundle', { id });
  },

  async upsert(input: RemoteOpeningBalanceBundleDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteOpeningBalanceBundleDto>('postgres_upsert_opening_balance_bundle', { input });
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

export const cooperativeMemberCodePostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteCooperativeMemberCodeDto[]>('postgres_list_cooperative_member_codes');
  },

  async upsert(input: RemoteCooperativeMemberCodeDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCooperativeMemberCodeDto>('postgres_upsert_cooperative_member_code', { input });
  },
};

export const cooperativeAreaPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteCooperativeAreaDto[]>('postgres_list_cooperative_areas');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCooperativeAreaDto | null>('postgres_get_cooperative_area', { id });
  },

  async upsert(input: RemoteCooperativeAreaDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCooperativeAreaDto>('postgres_upsert_cooperative_area', { input });
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

  async delete(id: string) {
    if (!isTauriRuntime()) return false;
    return invoke<boolean>('postgres_delete_cooperative_loan_application', { id });
  },

  async deleteMigration(id: string) {
    if (!isTauriRuntime()) return false;
    return invoke<boolean>('postgres_delete_cooperative_loan_migration', { id });
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

export const cooperativePostingPostgresAdapter = {
  async registerAccounts(
    sessionToken: string,
    accounts: RemoteCooperativePostingAccountDto[],
  ) {
    if (!isTauriRuntime()) return accounts;
    return invoke<RemoteCooperativePostingAccountDto[]>(
      'postgres_register_cooperative_posting_accounts',
      {
        input: {
          session_token: sessionToken,
          accounts,
        },
      },
    );
  },

  async postPayment(input: RemotePostCooperativeLoanPaymentInput) {
    if (!isTauriRuntime()) return null;
    return invoke<RemotePostCooperativeLoanPaymentOutcome>(
      'postgres_post_cooperative_loan_payment',
      { input },
    );
  },

  async postPaymentBatch(input: RemotePostCooperativeLoanPaymentInput) {
    if (!isTauriRuntime()) return null;
    return invoke<RemotePostCooperativeLoanPaymentBatchOutcome>(
      'postgres_post_cooperative_loan_payment_batch',
      { input },
    );
  },

  async listApprovalRequests(sessionToken: string) {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteCooperativePaymentApprovalRequestDto[]>(
      'postgres_list_cooperative_payment_approval_requests',
      { sessionToken },
    );
  },

  async requestReversal(input: {
    session_token: string;
    payment_id: string;
    reason: string;
  }) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCooperativePaymentApprovalRequestDto>(
      'postgres_request_cooperative_payment_reversal',
      { input },
    );
  },

  async approveRequest(input: {
    session_token: string;
    request_id: string;
    notes?: string;
  }) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCooperativePaymentApprovalRequestDto>(
      'postgres_approve_cooperative_payment_request',
      { input },
    );
  },

  async rejectRequest(input: {
    session_token: string;
    request_id: string;
    notes?: string;
  }) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteCooperativePaymentApprovalRequestDto>(
      'postgres_reject_cooperative_payment_request',
      { input },
    );
  },

  async listPaymentInstallmentReconciliation(sessionToken: string) {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteCooperativePaymentInstallmentReconciliationDto[]>(
      'postgres_list_cooperative_payment_installment_reconciliation',
      { sessionToken },
    );
  },
};

export const cooperativeCollectionEventPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteCooperativeLoanCollectionEventDto[]>(
      'postgres_list_cooperative_loan_collection_events',
    );
  },

  async record(input: RemoteRecordCooperativeLoanCollectionEventInput) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteRecordCooperativeLoanCollectionEventResult>(
      'postgres_record_cooperative_loan_collection_event',
      { input },
    );
  },
};
