import pg from 'pg';
import type { BillingConfig } from './config.ts';

export function createDatabases(config: BillingConfig) {
  return {
    billing: new pg.Pool({
      connectionString: config.BILLING_DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 5000,
    }),
    leads: new pg.Pool({
      connectionString: config.LEADS_DATABASE_URL,
      max: 3,
      connectionTimeoutMillis: 5000,
    }),
  };
}
export type Databases = ReturnType<typeof createDatabases>;
export async function migrate({ billing, leads }: Databases) {
  await billing.query(`
    CREATE TABLE IF NOT EXISTS businesses (
      id uuid PRIMARY KEY, installation_id uuid UNIQUE NOT NULL,
      registration jsonb NOT NULL, recovery_hash text UNIQUE NOT NULL,
      access jsonb NOT NULL, custom_setup_paid boolean NOT NULL DEFAULT false,
      first_paid_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS access_tokens (
      token_hash text PRIMARY KEY, business_id uuid NOT NULL REFERENCES businesses(id),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS orders (
      order_id text PRIMARY KEY, business_id uuid NOT NULL REFERENCES businesses(id),
      request_id uuid NOT NULL, plan text NOT NULL, modules jsonb NOT NULL,
      amount integer NOT NULL CHECK (amount > 0), setup_amount integer NOT NULL, tax_amount integer NOT NULL,
      status text NOT NULL DEFAULT 'creating', redirect_url text,
      created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
      activated_at timestamptz, access_start timestamptz, access_end timestamptz,
      UNIQUE (business_id, request_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_pending_order_per_business ON orders(business_id)
      WHERE status IN ('creating', 'pending');
    CREATE TABLE IF NOT EXISTS webhook_events (
      event_hash text PRIMARY KEY, order_id text NOT NULL REFERENCES orders(order_id),
      status text NOT NULL, payment_type text, received_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS recovery_events (
      id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES businesses(id), created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await leads.query(`
    CREATE TABLE IF NOT EXISTS leads (
      business_id uuid PRIMARY KEY, registration jsonb NOT NULL, consent jsonb NOT NULL,
      follow_up_status text NOT NULL DEFAULT 'new', updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS consent_events (
      business_id uuid NOT NULL, consent jsonb NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (business_id, consent)
    );
  `);
}
