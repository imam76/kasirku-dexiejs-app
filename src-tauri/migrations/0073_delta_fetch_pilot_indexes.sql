-- Delta fetch pilot (chart_of_accounts, contacts, products): index cursor pagination
-- queries (WHERE updated_at > $1 ORDER BY updated_at, id) so they stay fast as these
-- tables grow instead of falling back to a sequential scan.

CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_updated_at_id ON chart_of_accounts (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_contacts_updated_at_id ON contacts (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_products_updated_at_id ON products (updated_at, id);
