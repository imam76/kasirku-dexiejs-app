import { describe, expect, test } from 'bun:test';
import { readConfig } from '../../services/billing/config';

const required = {
  MIDTRANS_MERCHANT_ID: 'sandbox-merchant',
  MIDTRANS_SERVER_KEY: 'Mid-server-test',
  MIDTRANS_CLIENT_KEY: 'Mid-client-test',
};

describe('Midtrans access key config', () => {
  const databases = {
    BILLING_DATABASE_URL: 'postgres://localhost/billing',
    LEADS_DATABASE_URL: 'postgres://localhost/leads',
  };
  test('accepts sandbox-prefixed keys and trims copied whitespace', () => {
    const config = readConfig({
      ...databases, ...required,
      MIDTRANS_SERVER_KEY: ' SB-Mid-server-sandbox-test\n',
      MIDTRANS_CLIENT_KEY: ' SB-Mid-client-sandbox-test\n',
    });
    expect(config.MIDTRANS_SERVER_KEY).toBe('SB-Mid-server-sandbox-test');
    expect(config.MIDTRANS_CLIENT_KEY).toBe('SB-Mid-client-sandbox-test');
  });
  test('continues to accept existing Midtrans keys without the SB prefix', () => {
    expect(readConfig({ ...databases, ...required }).MIDTRANS_SERVER_KEY).toBe(required.MIDTRANS_SERVER_KEY);
  });
  test('rejects empty keys and a client key in the server key field', () => {
    for (const key of ['Mid-server-', 'SB-Mid-server-', 'Mid-client-test'])
      expect(() => readConfig({ ...databases, ...required, MIDTRANS_SERVER_KEY: key })).toThrow('MIDTRANS_SERVER_KEY');
  });
});

describe('billing database isolation config', () => {
  test('uses only private billing and lead schemas for Supabase', () => {
    const config = readConfig({
      ...required,
      SUPABASE_DB_URL:
        'postgres://postgres.example:password@pooler.example.com:6543/postgres',
    });

    expect(config.BILLING_DATABASE_URL).toBe(config.LEADS_DATABASE_URL);
    expect(config.BILLING_DATABASE_SCHEMA).toBe('billing_private');
    expect(config.LEADS_DATABASE_SCHEMA).toBe('leads_private');
  });

  test('rejects sharing the same database schema', () => {
    expect(() =>
      readConfig({
        ...required,
        BILLING_DATABASE_URL:
          'postgresql://billing:password@localhost:5432/postgres',
        LEADS_DATABASE_URL:
          'postgresql://billing:password@localhost:5432/postgres',
        BILLING_DATABASE_SCHEMA: 'billing_private',
        LEADS_DATABASE_SCHEMA: 'billing_private',
      }),
    ).toThrow('Database atau schema billing dan leads harus terpisah.');
  });

  test('rejects Supabase access to public or arbitrary schemas', () => {
    expect(() =>
      readConfig({
        ...required,
        SUPABASE_DB_URL:
          'postgres://postgres.example:password@pooler.example.com:6543/postgres',
        BILLING_DATABASE_SCHEMA: 'public',
        LEADS_DATABASE_SCHEMA: 'leads_private',
      }),
    ).toThrow(
      'Supabase billing hanya boleh memakai schema billing_private dan leads_private.',
    );
  });
});
