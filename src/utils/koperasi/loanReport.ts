import dayjs from '@/lib/dayjs';
import type {
  CooperativeLoan,
  CooperativeLoanInstallment,
  CooperativeLoanPayment,
} from '@/types';
import { roundCurrency } from './loanSchedule';

const DATE_KEY_FORMAT = 'YYYY-MM-DD';

const getDateKey = (value: string) => dayjs(value).tz().format(DATE_KEY_FORMAT);

export const isReportableCooperativeLoanPayment = (
  payment: CooperativeLoanPayment,
) => (
  payment.status === 'POSTED' &&
  payment.payment_type !== 'REVERSAL' &&
  !payment.reversal_of_payment_id &&
  !payment.reversal_payment_id
);

export const getLatestReportableLoanPaymentDateByLoanId = (
  payments: CooperativeLoanPayment[],
) => {
  const latestDateByLoanId = new Map<string, string>();

  payments
    .filter(isReportableCooperativeLoanPayment)
    .forEach((payment) => {
      const dateKey = getDateKey(payment.payment_date);
      const currentDateKey = latestDateByLoanId.get(payment.loan_id);
      if (!currentDateKey || dateKey > currentDateKey) {
        latestDateByLoanId.set(payment.loan_id, dateKey);
      }
    });

  return latestDateByLoanId;
};

export const getCooperativeLoanPaidOffDateByLoanId = (
  loans: CooperativeLoan[],
  payments: CooperativeLoanPayment[],
  installments: CooperativeLoanInstallment[],
) => {
  const paidOffLoans = loans.filter((loan) => loan.status === 'PAID_OFF');
  const paidOffLoanIds = new Set(paidOffLoans.map((loan) => loan.id));
  const paidOffDateByLoanId = new Map<string, string>();

  const registerLatestDate = (loanId: string, value?: string) => {
    if (!value || !paidOffLoanIds.has(loanId)) return;
    const dateKey = getDateKey(value);
    const currentDateKey = paidOffDateByLoanId.get(loanId);
    if (!currentDateKey || dateKey > currentDateKey) {
      paidOffDateByLoanId.set(loanId, dateKey);
    }
  };

  payments
    .filter(isReportableCooperativeLoanPayment)
    .forEach((payment) => registerLatestDate(payment.loan_id, payment.payment_date));

  installments
    .filter((installment) => installment.status === 'PAID')
    .forEach((installment) => registerLatestDate(installment.loan_id, installment.paid_at));

  // Legacy fallback: older paid-off loans may not have complete payment/installment dates.
  paidOffLoans.forEach((loan) => {
    if (!paidOffDateByLoanId.has(loan.id)) {
      registerLatestDate(loan.id, loan.updated_at);
    }
  });

  return paidOffDateByLoanId;
};

export const getCooperativeLoanContractualInstallmentAmount = (
  loan: CooperativeLoan,
  installments: CooperativeLoanInstallment[],
) => {
  const scheduledInstallment = [...installments]
    .sort((left, right) => left.installment_number - right.installment_number)[0];

  if (scheduledInstallment) {
    return roundCurrency(
      Number(scheduledInstallment.principal_amount || 0) +
      Number(scheduledInstallment.interest_amount || 0),
    );
  }

  const installmentCount = Math.max(
    1,
    Math.trunc(Number(loan.installment_count || loan.tenor_months || 1)),
  );

  return roundCurrency(Number(loan.total_payable_amount || 0) / installmentCount);
};
