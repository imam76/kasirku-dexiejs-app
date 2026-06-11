import type {
  ChartOfAccount,
  CompanyProfileSetting,
  FinanceAccountMapping,
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
