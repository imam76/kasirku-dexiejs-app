import { db } from '@/lib/db';
import type { AccountType, ChartOfAccount } from '@/types';

export type DocumentDiscountPurpose = 'sales' | 'purchase';

export interface DocumentDiscountAccountSnapshot {
  discount_account_id?: string;
  discount_account_code?: string;
  discount_account_name?: string;
}

const defaultAccountIdsByPurpose = {
  sales: ['sales-discount', 'template-sales-discount'],
  purchase: ['purchase-discount', 'stock-purchase', 'template-purchase-discount', 'template-stock-purchase'],
} satisfies Record<DocumentDiscountPurpose, string[]>;

const allowedAccountTypesByPurpose: Record<DocumentDiscountPurpose, AccountType[]> = {
  sales: ['CONTRA_REVENUE'],
  purchase: ['EXPENSE'],
};

const toSnapshot = (account: ChartOfAccount): DocumentDiscountAccountSnapshot => ({
  discount_account_id: account.id,
  discount_account_code: account.code,
  discount_account_name: account.name,
});

const isAllowedAccount = (account: ChartOfAccount | undefined, purpose: DocumentDiscountPurpose) => {
  return Boolean(
    account &&
    account.is_active &&
    account.is_postable &&
    allowedAccountTypesByPurpose[purpose].includes(account.type),
  );
};

export const getDocumentDiscountAccountSnapshot = async (
  purpose: DocumentDiscountPurpose,
  accountId?: string,
): Promise<DocumentDiscountAccountSnapshot> => {
  const accounts = await db.chartOfAccounts.toArray();

  if (accountId) {
    const selectedAccount = accounts.find((account) => account.id === accountId);
    if (selectedAccount && isAllowedAccount(selectedAccount, purpose)) {
      return toSnapshot(selectedAccount);
    }
  }

  const defaultAccount = defaultAccountIdsByPurpose[purpose]
    .map((id) => accounts.find((account) => account.id === id))
    .find((account) => isAllowedAccount(account, purpose));

  return defaultAccount ? toSnapshot(defaultAccount) : {};
};
