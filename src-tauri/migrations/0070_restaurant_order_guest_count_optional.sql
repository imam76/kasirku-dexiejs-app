ALTER TABLE restaurant_orders
    ALTER COLUMN guest_count DROP NOT NULL,
    ALTER COLUMN guest_count DROP DEFAULT;
