import type { AccountNormalBalance, AccountType } from '@/types';

export const getAccountNormalBalance = (type: AccountType): AccountNormalBalance => {
  if (type === 'ASSET' || type === 'EXPENSE' || type === 'CONTRA_REVENUE') {
    return 'DEBIT';
  }

  return 'CREDIT';
};

