import { describe, expect, test } from 'bun:test';
import type { CooperativeLoan, CooperativeLoanInstallment } from '../../src/types';
import { buildCooperativeInstallmentLoanSummaries } from '../../src/utils/koperasi/installmentLoanSummary';

const makeLoan = (overrides: Partial<CooperativeLoan> & Pick<CooperativeLoan, 'id' | 'loan_number' | 'member_id' | 'member_number' | 'member_name'>): CooperativeLoan => ({
  principal_amount: 300,
  interest_rate_per_month: 1,
  tenor_months: 3,
  total_interest_amount: 30,
  total_payable_amount: 330,
  outstanding_principal_amount: 300,
  outstanding_interest_amount: 30,
  outstanding_penalty_amount: 0,
  status: 'DISBURSED',
  application_date: '2026-01-01T00:00:00.000Z',
  disbursed_at: '2026-01-02T00:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const makeInstallment = (
  loan: CooperativeLoan,
  installmentNumber: number,
  overrides: Partial<CooperativeLoanInstallment> = {},
): CooperativeLoanInstallment => ({
  id: `${loan.id}-installment-${installmentNumber}`,
  loan_id: loan.id,
  loan_number: loan.loan_number,
  member_id: loan.member_id,
  member_number: loan.member_number,
  member_name: loan.member_name,
  installment_number: installmentNumber,
  due_date: `2026-0${installmentNumber + 1}-01T00:00:00.000Z`,
  principal_amount: 100,
  interest_amount: 10,
  penalty_amount: 0,
  paid_principal_amount: 0,
  paid_interest_amount: 0,
  paid_penalty_amount: 0,
  status: 'UNPAID',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('buildCooperativeInstallmentLoanSummaries', () => {
  test('merangkum saldo historis dan posisi angsuran dari paid fields kartu angsuran', () => {
    const activeLoan = makeLoan({
      id: 'loan-active',
      loan_number: 'KSU-PJ-001',
      member_id: 'member-andi',
      member_number: 'KSU-001',
      member_name: 'Andi',
      is_migration: true,
    });
    const paidOffLoan = makeLoan({
      id: 'loan-paid-off',
      loan_number: 'KSU-PJ-002',
      member_id: 'member-budi',
      member_number: 'KSU-002',
      member_name: 'Budi',
      status: 'PAID_OFF',
      principal_amount: 100,
      total_interest_amount: 10,
      total_payable_amount: 110,
      outstanding_principal_amount: 0,
      outstanding_interest_amount: 0,
    });
    const approvedLoan = makeLoan({
      id: 'loan-approved',
      loan_number: 'KSU-PJ-003',
      member_id: 'member-cici',
      member_number: 'KSU-003',
      member_name: 'Cici',
      status: 'APPROVED',
    });
    const installments = [
      makeInstallment(activeLoan, 3),
      makeInstallment(activeLoan, 1, {
        paid_principal_amount: 100,
        paid_interest_amount: 10,
        status: 'PAID',
      }),
      makeInstallment(activeLoan, 2, {
        paid_principal_amount: 50,
        status: 'PARTIAL',
      }),
      makeInstallment(paidOffLoan, 1, {
        paid_principal_amount: 100,
        paid_interest_amount: 10,
        status: 'PAID',
      }),
      makeInstallment(approvedLoan, 1),
    ];

    const summaries = buildCooperativeInstallmentLoanSummaries(
      [paidOffLoan, approvedLoan, activeLoan],
      installments,
    );

    expect(summaries).toHaveLength(2);
    expect(summaries.map((summary) => summary.loan.id)).toEqual(['loan-active', 'loan-paid-off']);
    expect(summaries[0]).toMatchObject({
      totalBillAmount: 330,
      totalPaidAmount: 160,
      remainingAmount: 170,
      totalInstallmentCount: 3,
      paidInstallmentCount: 1,
      remainingInstallmentCount: 2,
    });
    expect(summaries[0].installments.map((installment) => installment.installment_number)).toEqual([1, 2, 3]);
    expect(summaries[0].nextInstallment?.installment_number).toBe(2);
    expect(summaries[1]).toMatchObject({
      totalBillAmount: 110,
      totalPaidAmount: 110,
      remainingAmount: 0,
      paidInstallmentCount: 1,
      remainingInstallmentCount: 0,
    });
    expect(summaries[1].nextInstallment).toBeUndefined();
  });
});
