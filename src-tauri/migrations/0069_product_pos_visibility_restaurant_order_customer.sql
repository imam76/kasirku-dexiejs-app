ALTER TABLE products
    ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'FINISHED_GOOD',
    ADD COLUMN IF NOT EXISTS is_visible_in_pos BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE products
SET product_type = 'FINISHED_GOOD'
WHERE product_type IS NULL;

UPDATE products
SET is_visible_in_pos = TRUE
WHERE is_visible_in_pos IS NULL;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_product_type_check;
ALTER TABLE products
    ADD CONSTRAINT products_product_type_check
    CHECK (product_type IN ('FINISHED_GOOD', 'RAW_MATERIAL'));

ALTER TABLE restaurant_orders
    ADD COLUMN IF NOT EXISTS customer_name TEXT;

UPDATE restaurant_orders
SET customer_name = LEFT(COALESCE(NULLIF(BTRIM(customer_name), ''), order_number), 100);

ALTER TABLE restaurant_orders
    ALTER COLUMN customer_name SET NOT NULL;

ALTER TABLE restaurant_orders DROP CONSTRAINT IF EXISTS restaurant_orders_customer_name_length_check;
ALTER TABLE restaurant_orders
    ADD CONSTRAINT restaurant_orders_customer_name_length_check
    CHECK (CHAR_LENGTH(customer_name) BETWEEN 1 AND 100);

ALTER TABLE restaurant_orders DROP CONSTRAINT IF EXISTS restaurant_orders_type_check;
ALTER TABLE restaurant_orders
    ADD CONSTRAINT restaurant_orders_type_check
    CHECK (order_type IN ('DINE_IN', 'TAKEAWAY', 'DELIVERY'));
