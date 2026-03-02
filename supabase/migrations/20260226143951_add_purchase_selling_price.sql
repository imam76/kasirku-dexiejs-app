-- Add columns to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS selling_price DECIMAL(10, 2) DEFAULT 0;

-- Migrate existing data
UPDATE products 
SET selling_price = price, purchase_price = price * 0.8 
WHERE selling_price = 0;

-- Add columns to transaction_items table
ALTER TABLE transaction_items
ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS profit DECIMAL(10, 2) DEFAULT 0;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_calculate_transaction_profit ON transaction_items CASCADE;

-- Create or replace function for calculating profit
CREATE OR REPLACE FUNCTION calculate_transaction_profit()
RETURNS TRIGGER AS $$
BEGIN
  NEW.profit := (NEW.price - NEW.purchase_price) * NEW.quantity;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER trigger_calculate_transaction_profit
BEFORE INSERT OR UPDATE ON transaction_items
FOR EACH ROW
EXECUTE FUNCTION calculate_transaction_profit();