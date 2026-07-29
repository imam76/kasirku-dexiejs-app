import { describe, expect, test } from 'bun:test';
import {
  getCooperativeInstallmentBookAgeMonth,
  getCooperativeInstallmentBookAgingCategory,
  getCooperativeInstallmentBookAgingDate,
  resolveCooperativeInstallmentBookAgingCategory,
} from '../../src/services/cooperativeInstallmentBookReportService';

describe('aging Buku Angsuran', () => {
  test('menghitung umur dari tanggal pencairan aktual, bukan jadwal resmi', () => {
    const agingDate = getCooperativeInstallmentBookAgingDate({
      application_date: '2026-01-20T09:00:00.000+07:00',
      scheduled_disbursement_date: '2026-03-02T09:00:00.000+07:00',
      disbursed_at: '2026-02-27T09:00:00.000+07:00',
    });
    const ageMonth = getCooperativeInstallmentBookAgeMonth(agingDate, '2026-06-01');

    expect(agingDate).toBe('2026-02-27T09:00:00.000+07:00');
    expect(ageMonth).toBe(5);
    expect(getCooperativeInstallmentBookAgingCategory(ageMonth)).toBe('WATCHLIST');
  });

  test('bulan 1-4 lancar, awal bulan 5 calon macet, dan awal bulan 6 macet', () => {
    expect([1, 2, 3, 4].map(getCooperativeInstallmentBookAgingCategory))
      .toEqual(['CURRENT', 'CURRENT', 'CURRENT', 'CURRENT']);
    expect(getCooperativeInstallmentBookAgingCategory(5)).toBe('WATCHLIST');
    expect(getCooperativeInstallmentBookAgingCategory(6)).toBe('DELINQUENT');
    expect(getCooperativeInstallmentBookAgingCategory(12)).toBe('DELINQUENT');
  });

  test('pelunasan pada bulan ke-5 tetap dikelompokkan sebagai calon macet', () => {
    expect(resolveCooperativeInstallmentBookAgingCategory({
      ageMonth: 5,
      openingBalance: 530_000,
      installmentAmount: 530_000,
    })).toBe('WATCHLIST');
  });

  test('pelunasan pada bulan ke-6 tetap dikelompokkan sebagai macet', () => {
    expect(resolveCooperativeInstallmentBookAgingCategory({
      ageMonth: 6,
      openingBalance: 530_000,
      installmentAmount: 530_000,
    })).toBe('DELINQUENT');
  });

  test('pinjaman tanpa saldo awal dan tanpa transaksi tidak masuk laporan bulan berikutnya', () => {
    expect(resolveCooperativeInstallmentBookAgingCategory({
      ageMonth: 6,
      openingBalance: 0,
      installmentAmount: 0,
    })).toBeUndefined();
  });
});
