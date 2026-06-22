export interface WholesalePrice {
  min_quantity: number;
  price: number;
  price_type?: 'unit' | 'bundle'; // 'unit' = price per item, 'bundle' = price for min_quantity items
}

export type ProductUnit = string;
export type SalesUnitCategory = 'discrete' | 'weighted';
export type UnitDefinitionType = 'measurement' | 'count' | 'package' | 'time';
export type ProductCategory =
  | 'bumbu'
  | 'sembako'
  | 'makanan_instan'
  | 'snack'
  | 'minuman'
  | 'household_cleaning'
  | 'laundry'
  | 'personal_care'
  | 'non_consumable'
  | string;

export interface UnitDefinition {
  id: ProductUnit;
  name: string;
  type: UnitDefinitionType;
  canBeBaseUnit: boolean;
  canBeConversionUnit: boolean;
  isPreset: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface UnitConversion {
  id: string;
  fromUnit: string;
  toUnit: string;
  ratio: number;
  isPreset: boolean;
  label: string;
  unitType?: 'measurement' | 'package' | 'time';
  scope?: 'global' | 'product';
  allowPriceFallback?: boolean;
  isDeprecated?: boolean;
}

export interface ProductUnitMapping {
  unit: ProductUnit;
  base_unit: ProductUnit;
  ratio: number; // 1 unit = ratio base_unit
}

export interface Product {
  id: string;
  name: string;
  category?: ProductCategory;
  purchase_unit: ProductUnit;
  selling_unit: ProductUnit;
  purchase_price: number; // Harga per purchase_unit
  selling_price: number;  // Harga per selling_unit (bisa disimpan per kg tapi nanti dikonversi)
  stock: number;          // Stok selalu disimpan dalam base unit (biasanya purchase_unit)
  sku?: string;
  wholesale_prices?: WholesalePrice[];
  sellable_units?: ProductUnit[]; // Units cashier can select when selling (defaults to [selling_unit])
  unit_mappings?: ProductUnitMapping[]; // Product-specific conversions, e.g. 1 dus = 24 pcs
  created_at: string;
  updated_at: string;
  sync_status?: ProductSyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}

export type PaymentMethod = 'TUNAI' | 'NON_TUNAI';
export type ReceiptPrintStatus = 'pending' | 'printed' | 'print_failed';
export type TransactionStatus = 'COMPLETED' | 'VOIDED';
export type CashierSessionStatus = 'OPEN' | 'CLOSED';
export type CashierSessionBalanceStatus = 'BALANCED' | 'NON_BALANCED';
export type CooperativeFieldCashSessionStatus = 'OPEN' | 'CLOSED';
export type CooperativeFieldCashSessionBalanceStatus = 'BALANCED' | 'NON_BALANCED';
export type CooperativeFieldCashMovementKind =
  | 'DROPPING_FROM_FINANCE'
  | 'STORTING_LOAN_PAYMENT'
  | 'STORTING_SAVING_DEPOSIT'
  | 'LOAN_DISBURSEMENT'
  | 'SAVING_WITHDRAWAL'
  | 'IPTW_PAYOUT'
  | 'DEPOSIT_TO_FINANCE';
export type SyncQueueOperation = 'create' | 'update' | 'delete';
export type SyncQueueStatus = 'pending' | 'processing' | 'synced' | 'failed';
export type UserRole = 'OWNER' | 'ADMIN' | 'KASIR' | 'GUDANG';
export type PromoType = 'percent' | 'fixed';
export type PromoAppliesTo = 'all' | 'product' | 'category';
export type ContactType = 'CUSTOMER' | 'SUPPLIER' | 'CUSTOMER_SUPPLIER' | 'OTHER';
export type RetailMembershipStatus = 'ACTIVE' | 'INACTIVE';
export type MembershipPointTransactionType =
  | 'EARN'
  | 'REDEEM'
  | 'VOID_EARN_REVERSAL'
  | 'VOID_REDEEM_REVERSAL'
  | 'ADJUSTMENT';
export type ProjectStatus = 'PLANNED' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
export type TaxRateType = 'PERCENTAGE';
export type TaxCalculationMode = 'EXCLUSIVE' | 'INCLUSIVE';
export type CurrencyRateSource = 'BI_KURS_TRANSAKSI' | 'MANUAL' | 'SYSTEM';
export type CurrencyRateBasis = 'MID';
export type SalesDocumentType =
  | 'SALES_QUOTATION'
  | 'SALES_ORDER'
  | 'SALES_DELIVERY'
  | 'SALES_INVOICE';
export type SalesDocumentStatus = 'DRAFT' | 'ISSUED' | 'CONVERTED' | 'VOIDED';
export type SalesInvoicePaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';
export type SalesInvoicePaymentRecordStatus = 'ACTIVE' | 'VOIDED';
export type SalesDocumentMarginBasis = 'BEFORE_TAX' | 'AFTER_TAX';
export type PurchaseDocumentType =
  | 'PURCHASE_REQUEST'
  | 'REQUEST_FOR_QUOTATION'
  | 'PURCHASE_ORDER'
  | 'PURCHASE_RECEIPT'
  | 'PURCHASE_INVOICE'
  | 'PURCHASE_RETURN';
export type PurchaseDocumentStatus = 'DRAFT' | 'ISSUED' | 'CONVERTED' | 'VOIDED';
export type PurchaseInvoicePaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';
export type PurchaseInvoicePaymentRecordStatus = 'ACTIVE' | 'VOIDED';
export type PurchaseCostStatus =
  | 'FINAL'
  | 'ESTIMATED'
  | 'PENDING';
export type PurchaseCostEstimateSource =
  | 'LAST_PURCHASE_PRICE'
  | 'PRODUCT_PURCHASE_PRICE'
  | 'MANUAL'
  | 'UNKNOWN';
export type PurchaseAdditionalCostTreatment =
  | 'INVENTORY_COST'
  | 'OPERATING_EXPENSE'
  | 'IGNORE_FOR_MVP';
export type ReceivableAgingBucket =
  | 'CURRENT'
  | 'OVERDUE_1_30'
  | 'OVERDUE_31_60'
  | 'OVERDUE_61_90'
  | 'OVERDUE_90_PLUS';
export type SalesReturnSourceType =
  | 'SALES_DELIVERY'
  | 'SALES_INVOICE'
  | 'POS_TRANSACTION';
export type SalesReturnStatus = 'DRAFT' | 'ISSUED' | 'VOIDED';
export type SalesReturnResolution =
  | 'NO_FINANCE'
  | 'REFUND'
  | 'CREDIT_NOTE';
export type SalesReturnItemCondition =
  | 'SELLABLE'
  | 'DAMAGED'
  | 'DISCARDED';

export type Permission =
  | 'TRANSACTION_VOID'
  | 'TRANSACTION_DELETE'
  | 'TRANSACTION_EDIT_PRICE'
  | 'PROFIT_VIEW'
  | 'CASHIER_ACCESS'
  | 'STOCK_ACCESS'
  | 'PRODUCT_MANAGE'
  | 'PRODUCTION_MANAGE'
  | 'STOCK_OPNAME_MANAGE'
  | 'PROMO_MANAGE'
  | 'CONTACT_MANAGE'
  | 'WAREHOUSE_MANAGE'
  | 'CURRENCY_MANAGE'
  | 'AREA_MANAGE'
  | 'EMPLOYEE_MANAGE'
  | 'DEPARTMENT_MANAGE'
  | 'PROJECT_MANAGE'
  | 'TAX_MANAGE'
  | 'UNIT_MANAGE'
  | 'STOCK_PURCHASE_ACCESS'
  | 'SALES_QUOTATION_MANAGE'
  | 'SALES_ORDER_MANAGE'
  | 'SALES_DELIVERY_MANAGE'
  | 'SALES_INVOICE_MANAGE'
  | 'PURCHASE_REQUEST_MANAGE'
  | 'PURCHASE_RFQ_MANAGE'
  | 'PURCHASE_ORDER_MANAGE'
  | 'PURCHASE_RECEIPT_MANAGE'
  | 'PURCHASE_INVOICE_MANAGE'
  | 'PURCHASE_RETURN_MANAGE'
  | 'REPORT_POS_SALES_VIEW'
  | 'REPORT_DEPOSIT_VIEW'
  | 'REPORT_TRANSACTION_DETAIL_VIEW'
  | 'REPORT_PURCHASE_VIEW'
  | 'REPORT_EXPENSE_VIEW'
  | 'REPORT_PROFIT_LOSS_VIEW'
  | 'REPORT_AGING_VIEW'
  | 'REPORT_STOCK_CARD_VIEW'
  | 'FINANCE_ACCESS'
  | 'JOURNAL_MANAGE'
  | 'SALES_RETURN_MANAGE'
  | 'COOPERATIVE_MEMBER_VIEW'
  | 'COOPERATIVE_MEMBER_MANAGE'
  | 'COOPERATIVE_SAVING_VIEW'
  | 'COOPERATIVE_SAVING_MANAGE'
  | 'COOPERATIVE_LOAN_VIEW'
  | 'COOPERATIVE_LOAN_MANAGE'
  | 'COOPERATIVE_INSTALLMENT_VIEW'
  | 'COOPERATIVE_PAYMENT_CREATE'
  | 'COOPERATIVE_PAYMENT_APPROVE'
  | 'COOPERATIVE_BILLING_ACCESS'
  | 'COOPERATIVE_FIELD_CASH_VIEW'
  | 'COOPERATIVE_FIELD_CASH_MANAGE'
  | 'COOPERATIVE_REPORT_VIEW'
  | 'COOPERATIVE_OVERVIEW_REPORT_VIEW'
  | 'COOPERATIVE_CASH_REPORT_VIEW'
  | 'COOPERATIVE_DAILY_TARGET_REPORT_VIEW'
  | 'COOPERATIVE_DAILY_STORTING_REPORT_VIEW'
  | 'COOPERATIVE_DAILY_DROP_REPORT_VIEW'
  | 'COOPERATIVE_WEEKLY_DROP_REPORT_VIEW'
  | 'COOPERATIVE_IPTW_REPORT_VIEW'
  | 'COOPERATIVE_MEMBER_REGISTER_REPORT_VIEW'
  | 'COOPERATIVE_INSTALLMENT_BOOK_REPORT_VIEW'
  | 'COOPERATIVE_CASH_FLOW_REPORT_VIEW'
  | 'COOPERATIVE_LEDGER_REPORT_VIEW'
  | 'COOPERATIVE_AREA_ALL'
  | 'SETTINGS_ACCESS'
  | 'USER_MANAGE'
  | 'ACTIVITY_LOG_VIEW';

export interface AuthUser {
  id: string;
  name: string;
  role: UserRole;
  role_id?: string;
  role_name?: string;
  employee_id?: string;
  email?: string;
  pin_hash: string;
  pin_salt: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  sync_status?: AuthUserSyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}

export interface Role {
  id: string;
  name: string;
  code?: UserRole | string;
  description?: string;
  is_system: boolean;
  is_owner: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  sync_status?: EntitySyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}

export interface RolePermission {
  id: string;
  role_id: string;
  permission_code: Permission;
  created_at: string;
  updated_at: string;
  sync_status?: EntitySyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}

export interface AuthSession {
  id: string;
  user_id: string;
  created_at: string;
  last_active_at: string;
  server_session_token?: string;
  server_session_expires_at?: string;
}

export interface ActivityLog {
  id: string;
  user_id?: string;
  user_name?: string;
  role?: UserRole;
  action: string;
  entity: string;
  entity_id?: string;
  description: string;
  created_at: string;
}

export interface SyncQueueItem {
  id: string;
  entity: string;
  entity_id: string;
  operation: SyncQueueOperation;
  payload: unknown;
  status: SyncQueueStatus;
  attempts: number;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface Promo {
  id: string;
  name: string;
  type: PromoType;
  value: number;
  applies_to: PromoAppliesTo;
  product_ids?: string[];
  categories?: ProductCategory[];
  start_at?: string | null;
  end_at?: string | null;
  min_qty?: number | null;
  min_total?: number | null;
  voucher_code?: string | null;
  active: boolean;
  priority: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  name: string;
  contact_type: ContactType;
  phone?: string;
  email?: string;
  address?: string;
  company_name?: string;
  tax_number?: string;
  notes?: string;
  is_active: boolean;
  is_member?: boolean;
  membership_number?: string;
  membership_status?: RetailMembershipStatus;
  membership_joined_at?: string;
  membership_points_balance?: number;
  created_at: string;
  updated_at: string;
  sync_status?: ContactSyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}

export interface MembershipSetting {
  id: string;
  earning_amount: number;
  earning_points: number;
  point_value: number;
  redeem_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface MembershipPointTransaction {
  id: string;
  contact_id: string;
  membership_number?: string;
  member_name: string;
  transaction_id?: string;
  transaction_number?: string;
  type: MembershipPointTransactionType;
  points_delta: number;
  amount_value: number;
  balance_after: number;
  reason: string;
  created_at: string;
  created_by?: string;
  created_by_name?: string;
}

export interface Warehouse {
  id: string;
  name: string;
  code?: string;
  address?: string;
  phone?: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  sync_status?: WarehouseSyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}

export type EntitySyncStatus = 'pending' | 'synced' | 'failed';
export type AuthUserSyncStatus = EntitySyncStatus;
export type ContactSyncStatus = EntitySyncStatus;
export type DepartmentSyncStatus = EntitySyncStatus;
export type ProductSyncStatus = EntitySyncStatus;
export type ProjectSyncStatus = EntitySyncStatus;
export type PurchaseDocumentSyncStatus = EntitySyncStatus;
export type SalesDocumentSyncStatus = EntitySyncStatus;
export type TaxSyncStatus = EntitySyncStatus;
export type WarehouseSyncStatus = EntitySyncStatus;
export type FinanceTransactionSyncStatus = EntitySyncStatus;
export type JournalEntrySyncStatus = EntitySyncStatus;
export type CurrencySyncStatus = EntitySyncStatus;
export type CurrencyRateSyncStatus = EntitySyncStatus;
export type CooperativeMemberSyncStatus = EntitySyncStatus;
export type CooperativeSavingTransactionSyncStatus = EntitySyncStatus;
export type CooperativeMemberSavingBalanceSyncStatus = EntitySyncStatus;
export type CooperativeLoanSyncStatus = EntitySyncStatus;
export type CooperativeLoanInstallmentSyncStatus = EntitySyncStatus;
export type CooperativeLoanPaymentSyncStatus = EntitySyncStatus;
export type CooperativeLoanCollectionEventSyncStatus = EntitySyncStatus;

export interface CooperativeArea {
  id: string;
  name: string;
  code?: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Employee {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  position?: string;
  user_id?: string;
  user_name?: string;
  login_role_id?: string;
  field_cash_account_id?: string;
  field_cash_account_code?: string;
  field_cash_account_name?: string;
  pin_hash?: string;
  pin_salt?: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmployeeArea {
  id: string;
  employee_id: string;
  area_id: string;
  area_name: string;
  area_code?: string;
  created_at: string;
  updated_at: string;
}

export type CooperativeCollectionWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface EmployeeCollectionSchedule {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_position?: string;
  area_id: string;
  area_name: string;
  area_code?: string;
  weekday: CooperativeCollectionWeekday;
  effective_from?: string;
  effective_until?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Currency {
  id: string;
  code: string;
  name: string;
  symbol?: string;
  decimal_places: number;
  is_base: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  sync_status?: CurrencySyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}

export interface CurrencyRate {
  id: string;
  currency_code: string;
  base_currency_code: string;
  rate_date: string;
  source: CurrencyRateSource;
  unit_amount: number;
  bi_buy_rate?: number;
  bi_sell_rate?: number;
  middle_rate: number;
  fetched_at?: string;
  created_at: string;
  updated_at: string;
  sync_status?: CurrencyRateSyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}

export interface Department {
  id: string;
  name: string;
  code?: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  sync_status?: DepartmentSyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}

export interface Project {
  id: string;
  name: string;
  code?: string;
  status: ProjectStatus;
  contact_id?: string;
  contact_name?: string;
  department_id?: string;
  department_code?: string;
  department_name?: string;
  start_date?: string;
  end_date?: string;
  budget_amount?: number;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  sync_status?: ProjectSyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}

export interface Tax {
  id: string;
  name: string;
  code?: string;
  rate: number;
  rate_type: TaxRateType;
  calculation_mode: TaxCalculationMode;
  description?: string;
  effective_from?: string;
  effective_to?: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  sync_status?: TaxSyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}

export interface SalesDocument {
  id: string;
  document_number: string;
  type: SalesDocumentType;
  status: SalesDocumentStatus;
  contact_id?: string;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  customer_address?: string;
  customer_company_name?: string;
  customer_tax_number?: string;
  department_id?: string;
  department_code?: string;
  department_name?: string;
  project_id?: string;
  project_code?: string;
  project_name?: string;
  document_date: string;
  expired_at?: string;
  due_date?: string;
  warehouse_id?: string;
  warehouse_code?: string;
  warehouse_name?: string;
  source_document_id?: string;
  source_document_number?: string;
  source_document_type?: SalesDocumentType;
  currency_code?: string;
  currency_name?: string;
  currency_symbol?: string;
  base_currency_code?: string;
  exchange_rate?: number;
  exchange_rate_source?: CurrencyRateSource;
  exchange_rate_basis?: CurrencyRateBasis;
  exchange_rate_date?: string;
  subtotal_amount?: number;
  foreign_subtotal_amount?: number;
  discount_type?: PromoType;
  discount_value?: number;
  discount_amount?: number;
  foreign_discount_amount?: number;
  discount_account_id?: string;
  discount_account_code?: string;
  discount_account_name?: string;
  tax_id?: string;
  tax_name?: string;
  tax_code?: string;
  tax_rate?: number;
  tax_calculation_mode?: TaxCalculationMode;
  tax_amount?: number;
  foreign_tax_amount?: number;
  total_amount?: number;
  foreign_total_amount?: number;
  payment_status?: SalesInvoicePaymentStatus;
  paid_amount?: number;
  paid_at?: string;
  payment_method?: PaymentMethod;
  cash_account_id?: string;
  cash_account_code?: string;
  cash_account_name?: string;
  payment_channel?: string;
  finance_transaction_id?: string;
  notes?: string;
  issued_at?: string;
  voided_at?: string;
  void_reason?: string;
  version?: number;
  created_by?: string;
  created_by_name?: string;
  updated_by?: string;
  updated_by_name?: string;
  created_at: string;
  updated_at: string;
  sync_status?: SalesDocumentSyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}

export interface SalesInvoicePayment {
  id: string;
  sales_document_id: string;
  document_number: string;
  contact_id?: string;
  customer_name: string;
  amount: number;
  foreign_amount?: number;
  currency_code?: string;
  currency_name?: string;
  currency_symbol?: string;
  base_currency_code?: string;
  exchange_rate?: number;
  exchange_rate_source?: CurrencyRateSource;
  exchange_rate_basis?: CurrencyRateBasis;
  exchange_rate_date?: string;
  paid_at: string;
  payment_method?: PaymentMethod;
  payment_channel?: string;
  cash_account_id?: string;
  cash_account_code?: string;
  cash_account_name?: string;
  finance_transaction_id?: string;
  journal_entry_id?: string;
  reversal_finance_transaction_id?: string;
  reversal_journal_entry_id?: string;
  notes?: string;
  status: SalesInvoicePaymentRecordStatus;
  voided_at?: string;
  void_reason?: string;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface AccountsReceivableRow {
  sales_document_id: string;
  document_number: string;
  contact_id?: string;
  customer_name: string;
  document_date: string;
  due_date?: string;
  currency_code?: string;
  currency_name?: string;
  currency_symbol?: string;
  base_currency_code?: string;
  exchange_rate?: number;
  exchange_rate_source?: CurrencyRateSource;
  exchange_rate_basis?: CurrencyRateBasis;
  exchange_rate_date?: string;
  total_amount: number;
  foreign_total_amount?: number;
  paid_amount: number;
  foreign_paid_amount?: number;
  return_credit_amount: number;
  foreign_return_credit_amount?: number;
  balance_due: number;
  foreign_balance_due?: number;
  payment_status: SalesInvoicePaymentStatus;
  aging_bucket: ReceivableAgingBucket;
  overdue_days: number;
}

export interface SalesDocumentItem {
  id: string;
  document_id: string;
  product_id: string;
  product_name: string;
  sku?: string;
  unit: ProductUnit;
  quantity: number;
  ordered_quantity?: number;
  delivered_quantity?: number;
  price?: number;
  currency_code?: string;
  exchange_rate?: number;
  exchange_rate_source?: CurrencyRateSource;
  exchange_rate_basis?: CurrencyRateBasis;
  exchange_rate_date?: string;
  foreign_price?: number;
  discount_type?: PromoType;
  discount_value?: number;
  discount_amount?: number;
  foreign_discount_amount?: number;
  tax_id?: string;
  tax_name?: string;
  tax_code?: string;
  tax_rate?: number;
  tax_calculation_mode?: TaxCalculationMode;
  tax_base_amount?: number;
  foreign_tax_base_amount?: number;
  tax_amount?: number;
  foreign_tax_amount?: number;
  subtotal?: number;
  foreign_subtotal?: number;
  total_amount?: number;
  foreign_total_amount?: number;
  purchase_price?: number;
  original_price?: number;
  is_price_edited?: boolean;
  price_edited_by?: string;
  price_edited_at?: string;
  created_at: string;
}

export interface PurchaseDocument {
  id: string;
  document_number: string;
  type: PurchaseDocumentType;
  status: PurchaseDocumentStatus;
  contact_id?: string;
  supplier_name?: string;
  supplier_phone?: string;
  supplier_email?: string;
  supplier_address?: string;
  supplier_company_name?: string;
  supplier_tax_number?: string;
  department_id?: string;
  department_code?: string;
  department_name?: string;
  project_id?: string;
  project_code?: string;
  project_name?: string;
  document_date: string;
  required_date?: string;
  quotation_due_date?: string;
  due_date?: string;
  warehouse_id?: string;
  warehouse_code?: string;
  warehouse_name?: string;
  source_document_id?: string;
  source_document_number?: string;
  source_document_type?: PurchaseDocumentType;
  currency_code?: string;
  currency_name?: string;
  currency_symbol?: string;
  base_currency_code?: string;
  exchange_rate?: number;
  exchange_rate_source?: CurrencyRateSource;
  exchange_rate_basis?: CurrencyRateBasis;
  exchange_rate_date?: string;
  subtotal_amount?: number;
  foreign_subtotal_amount?: number;
  discount_type?: PromoType;
  discount_value?: number;
  discount_amount?: number;
  foreign_discount_amount?: number;
  discount_account_id?: string;
  discount_account_code?: string;
  discount_account_name?: string;
  tax_id?: string;
  tax_name?: string;
  tax_code?: string;
  tax_rate?: number;
  tax_calculation_mode?: TaxCalculationMode;
  tax_amount?: number;
  foreign_tax_amount?: number;
  total_amount?: number;
  foreign_total_amount?: number;
  payment_status?: PurchaseInvoicePaymentStatus;
  paid_amount?: number;
  paid_at?: string;
  payment_method?: PaymentMethod;
  cash_account_id?: string;
  cash_account_code?: string;
  cash_account_name?: string;
  finance_transaction_id?: string;
  notes?: string;
  cost_status?: PurchaseCostStatus;
  delivery_note_number?: string;
  delivery_note_date?: string;
  supplier_invoice_number?: string;
  supplier_invoice_date?: string;
  additional_cost_treatment?: PurchaseAdditionalCostTreatment;
  additional_cost_amount?: number;
  supplier_discount_amount?: number;
  supplier_tax_amount?: number;
  cost_finalized_at?: string;
  cost_finalized_by?: string;
  cost_finalized_by_name?: string;
  issued_at?: string;
  voided_at?: string;
  void_reason?: string;
  version?: number;
  created_by?: string;
  created_by_name?: string;
  updated_by?: string;
  updated_by_name?: string;
  created_at: string;
  updated_at: string;
  sync_status?: PurchaseDocumentSyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}

export interface PurchaseInvoicePayment {
  id: string;
  purchase_document_id: string;
  document_number: string;
  contact_id?: string;
  supplier_name: string;
  amount: number;
  foreign_amount?: number;
  currency_code?: string;
  currency_name?: string;
  currency_symbol?: string;
  base_currency_code?: string;
  exchange_rate?: number;
  exchange_rate_source?: CurrencyRateSource;
  exchange_rate_basis?: CurrencyRateBasis;
  exchange_rate_date?: string;
  paid_at: string;
  payment_method?: PaymentMethod;
  payment_channel?: string;
  cash_account_id?: string;
  cash_account_code?: string;
  cash_account_name?: string;
  finance_transaction_id?: string;
  journal_entry_id?: string;
  reversal_finance_transaction_id?: string;
  reversal_journal_entry_id?: string;
  notes?: string;
  status: PurchaseInvoicePaymentRecordStatus;
  voided_at?: string;
  void_reason?: string;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface AccountsPayableRow {
  purchase_document_id: string;
  document_number: string;
  contact_id?: string;
  supplier_name: string;
  document_date: string;
  due_date?: string;
  currency_code?: string;
  currency_name?: string;
  currency_symbol?: string;
  base_currency_code?: string;
  exchange_rate?: number;
  exchange_rate_source?: CurrencyRateSource;
  exchange_rate_basis?: CurrencyRateBasis;
  exchange_rate_date?: string;
  total_amount: number;
  foreign_total_amount?: number;
  paid_amount: number;
  foreign_paid_amount?: number;
  return_credit_amount: number;
  foreign_return_credit_amount?: number;
  balance_due: number;
  foreign_balance_due?: number;
  payment_status: PurchaseInvoicePaymentStatus;
  aging_bucket: ReceivableAgingBucket;
  overdue_days: number;
}

export interface PurchaseDocumentItem {
  id: string;
  document_id: string;
  product_id: string;
  product_name: string;
  sku?: string;
  unit: ProductUnit;
  quantity: number;
  ordered_quantity?: number;
  received_quantity?: number;
  price?: number;
  currency_code?: string;
  exchange_rate?: number;
  exchange_rate_source?: CurrencyRateSource;
  exchange_rate_basis?: CurrencyRateBasis;
  exchange_rate_date?: string;
  foreign_price?: number;
  discount_type?: PromoType;
  discount_value?: number;
  discount_amount?: number;
  foreign_discount_amount?: number;
  tax_id?: string;
  tax_name?: string;
  tax_code?: string;
  tax_rate?: number;
  tax_calculation_mode?: TaxCalculationMode;
  tax_base_amount?: number;
  foreign_tax_base_amount?: number;
  tax_amount?: number;
  foreign_tax_amount?: number;
  subtotal?: number;
  foreign_subtotal?: number;
  total_amount?: number;
  foreign_total_amount?: number;
  cost_status?: PurchaseCostStatus;
  estimate_source?: PurchaseCostEstimateSource;
  estimated_price?: number;
  final_price?: number;
  invoiced_quantity?: number;
  quantity_variance?: number;
  additional_cost_allocation?: number;
  supplier_discount_allocation?: number;
  supplier_tax_allocation?: number;
  final_landed_cost_per_unit?: number;
  cost_finalized_at?: string;
  cost_variance_amount?: number;
  created_at: string;
}

export interface PurchaseCostReconciliation {
  id: string;
  purchase_document_id: string;
  purchase_document_number: string;
  supplier_invoice_number?: string;
  supplier_invoice_date?: string;
  additional_cost_treatment: PurchaseAdditionalCostTreatment;
  additional_cost_amount: number;
  supplier_discount_amount: number;
  supplier_tax_amount: number;
  total_estimated_cost: number;
  total_final_cost: number;
  total_variance_amount: number;
  sold_cost_variance_amount: number;
  remaining_stock_variance_amount: number;
  notes?: string;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
}

export interface PurchaseCostReconciliationItem {
  id: string;
  reconciliation_id: string;
  purchase_document_item_id: string;
  product_id: string;
  product_name: string;
  received_quantity: number;
  invoiced_quantity: number;
  quantity_variance: number;
  sold_quantity_at_reconciliation: number;
  remaining_quantity_at_reconciliation: number;
  estimated_price: number;
  final_price: number;
  additional_cost_allocation: number;
  supplier_discount_allocation: number;
  supplier_tax_allocation: number;
  final_landed_cost_per_unit: number;
  variance_per_unit: number;
  sold_cost_variance_amount: number;
  remaining_stock_variance_amount: number;
  created_at: string;
}

export interface SalesReturn {
  id: string;
  return_number: string;
  status: SalesReturnStatus;
  source_type: SalesReturnSourceType;
  source_id: string;
  source_number: string;
  source_document_type?: SalesDocumentType;
  contact_id?: string;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  customer_address?: string;
  document_date: string;
  resolution: SalesReturnResolution;
  reason?: string;
  subtotal_amount: number;
  discount_amount?: number;
  tax_amount?: number;
  total_amount: number;
  refund_amount?: number;
  credit_amount?: number;
  finance_transaction_id?: string;
  reversal_finance_transaction_id?: string;
  source_stock_document_id?: string;
  source_stock_document_type?: 'SALES_DELIVERY';
  source_stock_document_number?: string;
  issued_at?: string;
  voided_at?: string;
  void_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface SalesReturnItem {
  id: string;
  return_id: string;
  source_item_id: string;
  product_id: string;
  product_name: string;
  sku?: string;
  unit: ProductUnit;
  quantity: number;
  source_quantity: number;
  price: number;
  discount_amount?: number;
  tax_amount?: number;
  subtotal: number;
  total_amount: number;
  purchase_price?: number;
  profit_reversal?: number;
  condition: SalesReturnItemCondition;
  restock_quantity?: number;
  source_stock_item_id?: string;
  source_stock_document_id?: string;
  source_stock_document_type?: 'SALES_DELIVERY';
  created_at: string;
}

export interface SalesReturnSourceItem {
  source_item_id: string;
  product_id: string;
  product_name: string;
  sku?: string;
  unit: ProductUnit;
  source_quantity: number;
  remaining_quantity: number;
  price: number;
  discount_amount?: number;
  tax_amount?: number;
  subtotal: number;
  total_amount: number;
  purchase_price?: number;
  profit?: number;
  can_restock?: boolean;
  source_stock_item_id?: string;
  source_stock_document_id?: string;
  source_stock_document_type?: 'SALES_DELIVERY';
  source_stock_document_number?: string;
}

export interface SalesReturnLimitSnapshot {
  returnable_quantity_by_source_item_id: Record<string, number>;
  credit_note_limit: number;
  refund_limit: number;
  balance_before_return: number;
  refundable_cash: number;
  invoice_total: number;
  paid_amount: number;
  existing_credit: number;
  existing_refund: number;
  can_restock: boolean;
}

export interface SalesReturnableSource {
  source_type: SalesReturnSourceType;
  source_id: string;
  source_number: string;
  source_document_type?: SalesDocumentType;
  status: SalesDocumentStatus | TransactionStatus;
  contact_id?: string;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  customer_address?: string;
  document_date: string;
  source_chain_label?: string;
  source_chain_notice?: string;
  source_stock_document_id?: string;
  source_stock_document_type?: 'SALES_DELIVERY';
  source_stock_document_number?: string;
  can_restock?: boolean;
  limits?: SalesReturnLimitSnapshot;
  items: SalesReturnSourceItem[];
}

export interface IssuedSalesReturnSummaryItem {
  source_item_id: string;
  quantity: number;
  total_amount: number;
  refund_amount: number;
  credit_amount: number;
  restock_quantity: number;
  profit_reversal: number;
}

export interface IssuedSalesReturnSummary {
  source_type: SalesReturnSourceType;
  source_id: string;
  return_count: number;
  subtotal_amount: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  refund_amount: number;
  credit_amount: number;
  restock_quantity: number;
  profit_reversal: number;
  items: Record<string, IssuedSalesReturnSummaryItem>;
}

export interface PromoAdjustment {
  promo_id: string;
  promo_name: string;
  scope: 'line' | 'order';
  product_id?: string;
  amount: number;
  reason: string;
}

export interface AppliedPromoSnapshot {
  promo_id: string;
  name: string;
  type: PromoType;
  value: number;
  applies_to: PromoAppliesTo;
  product_ids?: string[];
  categories?: ProductCategory[];
  voucher_code?: string | null;
  adjustments: PromoAdjustment[];
}

export interface Transaction {
  id: string;
  transaction_number: string;
  cashier_session_id?: string;
  cashier_session_number?: string;
  cashier_user_id?: string;
  cashier_user_name?: string;
  member_contact_id?: string;
  member_number?: string;
  member_name?: string;
  member_phone?: string;
  membership_points_earned?: number;
  membership_points_redeemed?: number;
  membership_point_discount_amount?: number;
  membership_points_balance_after?: number;
  subtotal_amount?: number;
  discount_amount?: number;
  discount_breakdown?: Array<{ label: string; amount: number }>;
  applied_promos_snapshot?: AppliedPromoSnapshot[];
  total_amount: number;
  payment_amount: number;
  change_amount: number;
  payment_method: PaymentMethod;
  status?: TransactionStatus;
  voided_at?: string;
  void_reason?: string;
  receipt_status?: ReceiptPrintStatus;
  receipt_printed_at?: string;
  receipt_print_error?: string;
  created_at: string;
}

export interface CashierSession {
  id: string;
  session_number: string;
  status: CashierSessionStatus;
  cashier_user_id?: string;
  cashier_user_name?: string;
  opened_at: string;
  opening_cash_amount: number;
  opening_note?: string;
  closed_at?: string;
  closed_by_user_id?: string;
  closed_by_user_name?: string;
  closing_cash_amount?: number;
  closing_note?: string;
  expected_cash_amount?: number;
  cash_sales_amount?: number;
  non_cash_sales_amount?: number;
  total_sales_amount?: number;
  voided_sales_amount?: number;
  transaction_count?: number;
  voided_transaction_count?: number;
  cash_difference_amount?: number;
  balance_status?: CashierSessionBalanceStatus;
  created_at: string;
  updated_at: string;
}

export interface CooperativeFieldCashSession {
  id: string;
  session_number: string;
  status: CooperativeFieldCashSessionStatus;

  employee_id: string;
  employee_name: string;
  employee_position?: string;

  cash_account_id: string;
  cash_account_code: string;
  cash_account_name: string;

  opened_at: string;
  opening_cash_amount: number;
  expected_opening_cash_amount: number;
  opening_difference_amount: number;
  opening_note?: string;

  closed_at?: string;
  closing_cash_amount?: number;
  expected_closing_cash_amount?: number;
  closing_difference_amount?: number;
  closing_note?: string;
  balance_status?: CooperativeFieldCashSessionBalanceStatus;

  dropping_from_finance_amount?: number;
  storting_loan_payment_amount?: number;
  storting_saving_deposit_amount?: number;
  loan_disbursement_amount?: number;
  saving_withdrawal_amount?: number;
  iptw_payout_amount?: number;
  deposit_to_finance_amount?: number;

  created_at: string;
  updated_at: string;
  created_by?: string;
  created_by_name?: string;
  updated_by?: string;
  updated_by_name?: string;
}

export interface TransactionItem {
  id: string;
  transaction_id: string;
  product_id: string;
  product_name: string;
  price: number;
  selling_price?: number;
  original_price?: number;
  is_price_edited?: boolean;
  price_edited_by?: string;
  price_edited_at?: string;
  purchase_price: number;
  quantity: number;
  unit: ProductUnit; // Satuan yang digunakan (misal: gram)
  unit_id?: ProductUnit;
  unit_label?: string;
  unit_category?: SalesUnitCategory;
  conversion_value?: number;
  base_unit?: ProductUnit;
  price_before_discount?: number;
  subtotal_before_discount?: number;
  discount_amount?: number;
  subtotal: number;
  profit: number;
  hpp_status?: PurchaseCostStatus;
  hpp_reconciled_at?: string;
  hpp_variance_amount?: number;
  profit_status?: 'FINAL' | 'ESTIMATED' | 'RECONCILED';
  created_at: string;
}

export interface StockPurchase {
  id: string;
  product_id: string;
  product_name: string;
  sku?: string;
  quantity: number;
  cost_per_unit: number;
  total_cost: number;
  created_at: string;
  updated_at: string;
}

export type StockOpnameStatus =
  | 'DRAFT'
  | 'REVIEWED'
  | 'POSTED'
  | 'CANCELLED';

export interface StockOpname {
  id: string;
  opname_number: string;
  status: StockOpnameStatus;
  counted_at: string;
  reviewed_at?: string;
  posted_at?: string;
  cancelled_at?: string;
  warehouse_id?: string;
  warehouse_code?: string;
  warehouse_name?: string;
  notes?: string;
  created_by?: string;
  created_by_name?: string;
  reviewed_by?: string;
  reviewed_by_name?: string;
  posted_by?: string;
  posted_by_name?: string;
  cancelled_by?: string;
  cancelled_by_name?: string;
  cancel_reason?: string;
  total_items: number;
  total_adjustment_in: number;
  total_adjustment_out: number;
  total_variance_value: number;
  created_at: string;
  updated_at: string;
  sync_status?: EntitySyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}

export interface StockOpnameItem {
  id: string;
  opname_id: string;
  product_id: string;
  product_name: string;
  sku?: string;
  category?: string;
  system_quantity: number;
  counted_quantity?: number;
  quantity_delta: number;
  unit: ProductUnit;
  cost_per_unit: number;
  variance_value: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export type ProductionOrderStatus = 'DRAFT' | 'POSTED' | 'VOIDED';

export interface ProductRecipe {
  id: string;
  finished_product_id: string;
  finished_product_name: string;
  output_quantity: number;
  output_unit: ProductUnit;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ProductRecipeItem {
  id: string;
  recipe_id: string;
  material_product_id: string;
  material_product_name: string;
  quantity: number;
  unit: ProductUnit;
  created_at: string;
  updated_at: string;
}

export interface ProductionOrder {
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
  posted_at?: string;
  voided_at?: string;
  void_reason?: string;
  notes?: string;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
  sync_status?: EntitySyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}

export interface ProductionOrderItem {
  id: string;
  production_order_id: string;
  material_product_id: string;
  material_product_name: string;
  sku?: string;
  quantity_used: number;
  unit: ProductUnit;
  stock_quantity_used: number;
  stock_unit: ProductUnit;
  cost_per_unit: number;
  total_cost: number;
  created_at: string;
  updated_at: string;
}

export interface ProductionOrderCost {
  id: string;
  production_order_id: string;
  name: string;
  amount: number;
  account_id?: string;
  account_code?: string;
  account_name?: string;
  created_at: string;
  updated_at: string;
}

export type StockMutationSourceType =
  | 'POS_TRANSACTION'
  | 'POS_TRANSACTION_VOID'
  | 'SALES_DELIVERY'
  | 'SALES_DELIVERY_VOID'
  | 'PURCHASE_RECEIPT'
  | 'PURCHASE_RECEIPT_VOID'
  | 'PURCHASE_INVOICE'
  | 'PURCHASE_INVOICE_VOID'
  | 'PURCHASE_RETURN'
  | 'PURCHASE_RETURN_VOID'
  | 'SALES_RETURN'
  | 'SALES_RETURN_VOID'
  | 'STOCK_OPNAME'
  | 'PRODUCTION_CONSUMPTION'
  | 'PRODUCTION_OUTPUT'
  | 'PRODUCTION_VOID'
  | 'SHOPPING_NOTE';

export interface StockMutation {
  id: string;
  product_id: string;
  product_name: string;
  sku?: string;
  warehouse_id?: string;
  warehouse_code?: string;
  warehouse_name?: string;
  source_type: StockMutationSourceType;
  source_id: string;
  source_number?: string;
  source_line_id: string;
  quantity_delta: number;
  unit: ProductUnit;
  stock_unit: ProductUnit;
  source_quantity?: number;
  source_unit?: ProductUnit;
  reason?: string;
  actor_user_id?: string;
  actor_user_name?: string;
  occurred_at: string;
  created_at: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  unit: ProductUnit; // Satuan yang dipilih (default product.selling_unit)
}

export interface BluetoothPrinterDevice {
  name: string;
  address: string;
  isPaired: boolean;
}

export interface SelectedBluetoothPrinter {
  name: string;
  address: string;
}

export interface UsbSerialPrinterDevice {
  name: string;
  portName: string;
  usbId: string;
  manufacturer?: string;
  serialNumber?: string;
  isUsb: boolean;
}

export interface SelectedUsbPrinter {
  name: string;
  usbId: string;
  baudRate: number;
  portName?: string;
}

export interface ReceiptLineItem {
  name: string;
  quantity: number;
  unit: ProductUnit;
  price: number;
  priceBeforeDiscount?: number;
  subtotalBeforeDiscount?: number;
  discountAmount?: number;
  subtotal: number;
}

export interface ReceiptPayload {
  transactionId: string;
  transactionNumber: string;
  merchantName: string;
  createdAt: string;
  paymentMethod: PaymentMethod;
  memberName?: string;
  memberNumber?: string;
  items: ReceiptLineItem[];
  subtotalAmount?: number;
  discountAmount?: number;
  discountBreakdown?: Array<{ label: string; amount: number }>;
  membershipPointsEarned?: number;
  membershipPointsRedeemed?: number;
  membershipPointDiscountAmount?: number;
  membershipPointsBalanceAfter?: number;
  totalAmount: number;
  paymentAmount: number;
  changeAmount: number;
  footer?: string;
}

export interface ReceiptPrintResult {
  success: boolean;
  status: ReceiptPrintStatus;
  error?: string;
}

export interface TransactionReceiptInput extends Transaction {
  items: TransactionItem[];
}

export type PrinterErrorCode =
  | 'PRINTER_NOT_SELECTED'
  | 'BLUETOOTH_OFF'
  | 'PERMISSION_DENIED'
  | 'PRINTER_NOT_PAIRED'
  | 'CONNECTION_FAILED'
  | 'WRITE_FAILED'
  | 'UNSUPPORTED_PLATFORM'
  | 'UNKNOWN';

export interface PrinterError {
  code: PrinterErrorCode;
  message: string;
}

export interface ShoppingNoteItem {
  id: string;
  product_id: string;
  product_name: string;
  sku?: string;
  unit_price: number;
  cost_per_unit: number;
  quantity: number;
  unit: string;
  subtotal: number;
  total_cost: number;
  name?: string; // Legacy field from older shopping notes
}

export interface ShoppingNote {
  id: string;
  created_at: string;
  items: ShoppingNoteItem[];
  money_carried?: number;
  total_shopping: number;
  remaining_money?: number;
}

export interface ProfitLog {
  id: string;
  transaction_id?: string; // Optional, link to transaction if source is transaction
  amount: number;
  type: 'IN' | 'OUT';
  category?: 'WITHDRAW' | 'OPERATIONAL' | 'SALES' | 'VOID' | 'SALES_RETURN' | 'HPP_RECONCILIATION'; // New field to categorize profit log
  description: string;
  created_at: string;
  balance_after: number;
}

export interface ProfitBalance {
  id: string; // 'current'
  amount: number;
  updated_at: string;
}

export type CooperativeMemberStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
export type CooperativeSavingType = 'POKOK' | 'WAJIB' | 'SUKARELA';
export type CooperativeSavingTransactionType = 'DEPOSIT' | 'WITHDRAWAL' | 'REVERSAL';
export type CooperativeSavingWithdrawalSource = 'SAVING' | 'INTEREST';
export type CooperativeSavingTransactionStatus = 'POSTED' | 'REVERSED';
export type CooperativeLoanStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'DISBURSED'
  | 'PAID_OFF'
  | 'REVERSED';
export type CooperativeLoanInstallmentStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERDUE';
export type CooperativeLoanInstallmentCollectionStatus = 'NONE' | 'PROMISED_TO_PAY' | 'UNABLE_TO_PAY' | 'FOLLOW_UP';
export type CooperativeLoanPaymentType = 'PAYMENT' | 'REVERSAL';
export type CooperativeLoanPaymentStatus = 'POSTED' | 'REVERSED';
export type CooperativePaymentApprovalAction = 'BACKDATE' | 'REVERSAL';
export type CooperativePaymentApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type CooperativeLoanInterestCalculationType = 'MONTHLY_RATE' | 'TOTAL_PERCENT';
export type CooperativeLoanBillingFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
export type CooperativeLoanDeductionMethod = 'NONE' | 'DEDUCT_ON_DISBURSEMENT';

export interface CooperativeMember {
  id: string;
  member_number: string;
  name: string;
  identity_number?: string;
  phone?: string;
  address?: string;
  area_id?: string;
  area_name?: string;
  area_code?: string;
  officer_id?: string;
  officer_name?: string;
  officer_position?: string;
  join_date: string;
  status: CooperativeMemberStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  created_by_name?: string;
  updated_by?: string;
  updated_by_name?: string;
  sync_status?: CooperativeMemberSyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}

export interface CooperativeSavingTransaction {
  id: string;
  member_id: string;
  member_number: string;
  member_name: string;
  saving_type: CooperativeSavingType;
  transaction_type: CooperativeSavingTransactionType;
  withdrawal_source?: CooperativeSavingWithdrawalSource;
  interest_rate_per_month?: number;
  amount: number;
  transaction_date: string;
  status: CooperativeSavingTransactionStatus;
  cash_account_id?: string;
  cash_account_code?: string;
  cash_account_name?: string;
  payment_method?: PaymentMethod;
  payment_channel?: string;
  finance_transaction_id?: string;
  journal_entry_id?: string;
  reversal_of_transaction_id?: string;
  reversal_transaction_id?: string;
  reversal_finance_transaction_id?: string;
  reversal_journal_entry_id?: string;
  reversed_at?: string;
  reversal_reason?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  created_by_name?: string;
  updated_by?: string;
  updated_by_name?: string;
  sync_status?: CooperativeSavingTransactionSyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}

export interface CooperativeMemberSavingBalance {
  id: string;
  member_id: string;
  member_number: string;
  member_name: string;
  saving_type: CooperativeSavingType;
  balance: number;
  updated_at: string;
  sync_status?: CooperativeMemberSavingBalanceSyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}

export interface CooperativeLoan {
  id: string;
  loan_number: string;
  member_id: string;
  member_number: string;
  member_name: string;
  principal_amount: number;
  interest_rate_per_month: number;
  tenor_months: number;
  interest_calculation_type?: CooperativeLoanInterestCalculationType;
  billing_frequency?: CooperativeLoanBillingFrequency;
  installment_count?: number;
  loan_service_rate?: number;
  loan_service_amount?: number;
  admin_fee_rate?: number;
  admin_fee_amount?: number;
  mandatory_saving_rate?: number;
  mandatory_saving_amount?: number;
  deduction_method?: CooperativeLoanDeductionMethod;
  net_disbursement_amount?: number;
  total_interest_amount: number;
  total_payable_amount: number;
  outstanding_principal_amount: number;
  outstanding_interest_amount: number;
  outstanding_penalty_amount: number;
  status: CooperativeLoanStatus;
  application_date: string;
  approved_at?: string;
  approved_by?: string;
  approved_by_name?: string;
  approval_notes?: string;
  rejected_at?: string;
  rejected_by?: string;
  rejected_by_name?: string;
  rejection_reason?: string;
  disbursed_at?: string;
  officer_id?: string;
  officer_name?: string;
  officer_position?: string;
  area_id?: string;
  area_name?: string;
  area_code?: string;
  collection_schedule_id?: string;
  collection_weekday?: CooperativeCollectionWeekday;
  cash_account_id?: string;
  cash_account_code?: string;
  cash_account_name?: string;
  payment_method?: PaymentMethod;
  payment_channel?: string;
  finance_transaction_id?: string;
  journal_entry_id?: string;
  disbursement_notes?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  created_by_name?: string;
  updated_by?: string;
  updated_by_name?: string;
  sync_status?: CooperativeLoanSyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}

export interface CooperativeLoanInstallment {
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
  paid_at?: string;
  collection_status?: CooperativeLoanInstallmentCollectionStatus;
  follow_up_date?: string;
  collection_notes?: string;
  last_contacted_at?: string;
  created_at: string;
  updated_at: string;
  sync_status?: CooperativeLoanInstallmentSyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}

export interface CooperativeLoanPayment {
  id: string;
  payment_number: string;
  payment_type?: CooperativeLoanPaymentType;
  loan_id: string;
  loan_number: string;
  installment_id?: string;
  member_id: string;
  member_number: string;
  member_name: string;
  amount: number;
  principal_amount: number;
  interest_amount: number;
  penalty_amount: number;
  payment_date: string;
  status: CooperativeLoanPaymentStatus;
  cash_account_id?: string;
  cash_account_code?: string;
  cash_account_name?: string;
  payment_method?: PaymentMethod;
  payment_channel?: string;
  collector_id?: string;
  collector_name?: string;
  collector_position?: string;
  received_by?: string;
  received_by_name?: string;
  posted_at?: string;
  finance_transaction_id?: string;
  journal_entry_id?: string;
  reversal_of_payment_id?: string;
  reversal_payment_id?: string;
  reversal_finance_transaction_id?: string;
  reversal_journal_entry_id?: string;
  reversed_at?: string;
  reversal_reason?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  created_by_name?: string;
  updated_by?: string;
  updated_by_name?: string;
  idempotency_key?: string;
  sync_status?: CooperativeLoanPaymentSyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}

export interface CooperativePaymentApprovalRequest {
  id: string;
  action_type: CooperativePaymentApprovalAction;
  status: CooperativePaymentApprovalStatus;
  payment_id?: string;
  installment_id?: string;
  idempotency_key?: string;
  amount?: number;
  payment_date?: string;
  payment_method?: PaymentMethod;
  cash_account_id?: string;
  payment_channel?: string;
  collector_id?: string;
  maker_reason: string;
  maker_user_id: string;
  maker_user_name: string;
  requested_at: string;
  checker_user_id?: string;
  checker_user_name?: string;
  checker_notes?: string;
  decided_at?: string;
  result_payment_id?: string;
  created_at: string;
  updated_at: string;
}

export interface CooperativeLoanCollectionEvent {
  id: string;
  installment_id: string;
  loan_id: string;
  loan_number: string;
  member_id: string;
  member_number: string;
  member_name: string;
  collection_status: Exclude<CooperativeLoanInstallmentCollectionStatus, 'NONE'>;
  follow_up_date?: string;
  collection_notes: string;
  contacted_at: string;
  actor_user_id?: string;
  actor_user_name?: string;
  actor_employee_id?: string;
  created_at: string;
  sync_status?: CooperativeLoanCollectionEventSyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}

export interface CooperativeSettings {
  id: 'default';
  default_interest_rate_per_month?: number;
  default_tenor_months?: number;
  created_at: string;
  updated_at: string;
}

export interface CompanyProfileSetting {
  id: 'default';
  company_name?: string;
  logo_data_url?: string;
  logo_file_name?: string;
  logo_mime_type?: string;
  logo_size?: number;
  created_at: string;
  updated_at: string;
}

export type FinanceTransactionType = 'INCOME' | 'EXPENSE' | 'OPENING_BALANCE';

export type JournalEntryStatus = 'DRAFT' | 'POSTED' | 'VOIDED' | 'REVERSED';
export type InventoryAccountingPolicy = 'CASH_FLOW_ONLY' | 'PERPETUAL_INVENTORY';

export type JournalSourceType =
  | 'POS_TRANSACTION'
  | 'STOCK_PURCHASE'
  | 'SALES_INVOICE'
  | 'SALES_INVOICE_PAYMENT'
  | 'SALES_RETURN'
  | 'ACCOUNTS_PAYABLE'
  | 'PURCHASE_INVOICE_PAYMENT'
  | 'CASH_BANK_TRANSFER'
  | 'COOPERATIVE_SAVING'
  | 'COOPERATIVE_LOAN'
  | 'MANUAL_JOURNAL'
  | 'PRODUCTION_ORDER'
  | 'OPENING_BALANCE';

export type AccountingProfileCode =
  | 'SAK_EMKM'
  | 'SAK_EP'
  | 'PSAK_FULL'
  | 'PSAP'
  | 'SAK_ETAP';

export type IndustryExtensionCode =
  | 'NONE'
  | 'RETAIL'
  | 'MANUFACTURING'
  | 'CONSTRUCTION'
  | 'COOPERATIVE';

export type AccountingModuleCode =
  | 'CHART_OF_ACCOUNTS'
  | 'CASH_FLOW_ACCOUNT_FILTER'
  | 'ACCOUNT_TEMPLATES'
  | 'GENERAL_LEDGER'
  | 'MANUFACTURING'
  | 'CONSTRUCTION'
  | 'PSAP_REPORTING';

export type AccountType =
  | 'ASSET'
  | 'LIABILITY'
  | 'EQUITY'
  | 'REVENUE'
  | 'CONTRA_REVENUE'
  | 'EXPENSE';

export type AccountNormalBalance = 'DEBIT' | 'CREDIT';

export interface ChartOfAccount {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  normal_balance: AccountNormalBalance;
  parent_id?: string;
  parent_code?: string;
  parent_name?: string;
  is_postable: boolean;
  is_system: boolean;
  is_active: boolean;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface FinanceAccountMapping {
  id: string;
  key: string;
  category?: string;
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface AccountingProfileSetting {
  id: 'default';
  accounting_profile: AccountingProfileCode;
  industry_extension: IndustryExtensionCode;
  template_id?: string;
  locked_after_transaction?: boolean;
  created_at: string;
  updated_at: string;
}

export interface EnabledModule {
  id: string;
  code: AccountingModuleCode;
  is_enabled: boolean;
  source: 'SYSTEM' | 'PROFILE' | 'USER';
  requires_profile?: AccountingProfileCode;
  requires_extension?: IndustryExtensionCode;
  created_at: string;
  updated_at: string;
}

export interface GeneralLedgerSetting {
  id: 'default';
  is_ready: boolean;
  cutoff_date?: string;
  inventory_policy: InventoryAccountingPolicy;
  opening_balance_journal_id?: string;
  activated_at?: string;
  created_at: string;
  updated_at: string;
}

export interface JournalEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  status: JournalEntryStatus;
  source_type: JournalSourceType;
  source_id?: string;
  source_number?: string;
  source_event?: string;
  description: string;
  total_debit: number;
  total_credit: number;
  posted_at?: string;
  voided_at?: string;
  reversed_entry_id?: string;
  version?: number;
  created_by?: string;
  created_by_name?: string;
  updated_by?: string;
  updated_by_name?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  sync_status?: JournalEntrySyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}

export interface JournalEntryLine {
  id: string;
  journal_entry_id: string;
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  debit: number;
  credit: number;
  description?: string;
  department_id?: string;
  project_id?: string;
  created_at: string;
}

export interface ChartOfAccountTemplate {
  id: string;
  code: string;
  name: string;
  accounting_profile: AccountingProfileCode;
  industry_extension: IndustryExtensionCode;
  description?: string;
  account_count_hint?: number;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChartOfAccountTemplateLine {
  id: string;
  template_id: string;
  template_account_id: string;
  code: string;
  name: string;
  type: AccountType;
  normal_balance: AccountNormalBalance;
  parent_template_account_id?: string;
  is_postable: boolean;
  description?: string;
  mapping_keys?: string[];
  created_at: string;
}

export interface AccountingProfileTemplateRecommendation {
  id: string;
  accounting_profile: AccountingProfileCode;
  industry_extension: IndustryExtensionCode;
  template_id: string;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AccountingModuleActivationRule {
  id: string;
  accounting_profile: AccountingProfileCode;
  industry_extension: IndustryExtensionCode;
  module_code: AccountingModuleCode;
  default_enabled: boolean;
  requires_confirmation: boolean;
  requires_data_safety_check: boolean;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface FinanceTransaction {
  id: string;
  type: FinanceTransactionType;
  category: string;
  amount: number;
  description: string;
  created_at: string;
  reference_id?: string; // Link to transaction_id or other IDs
  account_id?: string;
  account_code?: string;
  account_name?: string;
  account_type?: AccountType;
  payment_method?: PaymentMethod;
  payment_channel?: string;
  cash_account_id?: string;
  cash_account_code?: string;
  cash_account_name?: string;
  transfer_group_id?: string;
  transfer_direction?: 'OUT' | 'IN';
  reversal_of_transfer_group_id?: string;
  field_cash_session_id?: string;
  field_cash_session_number?: string;
  field_employee_id?: string;
  field_employee_name?: string;
  field_cash_movement_kind?: CooperativeFieldCashMovementKind;
  version?: number;
  created_by?: string;
  created_by_name?: string;
  updated_by?: string;
  updated_by_name?: string;
  updated_at?: string;
  deleted_at?: string;
  sync_status?: FinanceTransactionSyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
}

export interface FinanceBalance {
  id: string; // 'current'
  amount: number;
  updated_at: string;
}

export type InventoryLotSourceType =
  | 'SHOPPING_NOTE'
  | 'PURCHASE_RECEIPT'
  | 'PURCHASE_INVOICE'
  | 'POS_VOID'
  | 'SALES_RETURN_RESTOCK'
  | 'PURCHASE_RETURN_VOID'
  | 'SALES_DELIVERY_VOID'
  | 'STOCK_OPNAME'
  | 'PRODUCTION_OUTPUT'
  | 'PRODUCTION_VOID'
  | 'OPENING';

export type InventoryLotConsumptionSourceType =
  | 'POS_TRANSACTION'
  | 'SALES_DELIVERY'
  | 'STOCK_OPNAME'
  | 'PRODUCTION_CONSUMPTION'
  | 'PRODUCTION_VOID';

/**
 * Represents a single batch (lot) of inventory received at a specific cost.
 * Used for FIFO (First In, First Out) cost calculation.
 * When selling, the oldest lots (by received_at) are consumed first.
 */
export interface InventoryLot {
  id: string;
  product_id: string;
  product_name: string;
  sku?: string;
  source_type: InventoryLotSourceType;
  source_id?: string;       // ID of the originating record (e.g. shoppingNoteId, purchaseDocumentId)
  source_line_id?: string;  // ID of the specific line item for traceability
  quantity_received: number; // Original quantity when lot was created (in product's purchase_unit)
  quantity_remaining: number; // Remaining quantity not yet consumed by sales (in purchase_unit)
  cost_per_unit: number;     // HPP per unit (in purchase_unit)
  cost_status?: PurchaseCostStatus;
  estimate_source?: PurchaseCostEstimateSource;
  estimated_cost_per_unit?: number;
  final_cost_per_unit?: number;
  cost_finalized_at?: string;
  cost_reconciliation_id?: string;
  received_at: string;       // Timestamp used for FIFO ordering (oldest first)
  created_at: string;
  updated_at: string;
}

export interface InventoryLotConsumption {
  id: string;
  lot_id: string;
  product_id: string;
  product_name: string;
  source_type: InventoryLotConsumptionSourceType;
  source_id: string;
  source_line_id: string;
  quantity: number;
  cost_per_unit_at_consumption: number;
  cost_status_at_consumption: PurchaseCostStatus;
  created_at: string;
}
