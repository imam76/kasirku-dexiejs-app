-- Create stock_purchases table to track purchases for inventory
CREATE TABLE IF NOT EXISTS stock_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  sku text NOT NULL,
  quantity integer NOT NULL,
  cost_per_unit numeric(10, 2) NOT NULL,
  total_cost numeric(10, 2) NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_stock_purchases_product_id ON stock_purchases(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_purchases_created_at ON stock_purchases(created_at DESC);

-- Enable Row Level Security
ALTER TABLE stock_purchases ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow public read access to stock_purchases"
  ON stock_purchases FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public insert access to stock_purchases"
  ON stock_purchases FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Allow public update access to stock_purchases"
  ON stock_purchases FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);
