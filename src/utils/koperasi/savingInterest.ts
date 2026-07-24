import dayjs from '@/lib/dayjs';
import type {
  CooperativeSavingTransaction,
  CooperativeSavingType,
} from '@/types';

export const COOPERATIVE_SAVING_INTEREST_RATE_PER_MONTH = 0.2;

const INTEREST_RATE_DECIMAL = COOPERATIVE_SAVING_INTEREST_RATE_PER_MONTH / 100;

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const isInterestEligibleSavingType = (savingType: CooperativeSavingType) => (
  savingType === 'POKOK' || savingType === 'SUKARELA'
);

interface SavingDepositTranche {
  remainingAmount: number;
  depositDate: string;
  accruedMonths: number;
}

export interface CooperativeSavingInterestSummary {
  ratePerMonth: number;
  grossInterest: number;
  openingInterest: number;
  accruedInterest: number;
  withdrawnInterest: number;
  withdrawnOpeningInterest: number;
  withdrawnAccruedInterest: number;
  availableOpeningInterest: number;
  availableAccruedInterest: number;
  availableInterest: number;
}

export const calculateCooperativeSavingInterest = (
  transactions: CooperativeSavingTransaction[],
  memberId: string,
  savingType: CooperativeSavingType,
  asOfDate = new Date().toISOString(),
): CooperativeSavingInterestSummary => {
  if (!memberId || !isInterestEligibleSavingType(savingType)) {
    return {
      ratePerMonth: COOPERATIVE_SAVING_INTEREST_RATE_PER_MONTH,
      grossInterest: 0,
      openingInterest: 0,
      accruedInterest: 0,
      withdrawnInterest: 0,
      withdrawnOpeningInterest: 0,
      withdrawnAccruedInterest: 0,
      availableOpeningInterest: 0,
      availableAccruedInterest: 0,
      availableInterest: 0,
    };
  }

  const asOf = dayjs(asOfDate);
  const tranches: SavingDepositTranche[] = [];
  let accruedInterest = 0;
  let openingInterest = 0;
  let withdrawnInterest = 0;

  const accrueUntil = (date: string) => {
    const accrualDate = dayjs(date);

    tranches.forEach((tranche) => {
      const completedMonths = Math.max(0, accrualDate.diff(dayjs(tranche.depositDate), 'month'));
      const newMonths = Math.max(0, completedMonths - tranche.accruedMonths);
      if (newMonths <= 0 || tranche.remainingAmount <= 0) return;

      accruedInterest = roundCurrency(
        accruedInterest + (tranche.remainingAmount * INTEREST_RATE_DECIMAL * newMonths),
      );
      tranche.accruedMonths = completedMonths;
    });
  };

  const activeTransactions = transactions
    .filter((transaction) => (
      transaction.member_id === memberId &&
      transaction.saving_type === savingType &&
      transaction.status === 'POSTED' &&
      transaction.transaction_type !== 'REVERSAL' &&
      !dayjs(transaction.transaction_date).isAfter(asOf)
    ))
    .sort((left, right) => (
      left.transaction_date.localeCompare(right.transaction_date) ||
      left.created_at.localeCompare(right.created_at) ||
      left.id.localeCompare(right.id)
    ));

  activeTransactions.forEach((transaction) => {
    accrueUntil(transaction.transaction_date);

    if (transaction.transaction_type === 'DEPOSIT' || transaction.transaction_type === 'OPENING_BALANCE') {
      if (transaction.transaction_type === 'OPENING_BALANCE') {
        openingInterest = roundCurrency(
          openingInterest + Number(transaction.opening_interest_amount || 0),
        );
      }
      tranches.push({
        remainingAmount: roundCurrency(transaction.amount),
        depositDate: transaction.transaction_date,
        accruedMonths: 0,
      });
      return;
    }

    if (transaction.withdrawal_source === 'INTEREST') {
      withdrawnInterest = roundCurrency(withdrawnInterest + transaction.amount);
      return;
    }

    let remainingWithdrawal = roundCurrency(transaction.amount);
    for (const tranche of tranches) {
      if (remainingWithdrawal <= 0) break;

      const deductedAmount = Math.min(tranche.remainingAmount, remainingWithdrawal);
      tranche.remainingAmount = roundCurrency(tranche.remainingAmount - deductedAmount);
      remainingWithdrawal = roundCurrency(remainingWithdrawal - deductedAmount);
    }
  });

  accrueUntil(asOfDate);

  const withdrawnOpeningInterest = Math.min(openingInterest, withdrawnInterest);
  const withdrawnAccruedInterest = Math.max(0, roundCurrency(withdrawnInterest - withdrawnOpeningInterest));
  const availableOpeningInterest = Math.max(0, roundCurrency(openingInterest - withdrawnOpeningInterest));
  const availableAccruedInterest = Math.max(0, roundCurrency(accruedInterest - withdrawnAccruedInterest));

  return {
    ratePerMonth: COOPERATIVE_SAVING_INTEREST_RATE_PER_MONTH,
    grossInterest: roundCurrency(openingInterest + accruedInterest),
    openingInterest: roundCurrency(openingInterest),
    accruedInterest: roundCurrency(accruedInterest),
    withdrawnInterest: roundCurrency(withdrawnInterest),
    withdrawnOpeningInterest: roundCurrency(withdrawnOpeningInterest),
    withdrawnAccruedInterest: roundCurrency(withdrawnAccruedInterest),
    availableOpeningInterest,
    availableAccruedInterest,
    availableInterest: roundCurrency(availableOpeningInterest + availableAccruedInterest),
  };
};
