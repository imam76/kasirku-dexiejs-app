export interface WholesalePrice {
  min_quantity: number;
  price: number;
  price_type?: 'unit' | 'bundle'; // 'unit' = price per item, 'bundle' = price for min_quantity items
}

export interface Product {
  id: string;
  name: string;
  purchase_price: number;
  selling_price: number;
  stock: number;
  sku: string;
  wholesale_prices?: WholesalePrice[];
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  transaction_number: string;
  total_amount: number;
  payment_amount: number;
  change_amount: number;
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
  subtotal: number;
  profit: number;
  created_at: string;
}

export interface StockPurchase {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  quantity: number;
  cost_per_unit: number;
  total_cost: number;
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface ShoppingNoteItem {
  id: string;
  name: string;
  unit_price: number;
  quantity: number;
  unit: string;
  subtotal: number;
}

export interface ProfitLog {
  id: string;
  transaction_id?: string; // Optional, link to transaction if source is transaction
  amount: number;
  type: 'IN' | 'OUT';
  description: string;
  created_at: string;
  balance_after: number;
}

export interface ProfitBalance {
  id: string; // 'current'
  amount: number;
  updated_at: string;
}

