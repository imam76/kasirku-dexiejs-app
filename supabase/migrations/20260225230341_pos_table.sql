/*
  # Create POS Application Tables

  1. New Tables
    - `products`
      - `id` (uuid, primary key)
      - `name` (text, product name)
      - `price` (numeric, product price)
      - `stock` (integer, available quantity)
      - `sku` (text, unique product code)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `transactions`
      - `id` (uuid, primary key)
      - `transaction_number` (text, unique transaction ID)
      - `total_amount` (numeric, total transaction value)
      - `payment_amount` (numeric, amount paid by customer)
      - `change_amount` (numeric, change given)
      - `created_at` (timestamptz)
    
    - `transaction_items`
      - `id` (uuid, primary key)
      - `transaction_id` (uuid, foreign key to transactions)
      - `product_id` (uuid, foreign key to products)
      - `product_name` (text, snapshot of product name)
      - `price` (numeric, snapshot of price at time of sale)
      - `quantity` (integer, quantity sold)
      - `subtotal` (numeric, price * quantity)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for public access (simplified for POS usage)
    
  3. Important Notes
    - All tables use UUID primary keys
    - Transaction items store product snapshots to maintain historical accuracy
    - Timestamps track creation and updates
*/

-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric(10, 2) NOT NULL DEFAULT 0,
  stock integer NOT NULL DEFAULT 0,
  sku text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_number text UNIQUE NOT NULL,
  total_amount numeric(10, 2) NOT NULL DEFAULT 0,
  payment_amount numeric(10, 2) NOT NULL DEFAULT 0,
  change_amount numeric(10, 2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create transaction_items table
CREATE TABLE IF NOT EXISTS transaction_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  product_name text NOT NULL,
  price numeric(10, 2) NOT NULL,
  quantity integer NOT NULL,
  subtotal numeric(10, 2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction_id ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_product_id ON transaction_items(product_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);

-- Enable Row Level Security
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_items ENABLE ROW LEVEL SECURITY;

-- Create policies for products table
CREATE POLICY "Allow public read access to products"
  ON products FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public insert access to products"
  ON products FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Allow public update access to products"
  ON products FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete access to products"
  ON products FOR DELETE
  TO public
  USING (true);

-- Create policies for transactions table
CREATE POLICY "Allow public read access to transactions"
  ON transactions FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public insert access to transactions"
  ON transactions FOR INSERT
  TO public
  WITH CHECK (true);

-- Create policies for transaction_items table
CREATE POLICY "Allow public read access to transaction_items"
  ON transaction_items FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public insert access to transaction_items"
  ON transaction_items FOR INSERT
  TO public
  WITH CHECK (true);