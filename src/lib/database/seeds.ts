import type {
  ChartOfAccount,
  CompanyProfileSetting,
  FinanceAccountMapping,
  PaymentMethodMaster,
} from '@/types';
import { DEFAULT_ACCOUNTING_PROFILE_SETTING, DEFAULT_ENABLED_MODULES, DEFAULT_GENERAL_LEDGER_SETTING } from '@/constants/accounting';
import { DEFAULT_CHART_OF_ACCOUNTS, DEFAULT_FINANCE_ACCOUNT_MAPPINGS } from '@/constants/chartOfAccounts';

export const buildAccountingSeed = (now: string) => {
  const accounts: ChartOfAccount[] = DEFAULT_CHART_OF_ACCOUNTS.map((account) => ({
    ...account,
    created_at: now,
    updated_at: now,
  }));
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const mappings: FinanceAccountMapping[] = DEFAULT_FINANCE_ACCOUNT_MAPPINGS
    .map((mapping) => {
      const account = accountById.get(mapping.account_id);
      if (!account) return undefined;

      return {
        ...mapping,
        id: mapping.key,
        account_code: account.code,
        account_name: account.name,
        account_type: account.type,
        created_at: now,
        updated_at: now,
      };
    })
    .filter((mapping): mapping is FinanceAccountMapping => Boolean(mapping));

  return {
    accounts,
    mappings,
    profileSetting: {
      ...DEFAULT_ACCOUNTING_PROFILE_SETTING,
      created_at: now,
      updated_at: now,
    },
    generalLedgerSetting: {
      ...DEFAULT_GENERAL_LEDGER_SETTING,
      created_at: now,
      updated_at: now,
    },
    enabledModules: DEFAULT_ENABLED_MODULES.map((module) => ({
      ...module,
      created_at: now,
      updated_at: now,
    })),
  };
};

export const buildDefaultCompanyProfileSetting = (now: string): CompanyProfileSetting => ({
  id: 'default',
  created_at: now,
  updated_at: now,
});

export const buildDefaultPaymentMethods = (
  accounts: ChartOfAccount[],
  now: string,
): PaymentMethodMaster[] => {
  const cashAccount = accounts.find((account) => account.id === 'cash')
    ?? accounts.find((account) => account.code === '1010');
  const bankAccount = accounts.find((account) => account.id === 'bank')
    ?? accounts.find((account) => account.code === '1020');

  const buildSystemMethod = (
    input: Pick<PaymentMethodMaster, 'id' | 'code' | 'name' | 'category' | 'requires_reference' | 'sort_order'>,
    account: ChartOfAccount | undefined,
  ): PaymentMethodMaster => ({
    ...input,
    posting_account_id: account?.id,
    posting_account_code: account?.code,
    posting_account_name: account?.name,
    is_system: true,
    is_active: Boolean(account?.is_active && account.is_postable && account.type === 'ASSET'),
    created_at: now,
    updated_at: now,
    sync_status: 'pending',
    sync_error: undefined,
  });

  return [
    buildSystemMethod({
      id: 'payment-method-cash',
      code: 'TUNAI',
      name: 'Tunai',
      category: 'CASH',
      requires_reference: false,
      sort_order: 10,
    }, cashAccount),
    buildSystemMethod({
      id: 'payment-method-non-cash-legacy',
      code: 'NON_TUNAI',
      name: 'Non Tunai',
      category: 'OTHER',
      requires_reference: false,
      sort_order: 20,
    }, bankAccount),
  ];
};
