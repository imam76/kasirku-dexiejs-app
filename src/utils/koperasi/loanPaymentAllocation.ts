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

export interface LoanInstallmentPaymentAllocation<TInstallment extends LoanInstallmentAllocationSource = LoanInstallmentAllocationSource> {
  installment: TInstallment;
  allocation: LoanPaymentAllocation;
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

export const sortInstallmentsForPaymentAllocation = <
  TInstallment extends LoanInstallmentAllocationSource & {
    due_date?: string;
    installment_number?: number;
    created_at?: string;
    id?: string;
  },
>(
  installments: TInstallment[],
) => [...installments].sort((first, second) => (
  (first.due_date ?? '').localeCompare(second.due_date ?? '') ||
  Number(first.installment_number ?? 0) - Number(second.installment_number ?? 0) ||
  (first.created_at ?? '').localeCompare(second.created_at ?? '') ||
  (first.id ?? '').localeCompare(second.id ?? '')
));

export const allocateLoanPaymentAcrossInstallments = <
  TInstallment extends LoanInstallmentAllocationSource & {
    due_date?: string;
    installment_number?: number;
    created_at?: string;
    id?: string;
  },
>(
  installments: TInstallment[],
  paymentAmount: number,
): LoanInstallmentPaymentAllocation<TInstallment>[] => {
  let unallocatedAmount = roundCurrency(paymentAmount);

  if (unallocatedAmount <= 0) {
    throw new Error('Nominal pembayaran wajib lebih dari 0.');
  }

  const payableInstallments = sortInstallmentsForPaymentAllocation(installments)
    .filter((installment) => getInstallmentRemainingAmounts(installment).total_amount > 0.01);
  const totalRemaining = roundCurrency(payableInstallments.reduce(
    (sum, installment) => sum + getInstallmentRemainingAmounts(installment).total_amount,
    0,
  ));

  if (unallocatedAmount - totalRemaining > 0.01) {
    throw new Error('Nominal pembayaran melebihi total sisa pinjaman.');
  }

  const allocations: LoanInstallmentPaymentAllocation<TInstallment>[] = [];
  for (const installment of payableInstallments) {
    if (unallocatedAmount <= 0.01) break;

    const remaining = getInstallmentRemainingAmounts(installment);
    const allocationAmount = Math.min(unallocatedAmount, remaining.total_amount);
    const allocation = allocateLoanPaymentToInstallment(installment, allocationAmount);
    allocations.push({ installment, allocation });
    unallocatedAmount = roundCurrency(unallocatedAmount - allocation.total_amount);
  }

  if (unallocatedAmount > 0.01) {
    throw new Error('Alokasi pembayaran angsuran tidak valid.');
  }

  return allocations;
};
