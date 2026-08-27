import { describe, expect, test } from 'bun:test';
import dayjs from '@/lib/dayjs';
import {
  normalizeStoredTimestamp,
  toCanonicalIsoTimestamp,
  toCanonicalOptionalIsoTimestamp,
} from '@/utils/timestamps';

describe('timestamp normalization', () => {
  test('canonicalizes PostgreSQL TIMESTAMPTZ text to fixed UTC ISO', () => {
    expect(toCanonicalIsoTimestamp('2026-08-26 23:30:00+00')).toBe(
      '2026-08-26T23:30:00.000Z',
    );
    expect(toCanonicalIsoTimestamp('2026-08-27T06:30:00+07:00')).toBe(
      '2026-08-26T23:30:00.000Z',
    );
    expect(toCanonicalOptionalIsoTimestamp(null)).toBeUndefined();
  });

  test('keeps pre-07:00 Jakarta transactions inside the selected calendar day', () => {
    const start = dayjs.tz('2026-08-27').startOf('day').toISOString();
    const end = dayjs.tz('2026-08-27').endOf('day').toISOString();
    const postgres0630 = '2026-08-26 23:30:00+00';
    const canonical0630 = toCanonicalIsoTimestamp(postgres0630);
    const nextDay0659 = toCanonicalIsoTimestamp('2026-08-27 23:59:00+00');

    expect(postgres0630 >= start).toBe(false);
    expect(canonical0630 >= start && canonical0630 <= end).toBe(true);
    expect(nextDay0659 >= start && nextDay0659 <= end).toBe(false);
  });

  test('rejects invalid remote values without blocking legacy database repair', () => {
    expect(() => toCanonicalIsoTimestamp('not-a-timestamp')).toThrow('Timestamp tidak valid');
    expect(normalizeStoredTimestamp('not-a-timestamp')).toBe('not-a-timestamp');
  });
});
