ALTER TABLE cooperative_loans
ADD COLUMN IF NOT EXISTS is_migration BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_cooperative_loans_is_migration
ON cooperative_loans (is_migration);
