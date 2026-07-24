CREATE TABLE IF NOT EXISTS marketplace_accounts (
    id TEXT PRIMARY KEY,
    marketplace TEXT NOT NULL,
    shop_id BIGINT NOT NULL,
    shop_name TEXT NOT NULL,
    access_token_encrypted TEXT NOT NULL,
    refresh_token_encrypted TEXT NOT NULL,
    token_expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'CONNECTED',
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT marketplace_accounts_marketplace_shop_unique UNIQUE (marketplace, shop_id),
    CONSTRAINT marketplace_accounts_status_check
      CHECK (status IN ('CONNECTED', 'REAUTH_REQUIRED', 'RESTRICTED'))
);

CREATE INDEX IF NOT EXISTS idx_marketplace_accounts_marketplace
ON marketplace_accounts (marketplace, created_at DESC);

CREATE TABLE IF NOT EXISTS marketplace_orders (
    id TEXT PRIMARY KEY,
    marketplace_account_id TEXT NOT NULL
      REFERENCES marketplace_accounts (id) ON DELETE CASCADE,
    order_sn TEXT NOT NULL,
    buyer_username TEXT,
    marketplace_status TEXT NOT NULL,
    internal_status TEXT NOT NULL,
    total_amount NUMERIC(19, 4),
    currency TEXT NOT NULL,
    order_created_at TIMESTAMPTZ NOT NULL,
    order_updated_at TIMESTAMPTZ NOT NULL,
    raw_payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT marketplace_orders_account_order_unique
      UNIQUE (marketplace_account_id, order_sn),
    CONSTRAINT marketplace_orders_internal_status_check
      CHECK (internal_status IN (
        'WAITING_PAYMENT',
        'READY_TO_PROCESS',
        'SHIPPED',
        'COMPLETED',
        'CANCELLED'
      ))
);

CREATE INDEX IF NOT EXISTS idx_marketplace_orders_account_created
ON marketplace_orders (marketplace_account_id, order_created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketplace_orders_internal_status
ON marketplace_orders (internal_status, order_created_at DESC);

CREATE TABLE IF NOT EXISTS marketplace_order_items (
    id TEXT PRIMARY KEY,
    marketplace_order_id TEXT NOT NULL
      REFERENCES marketplace_orders (id) ON DELETE CASCADE,
    item_id BIGINT NOT NULL,
    model_id BIGINT NOT NULL DEFAULT 0,
    item_name TEXT NOT NULL,
    sku TEXT,
    quantity INTEGER NOT NULL,
    original_price NUMERIC(19, 4),
    discounted_price NUMERIC(19, 4),
    raw_payload JSONB NOT NULL,
    CONSTRAINT marketplace_order_items_natural_unique
      UNIQUE (marketplace_order_id, item_id, model_id),
    CONSTRAINT marketplace_order_items_quantity_check CHECK (quantity >= 0)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_order_items_order
ON marketplace_order_items (marketplace_order_id);

CREATE TABLE IF NOT EXISTS marketplace_integration_logs (
    id TEXT PRIMARY KEY,
    marketplace_account_id TEXT
      REFERENCES marketplace_accounts (id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    request_payload JSONB,
    response_payload JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT marketplace_integration_logs_status_check
      CHECK (status IN ('SUCCESS', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_marketplace_integration_logs_account_created
ON marketplace_integration_logs (marketplace_account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketplace_integration_logs_status_created
ON marketplace_integration_logs (status, created_at DESC);
