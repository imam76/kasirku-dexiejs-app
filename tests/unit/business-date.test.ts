import { describe, expect, test } from 'bun:test';
import {
  getBusinessDayBoundsIso,
  isBusinessDateKeyInRange,
  toBusinessDateKey,
  toBusinessDatePrefix,
} from '@/utils/businessDate';

describe('business date (Asia/Jakarta)', () => {
  test('resolves the correct WIB day across the 00:00-07:00 boundary', () => {
    // 2026-08-26 23:59:59 WIB
    expect(toBusinessDateKey('2026-08-26T16:59:59.000Z')).toBe('2026-08-26');
    // 2026-08-27 00:00:00 WIB
    expect(toBusinessDateKey('2026-08-26T17:00:00.000Z')).toBe('2026-08-27');
    // 2026-08-27 06:59:59 WIB
    expect(toBusinessDateKey('2026-08-26T23:59:59.000Z')).toBe('2026-08-27');
    // 2026-08-27 07:00:00 WIB
    expect(toBusinessDateKey('2026-08-27T00:00:00.000Z')).toBe('2026-08-27');
  });

  test('does not shift date-only YYYY-MM-DD values', () => {
    expect(toBusinessDateKey('2026-08-27')).toBe('2026-08-27');
    expect(toBusinessDatePrefix('2026-08-27')).toBe('20260827');
  });

  test('produces YYYYMMDD prefixes matching the WIB day', () => {
    expect(toBusinessDatePrefix('2026-08-26T17:00:00.000Z')).toBe('20260827');
    expect(toBusinessDatePrefix(new Date('2026-08-26T23:30:00Z'))).toBe('20260827');
  });

  test('day bounds cover the full WIB day as UTC instants', () => {
    const { startIso, endIso } = getBusinessDayBoundsIso('2026-08-27T00:00:00.000Z');
    expect(startIso).toBe('2026-08-26T17:00:00.000Z');
    expect(endIso).toBe('2026-08-27T16:59:59.999Z');

    const preSevenAm = '2026-08-26T23:30:00.000Z';
    expect(preSevenAm >= startIso && preSevenAm <= endIso).toBe(true);
  });

  test('range filter groups pre-07:00 WIB payments into the correct day', () => {
    const paidAt = '2026-08-26T23:30:00.000Z'; // 2026-08-27 06:30 WIB
    expect(isBusinessDateKeyInRange(paidAt, '2026-08-27', '2026-08-27')).toBe(true);
    expect(isBusinessDateKeyInRange(paidAt, '2026-08-26', '2026-08-26')).toBe(false);
  });
});
