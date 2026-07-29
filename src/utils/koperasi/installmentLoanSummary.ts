import type { CooperativeLoan, CooperativeLoanInstallment } from '@/types';
import {
  getInstallmentRemainingAmounts,
  sortInstallmentsForPaymentAllocation,
} from './loanPaymentAllocation';

export interface CooperativeInstallmentLoanSummary {
  loan: CooperativeLoan;
  installments: CooperativeLoanInstallment[];
  totalBillAmount: number;
  totalPaidAmount: number;
  remainingAmount: number;
  totalInstallmentCount: number;
  paidInstallmentCount: number;
  remainingInstallmentCount: number;
  nextInstallment?: CooperativeLoanInstallment;
}

export const buildCooperativeInstallmentLoanSummaries = (
  loans: CooperativeLoan[],
  installments: CooperativeLoanInstallment[],
): CooperativeInstallmentLoanSummary[] => {
  const installmentsByLoanId = new Map<string, CooperativeLoanInstallment[]>();
  installments.forEach((installment) => {
    const current = installmentsByLoanId.get(installment.loan_id) ?? [];
    current.push(installment);
    installmentsByLoanId.set(installment.loan_id, current);
  });

  return loans
    .filter((loan) => ['DISBURSED', 'PAID_OFF'].includes(loan.status))
    .map((loan) => {
      const loanInstallments = sortInstallmentsForPaymentAllocation(
        installmentsByLoanId.get(loan.id) ?? [],
      );
      const totalBillAmount = loanInstallments.reduce((sum, installment) => (
        sum + installment.principal_amount + installment.interest_amount + installment.penalty_amount
      ), 0);
      const totalPaidAmount = loanInstallments.reduce((sum, installment) => (
        sum + installment.paid_principal_amount + installment.paid_interest_amount + installment.paid_penalty_amount
      ), 0);
      const remainingInstallments = loanInstallments.filter((installment) => (
        getInstallmentRemainingAmounts(installment).total_amount > 0.01
      ));

      return {
        loan,
        installments: loanInstallments,
        totalBillAmount,
        totalPaidAmount,
        remainingAmount: remainingInstallments.reduce((sum, installment) => (
          sum + getInstallmentRemainingAmounts(installment).total_amount
        ), 0),
        totalInstallmentCount: loanInstallments.length,
        paidInstallmentCount: loanInstallments.length - remainingInstallments.length,
        remainingInstallmentCount: remainingInstallments.length,
        nextInstallment: remainingInstallments[0],
      };
    })
    .filter((summary) => summary.installments.length > 0)
    .sort((first, second) => (
      first.loan.member_name.localeCompare(second.loan.member_name) ||
      first.loan.member_number.localeCompare(second.loan.member_number) ||
      first.loan.loan_number.localeCompare(second.loan.loan_number)
    ));
};
