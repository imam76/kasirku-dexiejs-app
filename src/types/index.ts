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
}

export type PaymentMethod = 'TUNAI' | 'NON_TUNAI';
export type ReceiptPrintStatus = 'pending' | 'printed' | 'print_failed';

export interface Transaction {
  id: string;
  transaction_number: string;
  total_amount: number;
  payment_amount: number;
  change_amount: number;
  payment_method: PaymentMethod;
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
  purchase_price: number;
  quantity: number;
  unit: ProductUnit; // Satuan yang digunakan (misal: gram)
  unit_id?: ProductUnit;
  unit_label?: string;
  unit_category?: SalesUnitCategory;
  conversion_value?: number;
  base_unit?: ProductUnit;
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

export interface ReceiptLineItem {
  name: string;
  quantity: number;
  unit: ProductUnit;
  price: number;
  subtotal: number;
}

export interface ReceiptPayload {
  transactionId: string;
  transactionNumber: string;
  merchantName: string;
  createdAt: string;
  paymentMethod: PaymentMethod;
  items: ReceiptLineItem[];
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
  category?: 'WITHDRAW' | 'OPERATIONAL' | 'SALES'; // New field to categorize profit log
  description: string;
  created_at: string;
  balance_after: number;
}

export interface ProfitBalance {
  id: string; // 'current'
  amount: number;
  updated_at: string;
}

export type FinanceTransactionType = 'INCOME' | 'EXPENSE' | 'OPENING_BALANCE';

export interface FinanceTransaction {
  id: string;
  type: FinanceTransactionType;
  category: string;
  amount: number;
  description: string;
  created_at: string;
  reference_id?: string; // Link to transaction_id or other IDs
}

export interface FinanceBalance {
  id: string; // 'current'
  amount: number;
  updated_at: string;
}
