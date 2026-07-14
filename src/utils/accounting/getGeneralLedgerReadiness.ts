import { db } from '@/lib/db';
import {
  ACCOUNT_OPENING_BALANCE_SOURCE_EVENT,
  OPENING_BALANCE_MODULE_ORDER,
  getOpeningBalanceBatchId,
} from '@/services/openingBalanceService';
import type { ChartOfAccount, GeneralLedgerSetting, OpeningBalanceBatch } from '@/types';

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
  isAvailable: boolean;
  setting?: GeneralLedgerSetting;
  availabilityChecks: GeneralLedgerReadinessCheck[];
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

const ACCOUNT_OPENING_BALANCE_SOURCE_EVENTS = [
  'OPENING_BALANCE_POSTED',
  ACCOUNT_OPENING_BALANCE_SOURCE_EVENT,
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
  const [accounts, mappings, setting, setup, accountingPeriods] = await Promise.all([
    db.chartOfAccounts.toArray(),
    db.financeAccountMappings.toArray(),
    db.generalLedgerSetting.get('default'),
    db.accountingInitialSetupSetting.get('default'),
    db.accountingPeriods.toArray(),
  ]);
  const effectiveSetting: GeneralLedgerSetting | undefined = setup
    ? {
      id: 'default' as const,
      is_ready: setting?.is_ready ?? false,
      cutoff_date: setup.cutoff_date,
      inventory_policy: setup.inventory_policy,
      opening_balance_journal_id: setting?.opening_balance_journal_id,
      activated_at: setting?.activated_at,
      created_at: setting?.created_at ?? setup.created_at,
      updated_at: setting?.updated_at ?? setup.updated_at,
      sync_status: setting?.sync_status,
      sync_error: setting?.sync_error,
      last_synced_at: setting?.last_synced_at,
      remote_updated_at: setting?.remote_updated_at,
    }
    : setting;
  const requiredAccounts = REQUIRED_ACCOUNT_CANDIDATES.map((candidate) => ({
    ...candidate,
    account: findAccountCandidate(accounts, candidate),
  }));
  const missingRequiredAccounts = requiredAccounts.filter(({ account }) => !account?.is_active || !account?.is_postable);
  const activePostableAccounts = accounts.filter((account) => account.is_active && account.is_postable);
  const currentPeriod = setup?.current_period_id
    ? accountingPeriods.find((period) => period.id === setup.current_period_id && !period.deleted_at)
    : undefined;
  const hasAccountingPeriod = Boolean(
    currentPeriod ||
    accountingPeriods.some((period) => !period.deleted_at && period.status !== 'CLOSED'),
  );
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const invalidMappings = mappings.filter((mapping) => {
    const account = accountById.get(mapping.account_id);
    return !account || !account.is_active || !account.is_postable;
  });
  const settingOpeningBalanceJournal = effectiveSetting?.opening_balance_journal_id
    ? await db.journalEntries.get(effectiveSetting.opening_balance_journal_id)
    : undefined;
  const openingBalanceBatches = await db.openingBalanceBatches.toArray();
  const accountBatchId = effectiveSetting?.cutoff_date
    ? getOpeningBalanceBatchId('ACCOUNT', effectiveSetting.cutoff_date)
    : undefined;
  const sourceJournalMatchesAccountOpening = (entry: NonNullable<typeof settingOpeningBalanceJournal>) => (
    entry.status === 'POSTED' &&
    entry.source_type === 'OPENING_BALANCE' &&
    ACCOUNT_OPENING_BALANCE_SOURCE_EVENTS.includes(entry.source_event ?? '') &&
    (!accountBatchId || entry.source_id === accountBatchId || entry.source_id === 'default')
  );
  const accountOpeningBalanceJournal = settingOpeningBalanceJournal && sourceJournalMatchesAccountOpening(settingOpeningBalanceJournal)
    ? settingOpeningBalanceJournal
    : accountBatchId
      ? await db.journalEntries
        .where('source_type')
        .equals('OPENING_BALANCE')
        .filter(sourceJournalMatchesAccountOpening)
        .first()
      : undefined;
  const getBatch = (module: OpeningBalanceBatch['module']) => {
    if (!effectiveSetting?.cutoff_date) return undefined;
    return openingBalanceBatches.find((batch) => (
      batch.id === getOpeningBalanceBatchId(module, effectiveSetting.cutoff_date as string) &&
      batch.status !== 'VOIDED'
    ));
  };
  const accountOpeningPosted = Boolean(accountOpeningBalanceJournal);
  const openingBalanceStatuses = OPENING_BALANCE_MODULE_ORDER.map((module) => {
    const batch = getBatch(module);
    const isAccountJournalPosted = module === 'ACCOUNT' && !batch && accountOpeningPosted;

    return {
      module,
      batch,
      isDone: isAccountJournalPosted || batch?.status === 'POSTED' || batch?.status === 'SKIPPED',
      label: module
        .toLowerCase()
        .replace(/_/g, ' '),
    };
  });
  const incompleteOpeningBalanceModules = openingBalanceStatuses.filter((status) => !status.isDone);
  const postedOpeningBatches = openingBalanceStatuses
    .map((status) => status.batch)
    .filter((batch): batch is OpeningBalanceBatch => Boolean(batch && batch.status === 'POSTED'));
  const openingTotalDebit = postedOpeningBatches.reduce((sum, batch) => sum + Number(batch.total_debit || 0), 0) +
    (postedOpeningBatches.some((batch) => batch.module === 'ACCOUNT') || !accountOpeningPosted
      ? 0
      : Number(accountOpeningBalanceJournal?.total_debit || 0));
  const openingTotalCredit = postedOpeningBatches.reduce((sum, batch) => sum + Number(batch.total_credit || 0), 0) +
    (postedOpeningBatches.some((batch) => batch.module === 'ACCOUNT') || !accountOpeningPosted
      ? 0
      : Number(accountOpeningBalanceJournal?.total_credit || 0));
  const isOpeningTotalBalanced = Math.abs(openingTotalDebit - openingTotalCredit) <= 0.01;
  const hasLedgerTables = Boolean(db.generalLedgerSetting && db.journalEntries && db.journalEntryLines);
  const availabilityChecks: GeneralLedgerReadinessCheck[] = [
    {
      key: 'accountCatalog',
      label: 'Daftar akun',
      passed: activePostableAccounts.length > 0,
      message: activePostableAccounts.length > 0
        ? 'Daftar akun memiliki akun aktif dan postable.'
        : 'Daftar akun belum memiliki akun aktif dan postable.',
    },
    {
      key: 'cutoffDate',
      label: 'Cutoff ledger',
      passed: Boolean(effectiveSetting?.cutoff_date),
      message: effectiveSetting?.cutoff_date
        ? `Cutoff ledger tersimpan pada ${effectiveSetting.cutoff_date.slice(0, 10)}.`
        : 'Cutoff ledger belum diisi.',
    },
    {
      key: 'accountingPeriod',
      label: 'Periode akuntansi',
      passed: hasAccountingPeriod,
      message: hasAccountingPeriod
        ? 'Periode akuntansi tersedia.'
        : 'Periode akuntansi belum tersedia.',
    },
    {
      key: 'backupTables',
      label: 'Backup/restore ledger',
      passed: hasLedgerTables,
      message: 'Table setting ledger dan journal tersedia untuk backup/restore.',
    },
  ];
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
      passed: Boolean(effectiveSetting?.cutoff_date),
      message: effectiveSetting?.cutoff_date
        ? `Cutoff ledger tersimpan pada ${effectiveSetting.cutoff_date.slice(0, 10)}.`
        : 'Cutoff ledger belum diisi.',
    },
    {
      key: 'openingBalanceModules',
      label: 'Module saldo awal',
      passed: incompleteOpeningBalanceModules.length === 0,
      message: incompleteOpeningBalanceModules.length === 0
        ? 'Semua module saldo awal sudah posted atau dilewati.'
        : `Module saldo awal belum selesai: ${incompleteOpeningBalanceModules.map((item) => item.label).join(', ')}.`,
    },
    {
      key: 'openingBalanceTotals',
      label: 'Balance saldo awal',
      passed: isOpeningTotalBalanced,
      message: isOpeningTotalBalanced
        ? 'Total debit dan kredit saldo awal posted balance.'
        : `Total saldo awal belum balance: debit ${openingTotalDebit}, kredit ${openingTotalCredit}.`,
    },
    {
      key: 'inventoryPolicy',
      label: 'Policy persediaan',
      passed: effectiveSetting?.inventory_policy === 'PERPETUAL_INVENTORY',
      message: effectiveSetting?.inventory_policy === 'PERPETUAL_INVENTORY'
        ? 'Policy persediaan memakai perpetual inventory.'
        : 'Policy persediaan belum siap untuk balance sheet inventory.',
    },
    {
      key: 'backupTables',
      label: 'Backup/restore ledger',
      passed: hasLedgerTables,
      message: 'Table setting ledger dan journal tersedia untuk backup/restore.',
    },
  ];
  const isAvailable = availabilityChecks.every((check) => check.passed);

  return {
    isReady: isAvailable && checks.every((check) => check.passed),
    isAvailable,
    setting: effectiveSetting,
    availabilityChecks,
    checks,
    requiredAccounts,
  };
};
