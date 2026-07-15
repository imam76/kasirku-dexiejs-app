import { FINANCE_CATEGORIES } from '@/constants/finance';
import type { ChartOfAccount } from '@/types';
import type { FinanceAccountSnapshot } from '@/utils/chartOfAccounts/getFinanceAccountSnapshotForCategory';

const CASH_ACCOUNT_CATEGORIES = [
  FINANCE_CATEGORIES.OPENING_BALANCE,
  FINANCE_CATEGORIES.DEPOSIT,
] as const;

const toAccountSnapshot = (account: ChartOfAccount): FinanceAccountSnapshot => ({
  account_id: account.id,
  account_code: account.code,
  account_name: account.name,
  account_type: account.type,
});

export const resolveFinanceTransactionAccountSnapshot = (
  category: string,
  cashAccount: ChartOfAccount,
  categorySnapshot?: FinanceAccountSnapshot,
): FinanceAccountSnapshot | undefined => {
  if (CASH_ACCOUNT_CATEGORIES.includes(category as typeof CASH_ACCOUNT_CATEGORIES[number])) {
    return toAccountSnapshot(cashAccount);
  }

  return categorySnapshot;
};
