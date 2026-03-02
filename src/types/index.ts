export interface Product {
  id: string;
  name: string;
  purchase_price: number;
  selling_price: number;
  stock: number;
  sku: string;
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

