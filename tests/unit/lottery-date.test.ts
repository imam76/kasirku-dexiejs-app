import { describe, expect, test } from 'bun:test';
import {
  buildLotteryNumber,
  normalizeLotteryFormInput,
} from '@/services/lotteryService';

describe('lottery timestamps', () => {
  test('builds lottery numbers from the Asia/Jakarta business clock', () => {
    expect(
      buildLotteryNumber(new Date('2026-08-26T17:00:00.123Z'), 'Asep Irawan'),
    ).toBe('UND-AI-260827-000000-123');

    expect(
      buildLotteryNumber(new Date('2026-08-27T16:59:59.999Z'), 'Kasir'),
    ).toBe('UND-K-260827-235959-999');
    expect(
      buildLotteryNumber(new Date('2026-08-27T17:00:00.000Z'), 'Kasir'),
    ).toBe('UND-K-260828-000000-000');
  });

  test('canonicalizes schedule timestamps to UTC and standardizes empty values as null', () => {
    expect(normalizeLotteryFormInput({
      name: ' Undian Agustus ',
      min_total: 10_000,
      start_at: '2026-08-28T10:00:00+07:00',
      end_at: '',
      active: true,
    })).toEqual({
      name: 'Undian Agustus',
      min_total: 10_000,
      max_total: null,
      start_at: '2026-08-28T03:00:00.000Z',
      end_at: null,
      active: true,
    });
  });

  test('rejects every invalid or reversed schedule before it reaches Dexie', () => {
    expect(() => normalizeLotteryFormInput({
      name: 'Undian Invalid',
      min_total: 10_000,
      start_at: 'not-a-timestamp',
      end_at: null,
      active: true,
    })).toThrow('Tanggal mulai undian tidak valid.');

    expect(() => normalizeLotteryFormInput({
      name: 'Undian Terbalik',
      min_total: 10_000,
      start_at: '2026-08-29T00:00:00.000Z',
      end_at: '2026-08-28T00:00:00.000Z',
      active: true,
    })).toThrow('Tanggal mulai undian tidak boleh melewati tanggal selesai.');
  });
});
