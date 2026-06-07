import { db } from '@/lib/db';
import type { ChartOfAccount, GeneralLedgerSetting } from '@/types';

interface RequiredAccountCandidate {
  key: string;
  label: string;
  ids: string[];
  codes: string[];
}

export interface GeneralLedgerReadinessCheck {
  key: string;
  label: string;
  passed: boolean;
  message: string;
}

export interface GeneralLedgerReadinessResult {
  isReady: boolean;
  setting?: GeneralLedgerSetting;
  checks: GeneralLedgerReadinessCheck[];
  requiredAccounts: Array<RequiredAccountCandidate & { account?: ChartOfAccount }>;
}

const REQUIRED_ACCOUNT_CANDIDATES: RequiredAccountCandidate[] = [
  { key: 'cash', label: 'Kas Tunai', ids: ['cash', 'template-cash'], codes: ['1010'] },
  { key: 'bank', label: 'Bank / Non Tunai', ids: ['bank', 'template-bank'], codes: ['1020'] },
  { key: 'accountsReceivable', label: 'Piutang Usaha', ids: ['accounts-receivable', 'template-accounts-receivable'], codes: ['1100'] },
  { key: 'inventory', label: 'Persediaan Barang', ids: ['inventory', 'template-inventory'], codes: ['1200'] },
  { key: 'salesPos', label: 'Penjualan POS', ids: ['sales-pos', 'template-sales-pos'], codes: ['4000', '4010'] },
  { key: 'salesInvoiceRevenue', label: 'Pendapatan Sales Invoice', ids: ['sales-invoice-revenue', 'template-sales-invoice-revenue'], codes: ['4010', '4020'] },
  { key: 'salesReturn', label: 'Retur Penjualan', ids: ['sales-return', 'template-sales-return'], codes: ['4020', '4100'] },
  { key: 'cogs', label: 'HPP', ids: ['cogs', 'template-cogs'], codes: ['5000', '5010'] },
];

const findAccountCandidate = (
  accounts: ChartOfAccount[],
  candidate: RequiredAccountCandidate,
) => {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const accountByCode = new Map(accounts.map((account) => [account.code, account]));

  return candidate.ids
    .map((id) => accountById.get(id))
    .find(Boolean) ?? candidate.codes.map((code) => accountByCode.get(code)).find(Boolean);
};

export const getGeneralLedgerReadiness = async (): Promise<GeneralLedgerReadinessResult> => {
  const [accounts, mappings, setting] = await Promise.all([
    db.chartOfAccounts.toArray(),
    db.financeAccountMappings.toArray(),
    db.generalLedgerSetting.get('default'),
  ]);
  const requiredAccounts = REQUIRED_ACCOUNT_CANDIDATES.map((candidate) => ({
    ...candidate,
    account: findAccountCandidate(accounts, candidate),
  }));
  const missingRequiredAccounts = requiredAccounts.filter(({ account }) => !account?.is_active || !account?.is_postable);
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const invalidMappings = mappings.filter((mapping) => {
    const account = accountById.get(mapping.account_id);
    return !account || !account.is_active || !account.is_postable;
  });
  const openingBalanceJournal = setting?.opening_balance_journal_id
    ? await db.journalEntries.get(setting.opening_balance_journal_id)
    : undefined;
  const checks: GeneralLedgerReadinessCheck[] = [
    {
      key: 'requiredAccounts',
      label: 'Akun wajib',
      passed: missingRequiredAccounts.length === 0,
      message: missingRequiredAccounts.length === 0
        ? 'Akun wajib aktif dan postable.'
        : `Akun wajib belum siap: ${missingRequiredAccounts.map((item) => item.label).join(', ')}.`,
    },
    {
      key: 'mappingAccounts',
      label: 'Mapping finance',
      passed: invalidMappings.length === 0,
      message: invalidMappings.length === 0
        ? 'Mapping finance mengarah ke akun aktif dan postable.'
        : `${invalidMappings.length} mapping finance mengarah ke akun tidak aktif/non-postable.`,
    },
    {
      key: 'cutoffDate',
      label: 'Cutoff ledger',
      passed: Boolean(setting?.cutoff_date),
      message: setting?.cutoff_date
        ? `Cutoff ledger tersimpan pada ${setting.cutoff_date.slice(0, 10)}.`
        : 'Cutoff ledger belum diisi.',
    },
    {
      key: 'openingBalance',
      label: 'Opening balance',
      passed: openingBalanceJournal?.status === 'POSTED' && openingBalanceJournal.source_type === 'OPENING_BALANCE',
      message: openingBalanceJournal?.status === 'POSTED' && openingBalanceJournal.source_type === 'OPENING_BALANCE'
        ? `Opening balance ${openingBalanceJournal.entry_number} sudah posted.`
        : 'Opening balance journal belum posted.',
    },
    {
      key: 'inventoryPolicy',
      label: 'Policy persediaan',
      passed: setting?.inventory_policy === 'PERPETUAL_INVENTORY',
      message: setting?.inventory_policy === 'PERPETUAL_INVENTORY'
        ? 'Policy persediaan memakai perpetual inventory.'
        : 'Policy persediaan belum siap untuk balance sheet inventory.',
    },
    {
      key: 'backupTables',
      label: 'Backup/restore ledger',
      passed: Boolean(db.generalLedgerSetting && db.journalEntries && db.journalEntryLines),
      message: 'Table setting ledger dan journal tersedia untuk backup/restore.',
    },
  ];

  return {
    isReady: checks.every((check) => check.passed),
    setting,
    checks,
    requiredAccounts,
  };
};
