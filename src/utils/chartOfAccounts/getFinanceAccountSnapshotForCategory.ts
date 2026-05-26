import { db } from '@/lib/db';
import type { AccountType } from '@/types';

export interface FinanceAccountSnapshot {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
}

export const getFinanceAccountSnapshotForCategory = async (
  category: string,
): Promise<FinanceAccountSnapshot | undefined> => {
  const mapping = await db.financeAccountMappings
    .where('key')
    .equals(category)
    .first();

  if (!mapping) return undefined;

  const account = await db.chartOfAccounts.get(mapping.account_id);
  if (!account || !account.is_active || !account.is_postable) {
    return undefined;
  }

  return {
    account_id: account.id,
    account_code: account.code,
    account_name: account.name,
    account_type: account.type,
  };
};

