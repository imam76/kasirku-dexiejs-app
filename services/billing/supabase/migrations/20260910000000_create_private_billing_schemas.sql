-- Billing staging lives in the same Supabase project as two private schemas.
-- The Edge Function connects directly to Postgres; neither schema is exposed
-- through the Supabase Data API to anon/authenticated clients.
create schema if not exists billing_private;
create schema if not exists leads_private;

revoke all on schema billing_private from public, anon, authenticated;
revoke all on schema leads_private from public, anon, authenticated;

create table if not exists billing_private.businesses (
  id uuid primary key,
  installation_id uuid unique not null,
  registration jsonb not null,
  recovery_hash text unique not null,
  access jsonb not null,
  custom_setup_paid boolean not null default false,
  first_paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists billing_private.business_users (
  auth_user_id uuid primary key,
  business_id uuid not null references billing_private.businesses(id),
  created_at timestamptz not null default now()
);

create index if not exists business_users_business_id_idx
  on billing_private.business_users(business_id);

create table if not exists billing_private.orders (
  order_id text primary key,
  business_id uuid not null references billing_private.businesses(id),
  request_id uuid not null,
  plan text not null,
  modules jsonb not null,
  amount integer not null check (amount > 0),
  setup_amount integer not null,
  tax_amount integer not null,
  status text not null default 'creating',
  redirect_url text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  activated_at timestamptz,
  access_start timestamptz,
  access_end timestamptz,
  unique (business_id, request_id)
);

create unique index if not exists one_pending_order_per_business
  on billing_private.orders(business_id)
  where status in ('creating', 'pending');

create table if not exists billing_private.webhook_events (
  event_hash text primary key,
  order_id text not null references billing_private.orders(order_id),
  status text not null,
  payment_type text,
  received_at timestamptz not null default now()
);

create table if not exists billing_private.recovery_events (
  id uuid primary key,
  business_id uuid not null references billing_private.businesses(id),
  auth_user_id uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists leads_private.leads (
  business_id uuid primary key,
  registration jsonb not null,
  consent jsonb not null,
  follow_up_status text not null default 'new',
  updated_at timestamptz not null default now()
);

create table if not exists leads_private.consent_events (
  business_id uuid not null,
  consent jsonb not null,
  received_at timestamptz not null default now(),
  primary key (business_id, consent)
);

revoke all on all tables in schema billing_private from public, anon, authenticated;
revoke all on all tables in schema leads_private from public, anon, authenticated;

alter default privileges in schema billing_private
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema leads_private
  revoke all on tables from public, anon, authenticated;
