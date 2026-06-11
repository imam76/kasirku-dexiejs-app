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

export interface TotalPercentLoanSummaryInput {
  principalAmount: number;
  loanServiceRate: number;
  adminFeeRate: number;
  mandatorySavingRate: number;
  installmentCount: number;
}

export interface FlexibleLoanScheduleInput {
  principalAmount: number;
  totalInterestAmount: number;
  installmentCount: number;
}

export interface FlatLoanSummary {
  principal_amount: number;
  interest_rate_per_month: number;
  tenor_months: number;
  total_interest_amount: number;
  total_payable_amount: number;
}

export interface TotalPercentLoanSummary {
  principal_amount: number;
  loan_service_rate: number;
  loan_service_amount: number;
  admin_fee_rate: number;
  admin_fee_amount: number;
  mandatory_saving_rate: number;
  mandatory_saving_amount: number;
  installment_count: number;
  total_interest_amount: number;
  total_payable_amount: number;
  net_disbursement_amount: number;
}

export interface FlatLoanInstallmentAmount {
  installment_number: number;
  principal_amount: number;
  interest_amount: number;
  total_amount: number;
}

export const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const normalizePositiveInteger = (value: number) => Math.max(1, Math.trunc(value));

export const calculateFlatLoanSummary = ({
  principalAmount,
  interestRatePerMonth,
  tenorMonths,
}: FlatLoanSummaryInput): FlatLoanSummary => {
  const principal = roundCurrency(principalAmount);
  const monthlyRate = roundCurrency(interestRatePerMonth);
  const tenor = normalizePositiveInteger(tenorMonths);
  const totalInterest = roundCurrency(principal * (monthlyRate / 100) * tenor);

  return {
    principal_amount: principal,
    interest_rate_per_month: monthlyRate,
    tenor_months: tenor,
    total_interest_amount: totalInterest,
    total_payable_amount: roundCurrency(principal + totalInterest),
  };
};

export const calculateTotalPercentLoanSummary = ({
  principalAmount,
  loanServiceRate,
  adminFeeRate,
  mandatorySavingRate,
  installmentCount,
}: TotalPercentLoanSummaryInput): TotalPercentLoanSummary => {
  const principal = roundCurrency(principalAmount);
  const serviceRate = roundCurrency(loanServiceRate);
  const adminRate = roundCurrency(adminFeeRate);
  const mandatorySavingRateValue = roundCurrency(mandatorySavingRate);
  const count = normalizePositiveInteger(installmentCount);
  const serviceAmount = roundCurrency(principal * (serviceRate / 100));
  const adminFeeAmount = roundCurrency(principal * (adminRate / 100));
  const mandatorySavingAmount = roundCurrency(principal * (mandatorySavingRateValue / 100));

  return {
    principal_amount: principal,
    loan_service_rate: serviceRate,
    loan_service_amount: serviceAmount,
    admin_fee_rate: adminRate,
    admin_fee_amount: adminFeeAmount,
    mandatory_saving_rate: mandatorySavingRateValue,
    mandatory_saving_amount: mandatorySavingAmount,
    installment_count: count,
    total_interest_amount: serviceAmount,
    total_payable_amount: roundCurrency(principal + serviceAmount),
    net_disbursement_amount: roundCurrency(principal - adminFeeAmount - mandatorySavingAmount),
  };
};

export const buildFlexibleLoanInstallmentAmounts = ({
  principalAmount,
  totalInterestAmount,
  installmentCount,
}: FlexibleLoanScheduleInput): FlatLoanInstallmentAmount[] => {
  const tenor = normalizePositiveInteger(installmentCount);
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

export const buildFlatLoanInstallmentAmounts = ({
  principalAmount,
  totalInterestAmount,
  tenorMonths,
}: FlatLoanScheduleInput): FlatLoanInstallmentAmount[] => buildFlexibleLoanInstallmentAmounts({
  principalAmount,
  totalInterestAmount,
  installmentCount: tenorMonths,
});
