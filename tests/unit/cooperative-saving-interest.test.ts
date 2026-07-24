import { describe, expect, test } from 'bun:test';
import { cooperativeSavingOpeningBalanceSchema } from '../../src/lib/validations/cooperativeSaving';
import type { CooperativeSavingTransaction } from '../../src/types';
import { calculateCooperativeSavingInterest } from '../../src/utils/koperasi/savingInterest';

const buildTransaction = (
  input: Partial<CooperativeSavingTransaction> & Pick<CooperativeSavingTransaction, 'id' | 'transaction_type' | 'amount' | 'transaction_date'>,
): CooperativeSavingTransaction => ({
  member_id: 'member-1',
  member_number: 'KSU-001',
  member_name: 'Anggota Demo',
  saving_type: 'SUKARELA',
  status: 'POSTED',
  created_at: input.transaction_date,
  updated_at: input.transaction_date,
  ...input,
});

describe('calculateCooperativeSavingInterest', () => {
  test('menggabungkan jasa historis dengan jasa berjalan sejak cut-off', () => {
    const transactions = [
      buildTransaction({
        id: 'opening-1',
        transaction_type: 'OPENING_BALANCE',
        amount: 1_000_000,
        opening_interest_amount: 50_000,
        transaction_date: '2025-01-31T00:00:00.000Z',
      }),
    ];

    const summary = calculateCooperativeSavingInterest(
      transactions,
      'member-1',
      'SUKARELA',
      '2025-03-31T00:00:00.000Z',
    );

    expect(summary.openingInterest).toBe(50_000);
    expect(summary.accruedInterest).toBe(4_000);
    expect(summary.grossInterest).toBe(54_000);
    expect(summary.availableOpeningInterest).toBe(50_000);
    expect(summary.availableAccruedInterest).toBe(4_000);
    expect(summary.availableInterest).toBe(54_000);
  });

  test('pengambilan jasa memakai saldo historis terlebih dahulu', () => {
    const transactions = [
      buildTransaction({
        id: 'opening-1',
        transaction_type: 'OPENING_BALANCE',
        amount: 5_000_000,
        opening_interest_amount: 50_000,
        transaction_date: '2025-01-01T00:00:00.000Z',
      }),
      buildTransaction({
        id: 'withdrawal-1',
        transaction_type: 'WITHDRAWAL',
        withdrawal_source: 'INTEREST',
        amount: 55_000,
        transaction_date: '2025-02-01T00:00:00.000Z',
      }),
    ];

    const summary = calculateCooperativeSavingInterest(
      transactions,
      'member-1',
      'SUKARELA',
      '2025-02-01T00:00:00.000Z',
    );

    expect(summary.accruedInterest).toBe(10_000);
    expect(summary.withdrawnOpeningInterest).toBe(50_000);
    expect(summary.withdrawnAccruedInterest).toBe(5_000);
    expect(summary.availableOpeningInterest).toBe(0);
    expect(summary.availableAccruedInterest).toBe(5_000);
    expect(summary.availableInterest).toBe(5_000);
  });

  test('reversal pengambilan mengembalikan jasa historis yang tersedia', () => {
    const transactions = [
      buildTransaction({
        id: 'opening-1',
        transaction_type: 'OPENING_BALANCE',
        amount: 0,
        opening_interest_amount: 25_000,
        transaction_date: '2025-01-01T00:00:00.000Z',
      }),
      buildTransaction({
        id: 'withdrawal-1',
        transaction_type: 'WITHDRAWAL',
        withdrawal_source: 'INTEREST',
        opening_interest_applied_amount: 10_000,
        amount: 10_000,
        status: 'REVERSED',
        transaction_date: '2025-01-02T00:00:00.000Z',
      }),
      buildTransaction({
        id: 'reversal-1',
        transaction_type: 'REVERSAL',
        withdrawal_source: 'INTEREST',
        opening_interest_applied_amount: 10_000,
        reversal_of_transaction_id: 'withdrawal-1',
        amount: 10_000,
        transaction_date: '2025-01-03T00:00:00.000Z',
      }),
    ];

    const summary = calculateCooperativeSavingInterest(
      transactions,
      'member-1',
      'SUKARELA',
      '2025-01-03T00:00:00.000Z',
    );

    expect(summary.withdrawnInterest).toBe(0);
    expect(summary.availableOpeningInterest).toBe(25_000);
    expect(summary.availableInterest).toBe(25_000);
  });

  test('simpanan wajib tetap tidak menghasilkan atau menerima jasa', () => {
    const transactions = [
      buildTransaction({
        id: 'opening-1',
        saving_type: 'WAJIB',
        transaction_type: 'OPENING_BALANCE',
        amount: 1_000_000,
        opening_interest_amount: 50_000,
        transaction_date: '2025-01-01T00:00:00.000Z',
      }),
    ];

    const summary = calculateCooperativeSavingInterest(
      transactions,
      'member-1',
      'WAJIB',
      '2025-03-01T00:00:00.000Z',
    );

    expect(summary.grossInterest).toBe(0);
    expect(summary.availableInterest).toBe(0);
  });
});

describe('cooperativeSavingOpeningBalanceSchema', () => {
  const baseInput = {
    member_id: 'member-1',
    saving_type: 'SUKARELA' as const,
    amount: 0,
    opening_interest_amount: 25_000,
    transaction_date: '2025-01-01T00:00:00.000Z',
  };

  test('menerima saldo jasa historis tanpa saldo pokok', () => {
    expect(cooperativeSavingOpeningBalanceSchema.parse(baseInput)).toMatchObject(baseInput);
  });

  test('menolak saldo pokok dan jasa yang sama-sama nol', () => {
    const result = cooperativeSavingOpeningBalanceSchema.safeParse({
      ...baseInput,
      opening_interest_amount: 0,
    });

    expect(result.success).toBeFalse();
  });

  test('menolak jasa historis untuk simpanan wajib', () => {
    const result = cooperativeSavingOpeningBalanceSchema.safeParse({
      ...baseInput,
      saving_type: 'WAJIB',
    });

    expect(result.success).toBeFalse();
  });
});
