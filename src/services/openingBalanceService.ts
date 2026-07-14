import { db } from '@/lib/db';
import {
  getCurrentSessionUser,
  requireRolePermission,
  writeActivityLog,
} from '@/auth/authService';
import { enqueueGeneralLedgerSettingSync } from '@/services/syncQueueService';
import { postOpeningBalanceSourceJournal } from '@/services/generalLedgerService';
import type {
  ChartOfAccount,
  GeneralLedgerSetting,
  InventoryAccountingPolicy,
  OpeningBalanceBatch,
  OpeningBalanceLine,
  OpeningBalanceModule,
} from '@/types';

interface AccountCandidate {
  ids: string[];
  codes: string[];
}

interface OpeningBalanceModuleDefinition {
  module: OpeningBalanceModule;
  route: string;
  titleKey: string;
  shortTitleKey: string;
  descriptionKey: string;
  sourceEvent: string;
  debitCandidate?: AccountCandidate;
  creditCandidate?: AccountCandidate;
  targetSide?: 'DEBIT' | 'CREDIT';
}

export interface OpeningBalanceSourceLineInput {
  party_name?: string;
  document_number?: string;
  document_date?: string;
  due_date?: string;
  amount: number;
  notes?: string;
}

export interface AccountOpeningBalanceLineInput {
  account_id: string;
  debit?: number;
  credit?: number;
  notes?: string;
}

export interface AccountOpeningBalancePreviewLine {
  account_id: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  notes?: string;
  is_adjustment?: boolean;
}

export interface PostOpeningBalanceDetailBatchInput {
  module: Exclude<OpeningBalanceModule, 'ACCOUNT'>;
  lines: OpeningBalanceSourceLineInput[];
  notes?: string;
}

const MODULE_ORDER: OpeningBalanceModule[] = [
  'ACCOUNT',
  'RECEIVABLE',
  'PAYABLE',
  'ADVANCE_RECEIVED',
  'ADVANCE_PAID',
];

const EQUITY_CANDIDATE: AccountCandidate = {
  ids: [
    'opening-balance-equity',
    'template-opening-balance-equity',
    'owner-capital',
    'template-owner-capital',
    'retained-earning',
    'template-retained-earning',
    'simpanan-pokok-modal',
    'template-simpanan-pokok-modal',
  ],
  codes: ['3050', '3000', '3010', '3100'],
};

export const OPENING_BALANCE_MODULE_DEFINITIONS: OpeningBalanceModuleDefinition[] = [
  {
    module: 'ACCOUNT',
    route: '/finance/opening-balances/accounts',
    titleKey: 'openingBalances.modules.account.title',
    shortTitleKey: 'openingBalances.modules.account.short',
    descriptionKey: 'openingBalances.modules.account.description',
    sourceEvent: 'ACCOUNT_OPENING_BALANCE_POSTED',
  },
  {
    module: 'RECEIVABLE',
    route: '/finance/opening-balances/receivables',
    titleKey: 'openingBalances.modules.receivable.title',
    shortTitleKey: 'openingBalances.modules.receivable.short',
    descriptionKey: 'openingBalances.modules.receivable.description',
    sourceEvent: 'RECEIVABLE_OPENING_BALANCE_POSTED',
    debitCandidate: { ids: ['accounts-receivable', 'template-accounts-receivable'], codes: ['1100'] },
    creditCandidate: EQUITY_CANDIDATE,
    targetSide: 'DEBIT',
  },
  {
    module: 'PAYABLE',
    route: '/finance/opening-balances/payables',
    titleKey: 'openingBalances.modules.payable.title',
    shortTitleKey: 'openingBalances.modules.payable.short',
    descriptionKey: 'openingBalances.modules.payable.description',
    sourceEvent: 'PAYABLE_OPENING_BALANCE_POSTED',
    debitCandidate: EQUITY_CANDIDATE,
    creditCandidate: { ids: ['accounts-payable', 'template-accounts-payable'], codes: ['2000', '2010'] },
    targetSide: 'CREDIT',
  },
  {
    module: 'ADVANCE_RECEIVED',
    route: '/finance/opening-balances/advance-received',
    titleKey: 'openingBalances.modules.advanceReceived.title',
    shortTitleKey: 'openingBalances.modules.advanceReceived.short',
    descriptionKey: 'openingBalances.modules.advanceReceived.description',
    sourceEvent: 'ADVANCE_RECEIVED_OPENING_BALANCE_POSTED',
    debitCandidate: EQUITY_CANDIDATE,
    creditCandidate: { ids: ['deposit-payable', 'loan-payable', 'accounts-payable'], codes: ['2200', '2010', '2000'] },
    targetSide: 'CREDIT',
  },
  {
    module: 'ADVANCE_PAID',
    route: '/finance/opening-balances/advance-paid',
    titleKey: 'openingBalances.modules.advancePaid.title',
    shortTitleKey: 'openingBalances.modules.advancePaid.short',
    descriptionKey: 'openingBalances.modules.advancePaid.description',
    sourceEvent: 'ADVANCE_PAID_OPENING_BALANCE_POSTED',
    debitCandidate: { ids: ['prepaid-expense', 'employee-cash-advance-receivable', 'other-receivable'], codes: ['1300', '1130', '1110'] },
    creditCandidate: EQUITY_CANDIDATE,
    targetSide: 'DEBIT',
  },
];

export const OPENING_BALANCE_MODULE_ORDER = MODULE_ORDER;

export const ACCOUNT_OPENING_BALANCE_SOURCE_EVENT = 'ACCOUNT_OPENING_BALANCE_POSTED';

export const OPENING_BALANCE_EQUITY_CANDIDATE = EQUITY_CANDIDATE;

const MANAGED_ACCOUNT_CANDIDATES: Array<{
  module: Exclude<OpeningBalanceModule, 'ACCOUNT'>;
  candidate: AccountCandidate;
  label: string;
}> = [
  {
    module: 'RECEIVABLE',
    candidate: { ids: ['accounts-receivable', 'template-accounts-receivable'], codes: ['1100'] },
    label: 'Piutang Usaha',
  },
  {
    module: 'PAYABLE',
    candidate: { ids: ['accounts-payable', 'template-accounts-payable'], codes: ['2000', '2010'] },
    label: 'Hutang Usaha',
  },
  {
    module: 'ADVANCE_RECEIVED',
    candidate: { ids: ['deposit-payable', 'loan-payable', 'accounts-payable'], codes: ['2200', '2010', '2000'] },
    label: 'Uang Muka Diterima',
  },
  {
    module: 'ADVANCE_PAID',
    candidate: { ids: ['prepaid-expense', 'employee-cash-advance-receivable', 'other-receivable'], codes: ['1300', '1130', '1110'] },
    label: 'Uang Muka Dibayar',
  },
];

export const getOpeningBalanceModuleDefinition = (module: OpeningBalanceModule) => {
  const definition = OPENING_BALANCE_MODULE_DEFINITIONS.find((item) => item.module === module);
  if (!definition) {
    throw new Error(`Module saldo awal ${module} tidak dikenal.`);
  }
  return definition;
};

export const getOpeningBalanceBatchId = (module: OpeningBalanceModule, cutoffDate: string) => (
  `opening-balance-${module.toLowerCase().replace(/_/g, '-')}-${cutoffDate.slice(0, 10)}`
);

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const normalizeStartOfDay = (value: string) => (
  value.includes('T') ? value : `${value.slice(0, 10)}T00:00:00.000`
);

const amountOrZero = (value: number | undefined) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? roundCurrency(amount) : 0;
};

const getEffectiveOpeningBalanceSetting = async () => {
  const [setup, setting] = await Promise.all([
    db.accountingInitialSetupSetting.get('default'),
    db.generalLedgerSetting.get('default'),
  ]);
  const cutoffDate = setup?.cutoff_date ?? setting?.cutoff_date;
  const inventoryPolicy = setup?.inventory_policy ?? setting?.inventory_policy ?? 'PERPETUAL_INVENTORY';

  return {
    setup,
    setting,
    cutoffDate,
    inventoryPolicy,
  };
};

const requireCutoff = async () => {
  const effective = await getEffectiveOpeningBalanceSetting();
  if (!effective.cutoffDate) {
    throw new Error('Cutoff ledger belum tersedia. Selesaikan setup akuntansi awal terlebih dahulu.');
  }

  return {
    ...effective,
    cutoffDate: effective.cutoffDate,
    inventoryPolicy: effective.inventoryPolicy as InventoryAccountingPolicy,
  };
};

const findAccountCandidate = (
  accounts: ChartOfAccount[],
  candidate: AccountCandidate,
) => {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const accountByCode = new Map(accounts.map((account) => [account.code, account]));

  return candidate.ids
    .map((id) => accountById.get(id))
    .find(Boolean) ?? candidate.codes.map((code) => accountByCode.get(code)).find(Boolean);
};

const requirePostableAccount = (
  accounts: ChartOfAccount[],
  candidate: AccountCandidate | undefined,
  label: string,
) => {
  if (!candidate) {
    throw new Error(`Konfigurasi akun ${label} belum tersedia.`);
  }

  const account = findAccountCandidate(accounts, candidate);
  if (!account?.is_active || !account.is_postable) {
    throw new Error(`Akun ${label} belum tersedia, aktif, dan postable.`);
  }

  return account;
};

const normalizeAccountOpeningLines = (
  lines: AccountOpeningBalanceLineInput[],
  accounts: ChartOfAccount[],
) => {
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  return lines
    .map((line) => {
      const account = accountById.get(line.account_id);
      if (!account) {
        throw new Error('Akun saldo awal tidak ditemukan.');
      }

      const debit = amountOrZero(line.debit);
      const credit = amountOrZero(line.credit);
      if (debit > 0 && credit > 0) {
        throw new Error(`Akun ${account.code} - ${account.name} tidak boleh berisi debit dan kredit sekaligus.`);
      }

      return {
        account,
        debit,
        credit,
        notes: line.notes?.trim() || undefined,
      };
    })
    .filter((line) => line.debit > 0 || line.credit > 0);
};

const getManagedAccountBlocks = async (
  accounts: ChartOfAccount[],
  cutoffDate: string,
) => {
  const batches = await db.openingBalanceBatches.toArray();
  const batchById = new Map(batches.map((batch) => [batch.id, batch]));

  return MANAGED_ACCOUNT_CANDIDATES.flatMap((item) => {
    const batch = batchById.get(getOpeningBalanceBatchId(item.module, cutoffDate));
    if (batch?.status !== 'POSTED' && batch?.status !== 'SKIPPED') return [];

    const account = findAccountCandidate(accounts, item.candidate);
    return account
      ? [{
        module: item.module,
        account,
        label: item.label,
        status: batch.status,
      }]
      : [];
  });
};

export const getManagedAccountOpeningBalanceBlocks = async (cutoffDate?: string) => {
  const effective = cutoffDate
    ? { cutoffDate }
    : await requireCutoff();
  const accounts = await db.chartOfAccounts.toArray();
  return getManagedAccountBlocks(accounts, effective.cutoffDate);
};

const assertAccountOpeningLinesNotManaged = async (
  accounts: ChartOfAccount[],
  cutoffDate: string,
  lines: Array<{ account: ChartOfAccount; debit: number; credit: number }>,
) => {
  const blocks = await getManagedAccountBlocks(accounts, cutoffDate);
  if (blocks.length === 0) return;

  const blockedByAccountId = new Map(blocks.map((block) => [block.account.id, block]));
  const blockedLine = lines.find((line) => blockedByAccountId.has(line.account.id));
  if (!blockedLine) return;

  const block = blockedByAccountId.get(blockedLine.account.id);
  throw new Error(
    `Akun ${blockedLine.account.code} - ${blockedLine.account.name} dikelola oleh module ${block?.label ?? block?.module}. Isi saldo awalnya dari submodule detail.`,
  );
};

const resolveOpeningBalanceEquityAccount = (accounts: ChartOfAccount[]) => (
  requirePostableAccount(accounts, OPENING_BALANCE_EQUITY_CANDIDATE, 'Ekuitas Saldo Awal')
);

export const getOpeningBalanceEquityAccount = async () => {
  const accounts = await db.chartOfAccounts.toArray();
  return resolveOpeningBalanceEquityAccount(accounts);
};

export const buildAccountOpeningBalancePreview = ({
  lines,
  equityAccount,
  adjustmentNotes = 'Ekuitas Saldo Awal',
}: {
  lines: Array<{
    account: ChartOfAccount;
    debit: number;
    credit: number;
    notes?: string;
  }>;
  equityAccount?: ChartOfAccount;
  adjustmentNotes?: string;
}): AccountOpeningBalancePreviewLine[] => {
  const normalizedLines = lines
    .map((line) => ({
      account: line.account,
      debit: amountOrZero(line.debit),
      credit: amountOrZero(line.credit),
      notes: line.notes,
    }))
    .filter((line) => line.debit > 0 || line.credit > 0);
  const totalDebit = roundCurrency(normalizedLines.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = roundCurrency(normalizedLines.reduce((sum, line) => sum + line.credit, 0));
  const difference = roundCurrency(totalDebit - totalCredit);
  const previewLines: AccountOpeningBalancePreviewLine[] = normalizedLines.map((line) => ({
    account_id: line.account.id,
    account_code: line.account.code,
    account_name: line.account.name,
    debit: line.debit,
    credit: line.credit,
    notes: line.notes,
  }));

  if (Math.abs(difference) > 0.01 && equityAccount) {
    previewLines.push({
      account_id: equityAccount.id,
      account_code: equityAccount.code,
      account_name: equityAccount.name,
      debit: difference < 0 ? Math.abs(difference) : 0,
      credit: difference > 0 ? difference : 0,
      notes: adjustmentNotes,
      is_adjustment: true,
    });
  }

  return previewLines;
};

const buildSkippedBatch = ({
  module,
  cutoffDate,
  notes,
  now,
  currentUser,
}: {
  module: OpeningBalanceModule;
  cutoffDate: string;
  notes?: string;
  now: string;
  currentUser: Awaited<ReturnType<typeof getCurrentSessionUser>>;
}): OpeningBalanceBatch => ({
  id: getOpeningBalanceBatchId(module, cutoffDate),
  module,
  cutoff_date: cutoffDate,
  status: 'SKIPPED',
  total_debit: 0,
  total_credit: 0,
  skipped_at: now,
  notes,
  created_by: currentUser?.id,
  created_by_name: currentUser?.name,
  updated_by: currentUser?.id,
  updated_by_name: currentUser?.name,
  created_at: now,
  updated_at: now,
  sync_status: 'pending',
  sync_error: undefined,
});

const buildReadyGeneralLedgerSetting = ({
  setting,
  cutoffDate,
  inventoryPolicy,
  openingBalanceJournalId,
  now,
}: {
  setting?: GeneralLedgerSetting;
  cutoffDate: string;
  inventoryPolicy: InventoryAccountingPolicy;
  openingBalanceJournalId?: string;
  now: string;
}): GeneralLedgerSetting => ({
  id: 'default',
  is_ready: true,
  cutoff_date: normalizeStartOfDay(cutoffDate),
  inventory_policy: inventoryPolicy,
  opening_balance_journal_id: openingBalanceJournalId ?? setting?.opening_balance_journal_id,
  activated_at: setting?.activated_at ?? now,
  created_at: setting?.created_at ?? now,
  updated_at: now,
  sync_status: 'pending',
  sync_error: undefined,
});

export const markOpeningBalanceModuleSkipped = async (
  module: OpeningBalanceModule,
  notes?: string,
) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');

  const { cutoffDate, inventoryPolicy, setting } = await requireCutoff();
  const batchId = getOpeningBalanceBatchId(module, cutoffDate);
  const existingBatch = await db.openingBalanceBatches.get(batchId);
  if (existingBatch?.status === 'POSTED') {
    throw new Error('Saldo awal sudah posted dan tidak bisa ditandai dilewati.');
  }
  if (existingBatch?.status === 'SKIPPED') {
    return existingBatch;
  }

  const now = new Date().toISOString();
  const batch = buildSkippedBatch({ module, cutoffDate, notes, now, currentUser });
  let updatedGeneralLedger: GeneralLedgerSetting | undefined;

  await db.transaction('rw', [
    db.openingBalanceBatches,
    db.openingBalanceLines,
    db.generalLedgerSetting,
    db.activityLogs,
  ], async () => {
    await db.openingBalanceBatches.put(batch);
    await db.openingBalanceLines.where('batch_id').equals(batch.id).delete();

    if (module === 'ACCOUNT') {
      updatedGeneralLedger = buildReadyGeneralLedgerSetting({
        setting,
        cutoffDate,
        inventoryPolicy,
        now,
      });
      await db.generalLedgerSetting.put(updatedGeneralLedger);
    }

    await writeActivityLog({
      user: currentUser,
      action: 'OPENING_BALANCE_MODULE_SKIPPED',
      entity: 'openingBalanceBatches',
      entity_id: batch.id,
      description: `${currentUser?.name ?? 'User'} menandai saldo awal ${module} sebagai dilewati.`,
    });
  });

  if (updatedGeneralLedger) {
    await enqueueGeneralLedgerSettingSync(updatedGeneralLedger, 'update');
  }

  return batch;
};

export const saveAccountOpeningBalanceDraft = async ({
  lines,
  notes,
}: {
  lines: AccountOpeningBalanceLineInput[];
  notes?: string;
}) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');

  const { cutoffDate } = await requireCutoff();
  const batchId = getOpeningBalanceBatchId('ACCOUNT', cutoffDate);
  const existingBatch = await db.openingBalanceBatches.get(batchId);
  if (existingBatch?.status === 'POSTED') {
    throw new Error('Saldo awal akun sudah posted.');
  }
  if (existingBatch?.status === 'SKIPPED') {
    throw new Error('Saldo awal akun sudah ditandai dilewati. Flow reset belum tersedia.');
  }

  const accounts = await db.chartOfAccounts.toArray();
  const normalizedLines = normalizeAccountOpeningLines(lines, accounts);
  await assertAccountOpeningLinesNotManaged(accounts, cutoffDate, normalizedLines);

  const now = new Date().toISOString();
  const totalDebit = roundCurrency(normalizedLines.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = roundCurrency(normalizedLines.reduce((sum, line) => sum + line.credit, 0));
  const batch: OpeningBalanceBatch = {
    id: batchId,
    module: 'ACCOUNT',
    cutoff_date: cutoffDate,
    status: 'DRAFT',
    total_debit: totalDebit,
    total_credit: totalCredit,
    notes,
    created_by: existingBatch?.created_by ?? currentUser?.id,
    created_by_name: existingBatch?.created_by_name ?? currentUser?.name,
    updated_by: currentUser?.id,
    updated_by_name: currentUser?.name,
    created_at: existingBatch?.created_at ?? now,
    updated_at: now,
    sync_status: 'pending',
    sync_error: undefined,
  };
  const openingLines: OpeningBalanceLine[] = normalizedLines.map((line, index) => ({
    id: `${batchId}-line-${line.account.id}`,
    batch_id: batchId,
    module: 'ACCOUNT',
    line_number: index + 1,
    base_amount: amountOrZero(line.debit || line.credit),
    account_id: line.account.id,
    account_code: line.account.code,
    account_name: line.account.name,
    debit: line.debit,
    credit: line.credit,
    notes: line.notes,
    created_at: now,
    updated_at: now,
    sync_status: 'pending',
    sync_error: undefined,
  }));

  await db.transaction('rw', [
    db.openingBalanceBatches,
    db.openingBalanceLines,
    db.activityLogs,
  ], async () => {
    await db.openingBalanceBatches.put(batch);
    await db.openingBalanceLines.where('batch_id').equals(batchId).delete();
    if (openingLines.length > 0) {
      await db.openingBalanceLines.bulkPut(openingLines);
    }

    await writeActivityLog({
      user: currentUser,
      action: 'ACCOUNT_OPENING_BALANCE_DRAFT_SAVED',
      entity: 'openingBalanceBatches',
      entity_id: batchId,
      description: `${currentUser?.name ?? 'User'} menyimpan draft saldo awal akun per ${cutoffDate.slice(0, 10)}.`,
    });
  });

  return batch;
};

export const postAccountOpeningBalanceBatch = async ({
  lines,
  notes,
}: {
  lines?: AccountOpeningBalanceLineInput[];
  notes?: string;
}) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');

  const { cutoffDate, inventoryPolicy, setting } = await requireCutoff();
  const batchId = getOpeningBalanceBatchId('ACCOUNT', cutoffDate);
  const existingBatch = await db.openingBalanceBatches.get(batchId);
  if (existingBatch?.status === 'POSTED') {
    return existingBatch;
  }
  if (existingBatch?.status === 'SKIPPED') {
    throw new Error('Saldo awal akun sudah ditandai dilewati. Flow reset belum tersedia.');
  }

  const accounts = await db.chartOfAccounts.toArray();
  const inputLines = lines ?? (await db.openingBalanceLines.where('batch_id').equals(batchId).toArray())
    .map((line) => ({
      account_id: line.account_id ?? '',
      debit: line.debit,
      credit: line.credit,
      notes: line.notes,
    }))
    .filter((line) => line.account_id);
  const normalizedLines = normalizeAccountOpeningLines(inputLines, accounts);
  if (normalizedLines.length === 0) {
    throw new Error('Minimal satu baris saldo awal dengan nominal lebih dari 0 wajib diisi.');
  }
  await assertAccountOpeningLinesNotManaged(accounts, cutoffDate, normalizedLines);

  const equityAccount = resolveOpeningBalanceEquityAccount(accounts);
  const previewLines = buildAccountOpeningBalancePreview({
    lines: normalizedLines,
    equityAccount,
    adjustmentNotes: 'Ekuitas Saldo Awal',
  });
  const journalLines = previewLines.map((line) => {
    const account = accounts.find((item) => item.id === line.account_id);
    if (!account) {
      throw new Error('Akun saldo awal tidak ditemukan.');
    }

    return {
      account,
      debit: line.debit,
      credit: line.credit,
      description: line.notes ?? 'Saldo awal akun',
    };
  });
  const now = new Date().toISOString();
  let batch: OpeningBalanceBatch | undefined;
  let updatedGeneralLedger: GeneralLedgerSetting | undefined;

  await db.transaction('rw', [
    db.generalLedgerSetting,
    db.openingBalanceBatches,
    db.openingBalanceLines,
    db.journalEntries,
    db.journalEntryLines,
    db.activityLogs,
  ], async () => {
    const journalEntry = await postOpeningBalanceSourceJournal({
      source_id: batchId,
      source_number: 'ACCOUNT',
      source_event: ACCOUNT_OPENING_BALANCE_SOURCE_EVENT,
      entry_date: cutoffDate,
      description: `Saldo awal akun per ${cutoffDate.slice(0, 10)}`,
      lines: journalLines,
      actor: currentUser,
    });

    batch = {
      id: batchId,
      module: 'ACCOUNT',
      cutoff_date: cutoffDate,
      status: 'POSTED',
      total_debit: journalEntry.total_debit,
      total_credit: journalEntry.total_credit,
      journal_entry_id: journalEntry.id,
      posted_at: journalEntry.posted_at,
      notes,
      created_by: existingBatch?.created_by ?? currentUser?.id,
      created_by_name: existingBatch?.created_by_name ?? currentUser?.name,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
      created_at: existingBatch?.created_at ?? now,
      updated_at: now,
      sync_status: 'pending',
      sync_error: undefined,
    };

    const openingLines: OpeningBalanceLine[] = previewLines.map((line, index) => ({
      id: line.is_adjustment
        ? `${batchId}-line-opening-balance-equity`
        : `${batchId}-line-${line.account_id}`,
      batch_id: batchId,
      module: 'ACCOUNT',
      line_number: index + 1,
      base_amount: amountOrZero(line.debit || line.credit),
      account_id: line.account_id,
      account_code: line.account_code,
      account_name: line.account_name,
      debit: line.debit,
      credit: line.credit,
      notes: line.notes,
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
      sync_error: undefined,
    }));

    await db.openingBalanceBatches.put(batch);
    await db.openingBalanceLines.where('batch_id').equals(batchId).delete();
    await db.openingBalanceLines.bulkPut(openingLines);

    updatedGeneralLedger = buildReadyGeneralLedgerSetting({
      setting,
      cutoffDate,
      inventoryPolicy,
      openingBalanceJournalId: journalEntry.id,
      now,
    });
    await db.generalLedgerSetting.put(updatedGeneralLedger);

    await writeActivityLog({
      user: currentUser,
      action: 'ACCOUNT_OPENING_BALANCE_POSTED',
      entity: 'openingBalanceBatches',
      entity_id: batchId,
      description: `${currentUser?.name ?? 'User'} posting saldo awal akun per ${cutoffDate.slice(0, 10)}.`,
    });
  });

  if (updatedGeneralLedger) {
    await enqueueGeneralLedgerSettingSync(updatedGeneralLedger, 'update');
  }

  if (!batch) {
    throw new Error('Batch saldo awal akun gagal dibuat.');
  }

  return batch;
};

export const postOpeningBalanceDetailBatch = async ({
  module,
  lines,
  notes,
}: PostOpeningBalanceDetailBatchInput) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');

  const definition = getOpeningBalanceModuleDefinition(module);
  const { cutoffDate } = await requireCutoff();
  const batchId = getOpeningBalanceBatchId(module, cutoffDate);
  const existingBatch = await db.openingBalanceBatches.get(batchId);
  if (existingBatch?.status === 'POSTED') {
    throw new Error('Saldo awal sudah posted.');
  }
  if (existingBatch?.status === 'SKIPPED') {
    throw new Error('Saldo awal sudah ditandai dilewati. Flow reset belum tersedia.');
  }

  const normalizedInputs = lines
    .map((line) => ({
      ...line,
      amount: roundCurrency(Number(line.amount || 0)),
    }))
    .filter((line) => line.amount > 0);
  if (normalizedInputs.length === 0) {
    throw new Error('Minimal satu baris saldo awal dengan nominal lebih dari 0 wajib diisi.');
  }

  const accounts = await db.chartOfAccounts.toArray();
  const debitAccount = requirePostableAccount(accounts, definition.debitCandidate, 'debit saldo awal');
  const creditAccount = requirePostableAccount(accounts, definition.creditCandidate, 'kredit saldo awal');
  const targetAccount = definition.targetSide === 'CREDIT' ? creditAccount : debitAccount;
  const counterAccount = definition.targetSide === 'CREDIT' ? debitAccount : creditAccount;
  const totalAmount = roundCurrency(normalizedInputs.reduce((sum, line) => sum + line.amount, 0));
  const now = new Date().toISOString();

  let batch: OpeningBalanceBatch | undefined;

  await db.transaction('rw', [
    db.openingBalanceBatches,
    db.openingBalanceLines,
    db.journalEntries,
    db.journalEntryLines,
    db.activityLogs,
  ], async () => {
    const journalEntry = await postOpeningBalanceSourceJournal({
      source_id: batchId,
      source_number: definition.module,
      source_event: definition.sourceEvent,
      entry_date: cutoffDate,
      description: `Saldo awal ${definition.module} per ${cutoffDate.slice(0, 10)}`,
      lines: [
        {
          account: debitAccount,
          debit: totalAmount,
          description: `Saldo awal ${definition.module}`,
        },
        {
          account: creditAccount,
          credit: totalAmount,
          description: `Saldo awal ${definition.module}`,
        },
      ],
      actor: currentUser,
    });

    batch = {
      id: batchId,
      module,
      cutoff_date: cutoffDate,
      status: 'POSTED',
      total_debit: journalEntry.total_debit,
      total_credit: journalEntry.total_credit,
      journal_entry_id: journalEntry.id,
      posted_at: journalEntry.posted_at,
      notes,
      created_by: currentUser?.id,
      created_by_name: currentUser?.name,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
      sync_error: undefined,
    };

    const openingLines: OpeningBalanceLine[] = normalizedInputs.map((line, index) => ({
      id: `${batchId}-line-${index + 1}`,
      batch_id: batchId,
      module,
      line_number: index + 1,
      party_name: line.party_name?.trim() || undefined,
      document_number: line.document_number?.trim() || undefined,
      document_date: line.document_date || cutoffDate,
      due_date: line.due_date,
      currency_code: undefined,
      fx_rate: 1,
      amount: line.amount,
      base_amount: line.amount,
      account_id: targetAccount.id,
      account_code: targetAccount.code,
      account_name: targetAccount.name,
      counter_account_id: counterAccount.id,
      counter_account_code: counterAccount.code,
      counter_account_name: counterAccount.name,
      debit: definition.targetSide === 'DEBIT' ? line.amount : 0,
      credit: definition.targetSide === 'CREDIT' ? line.amount : 0,
      notes: line.notes?.trim() || undefined,
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
      sync_error: undefined,
    }));

    await db.openingBalanceBatches.put(batch);
    await db.openingBalanceLines.where('batch_id').equals(batchId).delete();
    await db.openingBalanceLines.bulkPut(openingLines);

    await writeActivityLog({
      user: currentUser,
      action: 'OPENING_BALANCE_BATCH_POSTED',
      entity: 'openingBalanceBatches',
      entity_id: batchId,
      description: `${currentUser?.name ?? 'User'} posting saldo awal ${module} per ${cutoffDate.slice(0, 10)}.`,
    });
  });

  if (!batch) {
    throw new Error('Batch saldo awal gagal dibuat.');
  }

  return batch;
};
