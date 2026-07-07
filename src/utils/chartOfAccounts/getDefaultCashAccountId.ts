import type { ChartOfAccount } from '@/types';

export const getDefaultCashAccountId = (accounts: Pick<ChartOfAccount, 'id' | 'code'>[]) => (
  accounts.find((account) => account.id === 'cash' || account.code === '1010')?.id
    ?? accounts[0]?.id
);
