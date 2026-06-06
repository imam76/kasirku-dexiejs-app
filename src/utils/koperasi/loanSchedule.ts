export interface FlatLoanSummaryInput {
  principalAmount: number;
  interestRatePerMonth: number;
  tenorMonths: number;
}

export interface FlatLoanScheduleInput {
  principalAmount: number;
  totalInterestAmount: number;
  tenorMonths: number;
}

export interface FlatLoanSummary {
  principal_amount: number;
  interest_rate_per_month: number;
  tenor_months: number;
  total_interest_amount: number;
  total_payable_amount: number;
}

export interface FlatLoanInstallmentAmount {
  installment_number: number;
  principal_amount: number;
  interest_amount: number;
  total_amount: number;
}

export const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const calculateFlatLoanSummary = ({
  principalAmount,
  interestRatePerMonth,
  tenorMonths,
}: FlatLoanSummaryInput): FlatLoanSummary => {
  const principal = roundCurrency(principalAmount);
  const monthlyRate = roundCurrency(interestRatePerMonth);
  const tenor = Math.max(1, Math.trunc(tenorMonths));
  const totalInterest = roundCurrency(principal * (monthlyRate / 100) * tenor);

  return {
    principal_amount: principal,
    interest_rate_per_month: monthlyRate,
    tenor_months: tenor,
    total_interest_amount: totalInterest,
    total_payable_amount: roundCurrency(principal + totalInterest),
  };
};

export const buildFlatLoanInstallmentAmounts = ({
  principalAmount,
  totalInterestAmount,
  tenorMonths,
}: FlatLoanScheduleInput): FlatLoanInstallmentAmount[] => {
  const tenor = Math.max(1, Math.trunc(tenorMonths));
  const principal = roundCurrency(principalAmount);
  const totalInterest = roundCurrency(totalInterestAmount);
  const basePrincipal = roundCurrency(principal / tenor);
  const baseInterest = roundCurrency(totalInterest / tenor);
  let principalAllocated = 0;
  let interestAllocated = 0;

  return Array.from({ length: tenor }, (_item, index) => {
    const installmentNumber = index + 1;
    const isLast = installmentNumber === tenor;
    const principalAmountForRow = isLast
      ? roundCurrency(principal - principalAllocated)
      : basePrincipal;
    const interestAmountForRow = isLast
      ? roundCurrency(totalInterest - interestAllocated)
      : baseInterest;

    principalAllocated = roundCurrency(principalAllocated + principalAmountForRow);
    interestAllocated = roundCurrency(interestAllocated + interestAmountForRow);

    return {
      installment_number: installmentNumber,
      principal_amount: Math.max(0, principalAmountForRow),
      interest_amount: Math.max(0, interestAmountForRow),
      total_amount: roundCurrency(Math.max(0, principalAmountForRow) + Math.max(0, interestAmountForRow)),
    };
  });
};
