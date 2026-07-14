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
  ids: ['owner-capital', 'retained-earning', 'template-retained-earning', 'simpanan-pokok-modal'],
  codes: ['3000', '3010', '3100'],
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
  now,
}: {
  setting?: GeneralLedgerSetting;
  cutoffDate: string;
  inventoryPolicy: InventoryAccountingPolicy;
  now: string;
}): GeneralLedgerSetting => ({
  id: 'default',
  is_ready: true,
  cutoff_date: cutoffDate,
  inventory_policy: inventoryPolicy,
  opening_balance_journal_id: setting?.opening_balance_journal_id,
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
