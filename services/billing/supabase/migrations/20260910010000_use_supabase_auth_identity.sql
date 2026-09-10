-- Replace application-issued bearer tokens with verified Supabase Auth users.
-- Existing businesses remain recoverable with their recovery code; the updated
-- client automatically links its new anonymous Supabase user on first sync.
create table if not exists billing_private.business_users (
  auth_user_id uuid primary key,
  business_id uuid not null references billing_private.businesses(id),
  created_at timestamptz not null default now()
);

create index if not exists business_users_business_id_idx
  on billing_private.business_users(business_id);

alter table billing_private.recovery_events
  add column if not exists auth_user_id uuid;

revoke all on billing_private.business_users from public, anon, authenticated;

-- Keep a previously deployed access_tokens table during the rollout so the
-- database migration can safely precede the function deployment. New code
-- neither reads nor writes it; remove it in a later retention migration.
