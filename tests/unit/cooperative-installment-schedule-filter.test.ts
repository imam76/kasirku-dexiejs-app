import { describe, expect, test } from 'bun:test';
import dayjs from '../../src/lib/dayjs';
import type { CooperativeLoanInstallment } from '../../src/types';
import { hasUnpaidInstallmentForSchedule } from '../../src/utils/koperasi/installmentScheduleFilter';

const makeInstallment = (
  dueDate: string,
  overrides: Partial<CooperativeLoanInstallment> = {},
) => ({
  due_date: dueDate,
  principal_amount: 100_000,
  interest_amount: 10_000,
  penalty_amount: 0,
  paid_principal_amount: 0,
  paid_interest_amount: 0,
  paid_penalty_amount: 0,
  status: 'UNPAID',
  ...overrides,
} as CooperativeLoanInstallment);

describe('filter cakupan jadwal angsuran', () => {
  const referenceDate = dayjs.tz('2026-07-29T10:00:00+07:00');

  test('hari ini memakai tanggal Asia/Jakarta dan hanya menyertakan angsuran belum lunas', () => {
    const dueToday = makeInstallment('2026-07-28T17:00:00.000Z');
    const paidToday = makeInstallment('2026-07-28T17:00:00.000Z', {
      status: 'PAID',
      paid_principal_amount: 100_000,
      paid_interest_amount: 10_000,
    });

    expect(hasUnpaidInstallmentForSchedule([dueToday], 'TODAY', referenceDate)).toBe(true);
    expect(hasUnpaidInstallmentForSchedule([paidToday], 'TODAY', referenceDate)).toBe(false);
  });

  test('minggu ini memakai pekan kalender Senin sampai Minggu', () => {
    const monday = makeInstallment('2026-07-27T03:00:00.000Z');
    const sunday = makeInstallment('2026-08-02T03:00:00.000Z');
    const nextMonday = makeInstallment('2026-08-03T03:00:00.000Z');

    expect(hasUnpaidInstallmentForSchedule([monday], 'THIS_WEEK', referenceDate)).toBe(true);
    expect(hasUnpaidInstallmentForSchedule([sunday], 'THIS_WEEK', referenceDate)).toBe(true);
    expect(hasUnpaidInstallmentForSchedule([nextMonday], 'THIS_WEEK', referenceDate)).toBe(false);
  });

  test('semua belum lunas memakai sisa nominal, termasuk angsuran parsial', () => {
    const partial = makeInstallment('2026-09-10T03:00:00.000Z', {
      status: 'PARTIAL',
      paid_principal_amount: 50_000,
    });
    const paid = makeInstallment('2026-09-10T03:00:00.000Z', {
      status: 'PAID',
      paid_principal_amount: 100_000,
      paid_interest_amount: 10_000,
    });

    expect(hasUnpaidInstallmentForSchedule([partial], 'ALL_UNPAID', referenceDate)).toBe(true);
    expect(hasUnpaidInstallmentForSchedule([paid], 'ALL_UNPAID', referenceDate)).toBe(false);
  });
});
