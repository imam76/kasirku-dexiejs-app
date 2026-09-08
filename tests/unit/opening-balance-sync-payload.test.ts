import { describe, expect, test } from 'bun:test';
import type { RemoteOpeningBalanceBundleDto } from '@/services/postgresAdapter';
import { normalizeOpeningBalanceSyncPayload } from '@/utils/openingBalances/normalizeOpeningBalanceSyncPayload';

const payload = (): RemoteOpeningBalanceBundleDto => ({
  batch: {
    id: 'opening-balance-account-2026-08-04',
    module: 'ACCOUNT',
    cutoff_date: '2026-08-04',
    accounting_start_date: '',
    status: 'DRAFT',
    total_debit: 0,
    total_credit: 0,
    posted_at: '',
    locked_at: '',
    reversed_at: '',
    skipped_at: '',
    validated_at: '',
    version: 1,
    created_at: '2026-09-04T08:06:49.000Z',
    updated_at: '2026-09-04T08:06:49.000Z',
    deleted_at: '',
  },
  lines: [{
    id: 'opening-balance-account-2026-08-04-line-cash',
    batch_id: 'opening-balance-account-2026-08-04',
    module: 'ACCOUNT',
    line_number: 1,
    document_date: '',
    due_date: '',
    last_paid_at: '',
    base_amount: 100_000,
    debit: 100_000,
    credit: 0,
    created_at: '2026-09-04T08:06:49.000Z',
    updated_at: '2026-09-04T08:06:49.000Z',
  }],
});

describe('opening-balance sync payload normalization', () => {
  test('repairs date-only and empty optional timestamps from an older queue item', () => {
    const normalized = normalizeOpeningBalanceSyncPayload(payload());

    expect(normalized.batch.cutoff_date).toBe('2026-08-04T00:00:00.000Z');
    expect(normalized.batch.accounting_start_date).toBeNull();
    expect(normalized.batch.posted_at).toBeNull();
    expect(normalized.batch.deleted_at).toBeNull();
    expect(normalized.lines[0].document_date).toBeNull();
    expect(normalized.lines[0].due_date).toBeNull();
    expect(normalized.lines[0].last_paid_at).toBeNull();
  });

  test('rejects a missing required timestamp with its field name', () => {
    const invalid = payload();
    invalid.batch.updated_at = '';

    expect(() => normalizeOpeningBalanceSyncPayload(invalid)).toThrow(
      'batch.updated_at',
    );
  });
});
