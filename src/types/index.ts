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
export type SyncQueueOperation = 'create' | 'update' | 'delete';
export type SyncQueueStatus = 'pending' | 'processing' | 'synced' | 'failed';
export type UserRole = 'OWNER' | 'ADMIN' | 'KASIR' | 'GUDANG';
export type PromoType = 'percent' | 'fixed';
export type PromoAppliesTo = 'all' | 'product' | 'category';
export type ContactType = 'CUSTOMER' | 'SUPPLIER' | 'CUSTOMER_SUPPLIER' | 'OTHER';
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
  | 'STOCK_PURCHASE_ACCESS'
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
  | 'COOPERATIVE_BILLING_ACCESS'
  | 'COOPERATIVE_REPORT_VIEW'
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
  created_at: string;
  updated_at: string;
  sync_status?: ContactSyncStatus;
  sync_error?: string;
  last_synced_at?: string;
  remote_updated_at?: string;
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

export type StockMutationSourceType =
  | 'POS_TRANSACTION'
  | 'POS_TRANSACTION_VOID'
  | 'SALES_DELIVERY'
  | 'SALES_DELIVERY_VOID'
  | 'PURCHASE_RECEIPT'
  | 'PURCHASE_RECEIPT_VOID'
  | 'PURCHASE_RETURN'
  | 'PURCHASE_RETURN_VOID'
  | 'SALES_RETURN'
  | 'SALES_RETURN_VOID'
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
  items: ReceiptLineItem[];
  subtotalAmount?: number;
  discountAmount?: number;
  discountBreakdown?: Array<{ label: string; amount: number }>;
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
  category?: 'WITHDRAW' | 'OPERATIONAL' | 'SALES' | 'VOID' | 'SALES_RETURN'; // New field to categorize profit log
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
export type CooperativeLoanPaymentType = 'PAYMENT' | 'REVERSAL';
export type CooperativeLoanPaymentStatus = 'POSTED' | 'REVERSED';

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
  sync_status?: CooperativeLoanPaymentSyncStatus;
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
  | 'POS_VOID'
  | 'SALES_RETURN_RESTOCK'
  | 'PURCHASE_RETURN_VOID'
  | 'SALES_DELIVERY_VOID'
  | 'OPENING';

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
  received_at: string;       // Timestamp used for FIFO ordering (oldest first)
  created_at: string;
  updated_at: string;
}
