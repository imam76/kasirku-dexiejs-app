import dayjs from '@/lib/dayjs';
import type { CooperativeLoanInstallment } from '@/types';
import { roundCurrency } from '@/utils/koperasi/loanSchedule';

export const COOPERATIVE_IPTW_RATE = 0.05;

const getDateKey = (value: string) => dayjs(value).tz().format('YYYY-MM-DD');

export const calculateCooperativeIptwAmount = (principalAmount: number) => (
  roundCurrency(Number(principalAmount || 0) * COOPERATIVE_IPTW_RATE)
);

export const isCooperativeLoanEligibleForIptw = (
  installments: Pick<CooperativeLoanInstallment, 'status' | 'due_date' | 'paid_at'>[],
) => (
  installments.length > 0 &&
  installments.every((installment) => (
    installment.status === 'PAID' &&
    Boolean(installment.paid_at) &&
    getDateKey(installment.paid_at as string) <= getDateKey(installment.due_date)
  ))
);
