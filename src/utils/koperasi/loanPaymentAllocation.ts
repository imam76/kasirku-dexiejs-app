import { roundCurrency } from './loanSchedule';

export interface LoanInstallmentAllocationSource {
  principal_amount: number;
  interest_amount: number;
  penalty_amount: number;
  paid_principal_amount: number;
  paid_interest_amount: number;
  paid_penalty_amount: number;
}

export interface LoanPaymentAllocation {
  principal_amount: number;
  interest_amount: number;
  penalty_amount: number;
  total_amount: number;
  remaining_principal_amount: number;
  remaining_interest_amount: number;
  remaining_penalty_amount: number;
  remaining_total_amount: number;
}

const clampRemaining = (amount: number) => Math.max(0, roundCurrency(amount));

export const getInstallmentRemainingAmounts = (
  installment: LoanInstallmentAllocationSource,
) => {
  const remainingPenalty = clampRemaining(installment.penalty_amount - installment.paid_penalty_amount);
  const remainingInterest = clampRemaining(installment.interest_amount - installment.paid_interest_amount);
  const remainingPrincipal = clampRemaining(installment.principal_amount - installment.paid_principal_amount);

  return {
    principal_amount: remainingPrincipal,
    interest_amount: remainingInterest,
    penalty_amount: remainingPenalty,
    total_amount: roundCurrency(remainingPenalty + remainingInterest + remainingPrincipal),
  };
};

export const allocateLoanPaymentToInstallment = (
  installment: LoanInstallmentAllocationSource,
  paymentAmount: number,
): LoanPaymentAllocation => {
  const remaining = getInstallmentRemainingAmounts(installment);
  let unallocatedAmount = roundCurrency(paymentAmount);

  if (unallocatedAmount <= 0) {
    throw new Error('Nominal pembayaran wajib lebih dari 0.');
  }

  if (unallocatedAmount - remaining.total_amount > 0.01) {
    throw new Error('Nominal pembayaran melebihi sisa tagihan angsuran.');
  }

  const penaltyAmount = Math.min(unallocatedAmount, remaining.penalty_amount);
  unallocatedAmount = roundCurrency(unallocatedAmount - penaltyAmount);

  const interestAmount = Math.min(unallocatedAmount, remaining.interest_amount);
  unallocatedAmount = roundCurrency(unallocatedAmount - interestAmount);

  const principalAmount = Math.min(unallocatedAmount, remaining.principal_amount);
  unallocatedAmount = roundCurrency(unallocatedAmount - principalAmount);

  if (unallocatedAmount > 0.01) {
    throw new Error('Alokasi pembayaran angsuran tidak valid.');
  }

  return {
    principal_amount: roundCurrency(principalAmount),
    interest_amount: roundCurrency(interestAmount),
    penalty_amount: roundCurrency(penaltyAmount),
    total_amount: roundCurrency(penaltyAmount + interestAmount + principalAmount),
    remaining_principal_amount: roundCurrency(remaining.principal_amount - principalAmount),
    remaining_interest_amount: roundCurrency(remaining.interest_amount - interestAmount),
    remaining_penalty_amount: roundCurrency(remaining.penalty_amount - penaltyAmount),
    remaining_total_amount: roundCurrency(
      remaining.principal_amount +
      remaining.interest_amount +
      remaining.penalty_amount -
      principalAmount -
      interestAmount -
      penaltyAmount,
    ),
  };
};
