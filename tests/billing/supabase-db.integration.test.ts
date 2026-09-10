import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test, expect } from 'bun:test';
import pg from 'pg';
import { readConfig } from '../../services/billing/config';
import { createDatabases, migrate } from '../../services/billing/db';

test('Supabase-style connection isolates billing and leads in one database', async () => {
  const source = readConfig();
  const suffix = randomBytes(6).toString('hex');
  const billingSchema = `test_billing_private_${suffix}`;
  const leadsSchema = `test_leads_private_${suffix}`;
  const config = readConfig({
    MIDTRANS_MERCHANT_ID: 'sandbox-merchant',
    MIDTRANS_SERVER_KEY: 'Mid-server-test',
    MIDTRANS_CLIENT_KEY: 'Mid-client-test',
    BILLING_DATABASE_URL: source.BILLING_DATABASE_URL,
    LEADS_DATABASE_URL: source.BILLING_DATABASE_URL,
    BILLING_DATABASE_SCHEMA: billingSchema,
    LEADS_DATABASE_SCHEMA: leadsSchema,
  });
  const db = createDatabases(config);
  const admin = new pg.Pool({ connectionString: source.BILLING_DATABASE_URL });

  try {
    await migrate(db, config);
    expect(
      (await db.billing.query<{ schema: string }>('SELECT current_schema() AS schema'))
        .rows[0].schema,
    ).toBe(billingSchema);
    expect(
      (await db.leads.query<{ schema: string }>('SELECT current_schema() AS schema'))
        .rows[0].schema,
    ).toBe(leadsSchema);
    expect(
      (
        await admin.query<{ table_name: string | null }>(
          'SELECT to_regclass($1)::text AS table_name',
          [`${billingSchema}.orders`],
        )
      ).rows[0].table_name,
    ).toBe(`${billingSchema}.orders`);
    expect(
      (
        await admin.query<{ table_name: string | null }>(
          'SELECT to_regclass($1)::text AS table_name',
          [`${leadsSchema}.leads`],
        )
      ).rows[0].table_name,
    ).toBe(`${leadsSchema}.leads`);
  } finally {
    await Promise.all([db.billing.end(), db.leads.end()]);
    await admin.query(`DROP SCHEMA IF EXISTS ${billingSchema} CASCADE`);
    await admin.query(`DROP SCHEMA IF EXISTS ${leadsSchema} CASCADE`);
    await admin.end();
  }
});

test('Supabase migration creates only private billing and lead schemas', async () => {
  const source = readConfig();
  const admin = new pg.Pool({ connectionString: source.BILLING_DATABASE_URL });
  const client = await admin.connect();
  const migration = await readFile(
    new URL(
      '../../services/billing/supabase/migrations/20260910000000_create_private_billing_schemas.sql',
      import.meta.url,
    ),
    'utf8',
  );

  try {
    await client.query('BEGIN');
    await client.query(`
      DO $roles$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
      END
      $roles$;
    `);
    await client.query(migration);
    const schemas = await client.query<{ schema_name: string }>(`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name IN ('billing_private', 'leads_private')
      ORDER BY schema_name
    `);
    expect(schemas.rows.map((row) => row.schema_name)).toEqual([
      'billing_private',
      'leads_private',
    ]);
    expect(
      (
        await client.query<{ allowed: boolean }>(
          "SELECT has_schema_privilege('anon', 'billing_private', 'USAGE') AS allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
    expect(
      (
        await client.query<{ allowed: boolean }>(
          "SELECT has_schema_privilege('authenticated', 'leads_private', 'USAGE') AS allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await admin.end();
  }
});
