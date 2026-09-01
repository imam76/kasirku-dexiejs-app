-- Retail membership moved off Contact into its own memberships table (0092_memberships.sql).
-- Existing is_member=true contacts were backfilled into memberships, reusing the contact's id
-- as the membership id, before this column drop shipped.
ALTER TABLE contacts DROP COLUMN IF EXISTS is_member;
ALTER TABLE contacts DROP COLUMN IF EXISTS membership_number;
ALTER TABLE contacts DROP COLUMN IF EXISTS membership_status;
ALTER TABLE contacts DROP COLUMN IF EXISTS membership_joined_at;
ALTER TABLE contacts DROP COLUMN IF EXISTS membership_points_balance;
