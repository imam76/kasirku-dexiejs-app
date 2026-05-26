import type { ChartOfAccount } from '@/types';

export const sortAccountsByCode = <T extends Pick<ChartOfAccount, 'code'>>(accounts: T[]): T[] => {
  return [...accounts].sort((left, right) => left.code.localeCompare(right.code, undefined, {
    numeric: true,
    sensitivity: 'base',
  }));
};

