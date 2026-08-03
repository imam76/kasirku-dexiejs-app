ALTER TABLE restaurant_tables
    ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'REGULAR',
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE restaurant_tables
SET type = 'REGULAR'
WHERE type IS NULL OR BTRIM(type) = '';

ALTER TABLE restaurant_tables
    DROP CONSTRAINT IF EXISTS restaurant_tables_type_check;
ALTER TABLE restaurant_tables
    ADD CONSTRAINT restaurant_tables_type_check CHECK (type IN ('REGULAR', 'VIP'));

ALTER TABLE restaurant_tables
    DROP CONSTRAINT IF EXISTS restaurant_tables_capacity_check;
ALTER TABLE restaurant_tables
    ADD CONSTRAINT restaurant_tables_capacity_check CHECK (capacity >= 1);

CREATE INDEX IF NOT EXISTS idx_restaurant_tables_type_status
    ON restaurant_tables (type, status)
    WHERE is_active = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurant_tables_active_name_unique
    ON restaurant_tables (LOWER(BTRIM(name)))
    WHERE is_active = TRUE;

INSERT INTO role_permissions (id, role_id, permission_code, created_at, updated_at)
SELECT
    source.role_id || ':' || permission.code,
    source.role_id,
    permission.code,
    NOW(),
    NOW()
FROM role_permissions source
CROSS JOIN (VALUES
    ('RESTAURANT_TABLE_VIEW'),
    ('RESTAURANT_TABLE_CREATE'),
    ('RESTAURANT_TABLE_UPDATE'),
    ('RESTAURANT_TABLE_DELETE')
) AS permission(code)
WHERE source.permission_code = 'AREA_MANAGE'
ON CONFLICT (role_id, permission_code) DO NOTHING;
