export interface WholesalePrice {
  min_quantity: number;
  price: number;
  price_type?: 'unit' | 'bundle'; // 'unit' = price per item, 'bundle' = price for min_quantity items
}

export type ProductUnit = string;
export type ProductCategory = 'bumbu' | 'sembako' | 'lainnya' | string;

export interface UnitConversion {
  id: string;
  fromUnit: string;
  toUnit: string;
  ratio: number;
  isPreset: boolean;
  label: string;
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
  created_at: string;
  updated_at: string;
}

export type PaymentMethod = 'TUNAI' | 'NON_TUNAI';

export interface Transaction {
  id: string;
  transaction_number: string;
  total_amount: number;
  payment_amount: number;
  change_amount: number;
  payment_method: PaymentMethod;
  created_at: string;
}

export interface TransactionItem {
  id: string;
  transaction_id: string;
  product_id: string;
  product_name: string;
  price: number;
  purchase_price: number;
  quantity: number;
  unit: ProductUnit; // Satuan yang digunakan (misal: gram)
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

export interface ShoppingNoteItem {
  id: string;
  name: string;
  unit_price: number;
  quantity: number;
  unit: string;
  subtotal: number;
}

export interface ShoppingNote {
  id: string;
  created_at: string;
  items: ShoppingNoteItem[];
  money_carried: number;
  total_shopping: number;
  remaining_money: number;
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

