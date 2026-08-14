ALTER TABLE restaurant_tables
    DROP CONSTRAINT IF EXISTS restaurant_tables_type_check;
ALTER TABLE restaurant_tables
    ADD CONSTRAINT restaurant_tables_type_check CHECK (type IN ('REGULAR', 'VIP', 'VVIP'));
