import { db } from '@/lib/db';
import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { fixedAssetInputSchema, type FixedAssetInput, type ParsedFixedAssetInput } from '@/lib/validations/fixedAsset';
import {
  calculateDepreciationForPeriod,
  calculateFixedAssetPolicy,
  calculateFixedAssetPosition,
  roundFixedAssetMoney,
  type FixedAssetPostedLine,
} from '@/utils/fixedAssets/calculateDepreciation';
import {
  assertNonCashGeneralLedgerPostingEnabled,
  postNonCashBalancedJournalEntry,
  reverseNonCashJournalEntry,
  type JournalLineDraft,
} from '@/services/generalLedgerService';
import type {
  AccountingPeriod,
  AuthUser,
  ChartOfAccount,
  FixedAsset,
  FixedAssetDepreciationRun,
  FixedAssetDepreciationRunLine,
} from '@/types';
import {
  enqueueFixedAssetRunBundleSync,
  enqueueFixedAssetSync,
} from '@/services/syncQueueService';

export type FixedAssetUpsertInput = FixedAssetInput;

export interface DepreciationRunPreview {
  period: AccountingPeriod;
  lines: FixedAssetDepreciationRunLine[];
  assetCount: number;
  totalDepreciation: number;
}

const LOCKED_AFTER_POST_FIELDS: Array<keyof FixedAsset> = [
  'registration_type', 'acquisition_date', 'available_for_use_date', 'acquisition_cost',
  'residual_value', 'useful_life_months', 'opening_balance_date',
  'opening_accumulated_depreciation', 'opening_remaining_useful_life_months',
];

const normalizeCode = (value: string) => value.trim().toUpperCase();
const normalizeOptionalText = (value: string | undefined) => value?.trim() || undefined;
const actorSnapshot = (actor: AuthUser | null) => ({
  created_by: actor?.id,
  created_by_name: actor?.name,
  updated_by: actor?.id,
  updated_by_name: actor?.name,
});

const scheduleAssetSync = (asset: FixedAsset, operation: 'create' | 'update') => {
  setTimeout(() => { void enqueueFixedAssetSync(asset, operation); }, 0);
};

const scheduleRunSync = (run: FixedAssetDepreciationRun, operation: 'create' | 'update') => {
  setTimeout(() => {
    void db.fixedAssetDepreciationRunLines.where('run_id').equals(run.id).toArray()
      .then((lines) => enqueueFixedAssetRunBundleSync(run, lines, operation));
  }, 0);
};

const requireFixedAssetAccess = async (journal = false) => {
  const actor = await getCurrentSessionUser();
  await requireUserPermission(actor, 'FIXED_ASSET_MANAGE');
  if (journal) await requireUserPermission(actor, 'JOURNAL_MANAGE');
  return actor;
};

const assertAssetCodeAvailable = async (assetCode: string, excludeId?: string) => {
  const normalized = normalizeCode(assetCode);
  const duplicate = (await db.fixedAssets.toArray()).find((asset) => (
    !asset.deleted_at && asset.id !== excludeId && normalizeCode(asset.asset_code) === normalized
  ));
  if (duplicate) throw new Error('Kode aset sudah digunakan.');
};

const getLastClosedPeriod = async () => (await db.accountingPeriods.toArray())
  .filter((period) => !period.deleted_at && period.period_type === 'MONTHLY' && period.status === 'CLOSED')
  .sort((left, right) => right.end_date.localeCompare(left.end_date))[0];

const assertBaselineAfterClosedPeriods = async (
  input: ParsedFixedAssetInput,
  depreciationStartDate: string,
) => {
  const lastClosed = await getLastClosedPeriod();
  if (!lastClosed) return;
  const baselineDate = input.registration_type === 'EXISTING'
    ? input.opening_balance_date
    : undefined;
  if ((baselineDate && baselineDate < lastClosed.end_date) || depreciationStartDate <= lastClosed.end_date) {
    throw new Error(`Baseline aset harus diperbarui sampai akhir periode tertutup terakhir (${lastClosed.end_date}).`);
  }
};

const requireAccount = async (
  id: string,
  expectation: { type: 'ASSET' | 'EXPENSE'; normal: 'DEBIT' | 'CREDIT'; label: string },
) => {
  const account = await db.chartOfAccounts.get(id);
  if (!account) throw new Error(`${expectation.label} tidak ditemukan.`);
  if (!account.is_active || !account.is_postable || account.type !== expectation.type || account.normal_balance !== expectation.normal) {
    throw new Error(`${expectation.label} harus berupa akun ${expectation.type === 'ASSET' ? 'aset' : 'beban'} aktif, postable, dengan normal balance ${expectation.normal === 'CREDIT' ? 'kredit' : 'debit'}.`);
  }
  return account;
};

const resolveReferences = async (input: ParsedFixedAssetInput) => {
  const [assetAccount, accumulatedAccount, expenseAccount, department, project] = await Promise.all([
    requireAccount(input.asset_account_id, { type: 'ASSET', normal: 'DEBIT', label: 'Akun aset tetap' }),
    requireAccount(input.accumulated_depreciation_account_id, { type: 'ASSET', normal: 'CREDIT', label: 'Akun akumulasi penyusutan' }),
    requireAccount(input.depreciation_expense_account_id, { type: 'EXPENSE', normal: 'DEBIT', label: 'Akun beban penyusutan' }),
    input.department_id ? db.departments.get(input.department_id) : undefined,
    input.project_id ? db.projects.get(input.project_id) : undefined,
  ]);
  if (input.department_id && (!department || !department.is_active)) throw new Error('Department tidak ditemukan atau tidak aktif.');
  if (input.project_id && (!project || !project.is_active)) throw new Error('Project tidak ditemukan atau tidak aktif.');
  return { assetAccount, accumulatedAccount, expenseAccount, department, project };
};

const buildAssetFields = async (
  input: ParsedFixedAssetInput,
  options: { skipClosedPeriodBaselineGuard?: boolean } = {},
) => {
  const references = await resolveReferences(input);
  const policy = calculateFixedAssetPolicy(input);
  if (!options.skipClosedPeriodBaselineGuard) {
    await assertBaselineAfterClosedPeriods(input, policy.depreciationStartDate);
  }
  return {
    asset_code: normalizeCode(input.asset_code),
    name: input.name.trim(),
    category: input.category,
    location: normalizeOptionalText(input.location),
    description: normalizeOptionalText(input.description),
    registration_type: input.registration_type,
    acquisition_date: input.acquisition_date,
    available_for_use_date: input.available_for_use_date,
    acquisition_cost: roundFixedAssetMoney(input.acquisition_cost),
    residual_value: roundFixedAssetMoney(input.residual_value),
    useful_life_months: input.useful_life_months,
    depreciation_method: 'STRAIGHT_LINE' as const,
    depreciation_start_date: policy.depreciationStartDate,
    regular_depreciation_amount: policy.regularDepreciationAmount,
    opening_balance_date: input.registration_type === 'EXISTING' ? input.opening_balance_date : undefined,
    opening_accumulated_depreciation: input.registration_type === 'EXISTING'
      ? roundFixedAssetMoney(input.opening_accumulated_depreciation)
      : 0,
    opening_remaining_useful_life_months: input.registration_type === 'EXISTING'
      ? input.opening_remaining_useful_life_months
      : undefined,
    asset_account_id: references.assetAccount.id,
    asset_account_code: references.assetAccount.code,
    asset_account_name: references.assetAccount.name,
    accumulated_depreciation_account_id: references.accumulatedAccount.id,
    accumulated_depreciation_account_code: references.accumulatedAccount.code,
    accumulated_depreciation_account_name: references.accumulatedAccount.name,
    depreciation_expense_account_id: references.expenseAccount.id,
    depreciation_expense_account_code: references.expenseAccount.code,
    depreciation_expense_account_name: references.expenseAccount.name,
    department_id: references.department?.id,
    department_code: references.department?.code,
    department_name: references.department?.name,
    project_id: references.project?.id,
    project_code: references.project?.code,
    project_name: references.project?.name,
    is_active: input.is_active,
  };
};

export const createFixedAsset = async (rawInput: FixedAssetUpsertInput) => {
  const actor = await requireFixedAssetAccess();
  const input = fixedAssetInputSchema.parse(rawInput);
  await assertAssetCodeAvailable(input.asset_code);
  const fields = await buildAssetFields(input);
  const now = new Date().toISOString();
  const asset: FixedAsset = {
    id: crypto.randomUUID(),
    ...fields,
    version: 1,
    ...actorSnapshot(actor),
    created_at: now,
    updated_at: now,
    sync_status: 'pending',
  };

  await db.transaction('rw', [db.fixedAssets, db.activityLogs], async () => {
    await assertAssetCodeAvailable(asset.asset_code);
    await db.fixedAssets.add(asset);
    await writeActivityLog({
      user: actor,
      action: 'FIXED_ASSET_CREATED',
      entity: 'fixedAssets',
      entity_id: asset.id,
      description: `${actor?.name ?? 'User'} membuat aset ${asset.asset_code} - ${asset.name}.`,
    });
  });
  scheduleAssetSync(asset, 'create');
  return asset;
};

const getPostedRunsAndLines = async () => {
  const runs = (await db.fixedAssetDepreciationRuns.toArray())
    .filter((run) => !run.deleted_at && run.status !== 'DRAFT');
  const lines = await db.fixedAssetDepreciationRunLines.toArray();
  const runById = new Map(runs.map((run) => [run.id, run]));
  return lines.flatMap((line): FixedAssetPostedLine[] => {
    const run = runById.get(line.run_id);
    return run ? [{
      asset_id: line.asset_id,
      depreciation_amount: line.depreciation_amount,
      period_id: run.period_id,
      period_end: run.period_end,
      run_status: run.status,
    }] : [];
  });
};

const hasPostedHistory = async (assetId: string) => {
  const lineRunIds = new Set((await db.fixedAssetDepreciationRunLines.where('asset_id').equals(assetId).toArray()).map((line) => line.run_id));
  return (await db.fixedAssetDepreciationRuns.toArray()).some((run) => lineRunIds.has(run.id) && run.status !== 'DRAFT' && !run.deleted_at);
};

export const updateFixedAsset = async (id: string, rawInput: FixedAssetUpsertInput) => {
  const actor = await requireFixedAssetAccess();
  const existing = await db.fixedAssets.get(id);
  if (!existing || existing.deleted_at) throw new Error('Aset tetap tidak ditemukan.');
  const input = fixedAssetInputSchema.parse(rawInput);
  await assertAssetCodeAvailable(input.asset_code, id);
  const postedHistory = await hasPostedHistory(id);
  const fields = await buildAssetFields(input, { skipClosedPeriodBaselineGuard: postedHistory });
  if (postedHistory) {
    const changedLockedField = LOCKED_AFTER_POST_FIELDS.find((field) => existing[field] !== fields[field as keyof typeof fields]);
    if (changedLockedField) throw new Error('Nilai, tanggal, dan kebijakan aset tidak dapat diubah setelah penyusutan diposting.');
    if (existing.is_active !== fields.is_active) throw new Error('Status aktif aset dengan riwayat posted hanya dapat diubah melalui aksi arsip/pulihkan.');
  }
  const now = new Date().toISOString();
  const updated: FixedAsset = {
    ...existing,
    ...fields,
    version: existing.version + 1,
    updated_by: actor?.id,
    updated_by_name: actor?.name,
    updated_at: now,
    sync_status: 'pending',
    sync_error: undefined,
  };
  await db.transaction('rw', [db.fixedAssets, db.activityLogs], async () => {
    await assertAssetCodeAvailable(updated.asset_code, id);
    await db.fixedAssets.put(updated);
    await writeActivityLog({ user: actor, action: 'FIXED_ASSET_UPDATED', entity: 'fixedAssets', entity_id: id, description: `${actor?.name ?? 'User'} memperbarui aset ${updated.asset_code}.` });
  });
  scheduleAssetSync(updated, 'update');
  return updated;
};

export const archiveFixedAsset = async (id: string) => {
  const actor = await requireFixedAssetAccess();
  const asset = await db.fixedAssets.get(id);
  if (!asset || asset.deleted_at) throw new Error('Aset tetap tidak ditemukan.');
  const postedLines = await getPostedRunsAndLines();
  const position = calculateFixedAssetPosition(asset, postedLines, '9999-12-31');
  if (await hasPostedHistory(id) && position.remainingDepreciableAmount > 0) {
    throw new Error('Aset tidak dapat diarsipkan karena masih mempunyai nilai yang harus disusutkan.');
  }
  const updated = { ...asset, is_active: false, version: asset.version + 1, updated_by: actor?.id, updated_by_name: actor?.name, updated_at: new Date().toISOString(), sync_status: 'pending' as const, sync_error: undefined };
  await db.transaction('rw', [db.fixedAssets, db.activityLogs], async () => {
    await db.fixedAssets.put(updated);
    await writeActivityLog({ user: actor, action: 'FIXED_ASSET_ARCHIVED', entity: 'fixedAssets', entity_id: id, description: `${actor?.name ?? 'User'} mengarsipkan aset ${asset.asset_code}.` });
  });
  scheduleAssetSync(updated, 'update');
  return updated;
};

export const restoreFixedAsset = async (id: string) => {
  const actor = await requireFixedAssetAccess();
  const asset = await db.fixedAssets.get(id);
  if (!asset || asset.deleted_at) throw new Error('Aset tetap tidak ditemukan.');
  const lastClosed = await getLastClosedPeriod();
  if (!(await hasPostedHistory(id)) && lastClosed && asset.depreciation_start_date <= lastClosed.end_date) {
    throw new Error(`Aset tidak dapat dipulihkan karena akan menciptakan penyusutan pada periode CLOSED sampai ${lastClosed.end_date}. Perbarui sebagai aset lama.`);
  }
  const updated = { ...asset, is_active: true, version: asset.version + 1, updated_by: actor?.id, updated_by_name: actor?.name, updated_at: new Date().toISOString(), sync_status: 'pending' as const, sync_error: undefined };
  await db.transaction('rw', [db.fixedAssets, db.activityLogs], async () => {
    await db.fixedAssets.put(updated);
    await writeActivityLog({ user: actor, action: 'FIXED_ASSET_RESTORED', entity: 'fixedAssets', entity_id: id, description: `${actor?.name ?? 'User'} memulihkan aset ${asset.asset_code}.` });
  });
  scheduleAssetSync(updated, 'update');
  return updated;
};

const getPeriod = async (periodId: string) => {
  const period = await db.accountingPeriods.get(periodId);
  if (!period || period.deleted_at) throw new Error('Periode akuntansi tidak ditemukan.');
  if (period.period_type !== 'MONTHLY' || period.status !== 'OPEN') throw new Error('Draft hanya dapat dibuat untuk periode bulanan berstatus OPEN.');
  return period;
};

const previewLinesForPeriod = async (period: AccountingPeriod) => {
  const [assets, postedLines] = await Promise.all([
    db.fixedAssets.filter((asset) => !asset.deleted_at && asset.is_active).toArray(),
    getPostedRunsAndLines(),
  ]);
  const now = new Date().toISOString();
  return assets.sort((left, right) => left.asset_code.localeCompare(right.asset_code)).flatMap((asset): FixedAssetDepreciationRunLine[] => {
    const calculation = calculateDepreciationForPeriod(asset, postedLines, period);
    if (!calculation.eligible) return [];
    return [{
      id: crypto.randomUUID(),
      run_id: '',
      asset_id: asset.id,
      asset_code: asset.asset_code,
      asset_name: asset.name,
      asset_category: asset.category,
      acquisition_cost: asset.acquisition_cost,
      residual_value: asset.residual_value,
      regular_depreciation_amount: asset.regular_depreciation_amount,
      opening_accumulated_depreciation: calculation.openingAccumulatedDepreciation,
      opening_book_value: calculation.openingBookValue,
      depreciation_amount: calculation.depreciationAmount,
      closing_accumulated_depreciation: calculation.closingAccumulatedDepreciation,
      closing_book_value: calculation.closingBookValue,
      asset_account_id: asset.asset_account_id,
      asset_account_code: asset.asset_account_code,
      asset_account_name: asset.asset_account_name,
      accumulated_depreciation_account_id: asset.accumulated_depreciation_account_id,
      accumulated_depreciation_account_code: asset.accumulated_depreciation_account_code,
      accumulated_depreciation_account_name: asset.accumulated_depreciation_account_name,
      depreciation_expense_account_id: asset.depreciation_expense_account_id,
      depreciation_expense_account_code: asset.depreciation_expense_account_code,
      depreciation_expense_account_name: asset.depreciation_expense_account_name,
      department_id: asset.department_id,
      department_code: asset.department_code,
      department_name: asset.department_name,
      project_id: asset.project_id,
      project_code: asset.project_code,
      project_name: asset.project_name,
      created_at: now,
    }];
  });
};

const assertEarliestOutstandingPeriod = async (selected: AccountingPeriod) => {
  const periods = (await db.accountingPeriods.toArray())
    .filter((period) => !period.deleted_at && period.period_type === 'MONTHLY' && period.status !== 'CLOSED' && period.end_date <= selected.end_date)
    .sort((left, right) => left.end_date.localeCompare(right.end_date));
  for (const period of periods) {
    const lines = await previewLinesForPeriod(period);
    if (lines.length > 0 && period.id !== selected.id) {
      throw new Error(`Posting harus dimulai dari periode penyusutan tertunggak paling awal (${period.name}).`);
    }
    if (lines.length > 0) break;
  }
};

export const previewDepreciationRun = async (periodId: string): Promise<DepreciationRunPreview> => {
  await requireFixedAssetAccess();
  const period = await getPeriod(periodId);
  await assertEarliestOutstandingPeriod(period);
  const lines = await previewLinesForPeriod(period);
  return {
    period,
    lines,
    assetCount: lines.length,
    totalDepreciation: roundFixedAssetMoney(lines.reduce((sum, line) => sum + line.depreciation_amount, 0)),
  };
};

const assertNoActiveRunForPeriod = async (periodId: string, excludeId?: string) => {
  const active = (await db.fixedAssetDepreciationRuns.where('period_id').equals(periodId).toArray())
    .find((run) => run.id !== excludeId && !run.deleted_at && (run.status === 'DRAFT' || run.status === 'POSTED'));
  if (active) throw new Error('Periode ini sudah mempunyai draft atau run posted aktif.');
};

const createRunNumber = async (periodEnd: string) => {
  const key = periodEnd.slice(0, 7).replace('-', '');
  const prefix = `DEP-${key}-`;
  const count = await db.fixedAssetDepreciationRuns.where('run_number').startsWith(prefix).count();
  return `${prefix}${String(count + 1).padStart(4, '0')}`;
};

export const createDepreciationRunDraft = async (periodId: string, notes?: string) => {
  const actor = await requireFixedAssetAccess();
  const preview = await previewDepreciationRun(periodId);
  if (preview.lines.length === 0) throw new Error('Tidak ada aset eligible untuk periode ini.');
  const now = new Date().toISOString();
  let run!: FixedAssetDepreciationRun;
  await db.transaction('rw', [db.fixedAssetDepreciationRuns, db.fixedAssetDepreciationRunLines, db.activityLogs], async () => {
    await assertNoActiveRunForPeriod(periodId);
    run = {
      id: crypto.randomUUID(),
      run_number: await createRunNumber(preview.period.end_date),
      period_id: preview.period.id,
      period_name: preview.period.name,
      period_start: preview.period.start_date,
      period_end: preview.period.end_date,
      posting_date: preview.period.end_date,
      status: 'DRAFT',
      asset_count: preview.assetCount,
      total_depreciation: preview.totalDepreciation,
      notes: normalizeOptionalText(notes),
      version: 1,
      created_by: actor?.id,
      created_by_name: actor?.name,
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
    };
    const lines = preview.lines.map((line) => ({ ...line, id: crypto.randomUUID(), run_id: run.id, created_at: now }));
    await db.fixedAssetDepreciationRuns.add(run);
    await db.fixedAssetDepreciationRunLines.bulkAdd(lines);
    await writeActivityLog({ user: actor, action: 'FIXED_ASSET_DEPRECIATION_DRAFT_CREATED', entity: 'fixedAssetDepreciationRuns', entity_id: run.id, description: `${actor?.name ?? 'User'} membuat draft ${run.run_number}.` });
  });
  scheduleRunSync(run, 'create');
  return run;
};

export const deleteDepreciationRunDraft = async (runId: string) => {
  const actor = await requireFixedAssetAccess();
  const run = await db.fixedAssetDepreciationRuns.get(runId);
  if (!run || run.deleted_at) throw new Error('Run penyusutan tidak ditemukan.');
  if (run.status !== 'DRAFT') throw new Error('Hanya draft yang dapat dihapus.');
  const now = new Date().toISOString();
  const deleted = { ...run, deleted_at: now, updated_at: now, version: run.version + 1, sync_status: 'pending' as const };
  await db.transaction('rw', [db.fixedAssetDepreciationRuns, db.activityLogs], async () => {
    await db.fixedAssetDepreciationRuns.put(deleted);
    await writeActivityLog({ user: actor, action: 'FIXED_ASSET_DEPRECIATION_DRAFT_DELETED', entity: 'fixedAssetDepreciationRuns', entity_id: run.id, description: `${actor?.name ?? 'User'} menghapus draft ${run.run_number}.` });
  });
  scheduleRunSync(deleted, 'update');
  return deleted;
};

const lineSignature = (lines: FixedAssetDepreciationRunLine[]) => lines
  .map((line) => [
    line.asset_id, line.depreciation_amount, line.opening_accumulated_depreciation,
    line.closing_accumulated_depreciation, line.asset_account_id,
    line.accumulated_depreciation_account_id, line.depreciation_expense_account_id,
    line.department_id ?? '', line.project_id ?? '',
  ].join(':'))
  .sort()
  .join('|');

const groupJournalLines = async (lines: FixedAssetDepreciationRunLine[]) => {
  const accounts = new Map((await db.chartOfAccounts.toArray()).map((account) => [account.id, account]));
  const groups = new Map<string, { expense: ChartOfAccount; accumulated: ChartOfAccount; amount: number; departmentId?: string; projectId?: string }>();
  for (const line of lines) {
    const assetAccount = accounts.get(line.asset_account_id);
    const expense = accounts.get(line.depreciation_expense_account_id);
    const accumulated = accounts.get(line.accumulated_depreciation_account_id);
    if (!assetAccount || assetAccount.type !== 'ASSET' || assetAccount.normal_balance !== 'DEBIT' || !assetAccount.is_active || !assetAccount.is_postable) {
      throw new Error('Akun aset tetap pada draft tidak lagi valid.');
    }
    if (!expense || expense.type !== 'EXPENSE' || expense.normal_balance !== 'DEBIT' || !expense.is_active || !expense.is_postable) {
      throw new Error('Akun beban penyusutan pada draft tidak lagi valid.');
    }
    if (!accumulated || accumulated.type !== 'ASSET' || accumulated.normal_balance !== 'CREDIT' || !accumulated.is_active || !accumulated.is_postable) {
      throw new Error('Akun akumulasi penyusutan harus berupa akun aset aktif, postable, dengan normal balance kredit.');
    }
    const key = [expense.id, accumulated.id, line.department_id ?? '', line.project_id ?? ''].join(':');
    const current = groups.get(key);
    groups.set(key, {
      expense,
      accumulated,
      amount: roundFixedAssetMoney((current?.amount ?? 0) + line.depreciation_amount),
      departmentId: line.department_id,
      projectId: line.project_id,
    });
  }
  return [...groups.values()].flatMap((group): JournalLineDraft[] => [{
    account: group.expense, debit: group.amount, credit: 0,
    description: 'Beban penyusutan aset tetap', department_id: group.departmentId, project_id: group.projectId,
  }, {
    account: group.accumulated, debit: 0, credit: group.amount,
    description: 'Akumulasi penyusutan aset tetap', department_id: group.departmentId, project_id: group.projectId,
  }]);
};

export const postDepreciationRun = async (runId: string) => {
  const actor = await requireFixedAssetAccess(true);
  const initialRun = await db.fixedAssetDepreciationRuns.get(runId);
  if (!initialRun || initialRun.deleted_at) throw new Error('Run penyusutan tidak ditemukan.');
  if (initialRun.status === 'POSTED') return initialRun;
  if (initialRun.status !== 'DRAFT') throw new Error('Hanya draft yang dapat diposting.');
  await assertNonCashGeneralLedgerPostingEnabled(initialRun.posting_date);
  let postedRun!: FixedAssetDepreciationRun;
  await db.transaction('rw', [
    db.fixedAssets, db.fixedAssetDepreciationRuns, db.fixedAssetDepreciationRunLines,
    db.journalEntries, db.journalEntryLines, db.activityLogs, db.chartOfAccounts,
    db.accountingPeriods, db.enabledModules, db.generalLedgerSetting,
  ], async () => {
    const run = await db.fixedAssetDepreciationRuns.get(runId);
    if (!run || run.status !== 'DRAFT' || run.deleted_at) throw new Error('Draft tidak lagi tersedia untuk diposting.');
    const period = await getPeriod(run.period_id);
    await assertNoActiveRunForPeriod(run.period_id, run.id);
    const storedLines = await db.fixedAssetDepreciationRunLines.where('run_id').equals(run.id).toArray();
    const recalculated = await previewLinesForPeriod(period);
    const recalculatedTotal = roundFixedAssetMoney(recalculated.reduce((sum, line) => sum + line.depreciation_amount, 0));
    if (lineSignature(storedLines) !== lineSignature(recalculated) || run.total_depreciation !== recalculatedTotal || run.asset_count !== storedLines.length) {
      throw new Error('Draft berubah sejak dibuat. Hapus dan buat ulang draft sebelum posting.');
    }
    const journalLines = await groupJournalLines(storedLines);
    const journal = await postNonCashBalancedJournalEntry({
      source_type: 'FIXED_ASSET_DEPRECIATION',
      source_id: run.id,
      source_number: run.run_number,
      source_event: 'DEPRECIATION_RUN_POSTED',
      entry_date: period.end_date,
      description: `Penyusutan aset periode ${period.name}`,
      lines: journalLines,
      actor,
    });
    const now = new Date().toISOString();
    postedRun = {
      ...run,
      status: 'POSTED',
      journal_entry_id: journal.id,
      posted_at: now,
      posted_by: actor?.id,
      posted_by_name: actor?.name,
      updated_at: now,
      version: run.version + 1,
      sync_status: 'pending',
      sync_error: undefined,
    };
    await db.fixedAssetDepreciationRuns.put(postedRun);
    await writeActivityLog({ user: actor, action: 'FIXED_ASSET_DEPRECIATION_POSTED', entity: 'fixedAssetDepreciationRuns', entity_id: run.id, description: `${actor?.name ?? 'User'} memposting ${run.run_number}.` });
  });
  scheduleRunSync(postedRun, 'update');
  return postedRun;
};

export const reverseDepreciationRun = async (runId: string, rawReason: string) => {
  const actor = await requireFixedAssetAccess(true);
  const initialRun = await db.fixedAssetDepreciationRuns.get(runId);
  if (initialRun?.status === 'REVERSED' && !initialRun.deleted_at) return initialRun;
  const reason = rawReason.trim();
  if (!reason) throw new Error('Alasan reversal wajib diisi.');
  if (!initialRun || initialRun.deleted_at || initialRun.status !== 'POSTED' || !initialRun.journal_entry_id) throw new Error('Hanya run posted yang dapat dibalik.');
  await assertNonCashGeneralLedgerPostingEnabled(initialRun.posting_date);
  let reversedRun!: FixedAssetDepreciationRun;
  await db.transaction('rw', [
    db.fixedAssetDepreciationRuns, db.journalEntries, db.journalEntryLines, db.activityLogs,
    db.accountingPeriods, db.enabledModules, db.generalLedgerSetting,
  ], async () => {
    const run = await db.fixedAssetDepreciationRuns.get(runId);
    const postedRuns = (await db.fixedAssetDepreciationRuns.toArray())
      .filter((item) => !item.deleted_at && item.status === 'POSTED')
      .sort((left, right) => right.period_end.localeCompare(left.period_end) || right.created_at.localeCompare(left.created_at));
    if (!run || postedRuns[0]?.id !== run.id) throw new Error('Run ini bukan run posted terakhir dan tidak dapat dibalik.');
    await getPeriod(run.period_id);
    const reversal = await reverseNonCashJournalEntry({
      entryId: run.journal_entry_id!, reason, entryDate: run.posting_date,
      sourceEvent: 'DEPRECIATION_RUN_REVERSED', actor,
    });
    const now = new Date().toISOString();
    reversedRun = {
      ...run,
      status: 'REVERSED',
      reversal_journal_entry_id: reversal.id,
      reversal_reason: reason,
      reversed_at: now,
      reversed_by: actor?.id,
      reversed_by_name: actor?.name,
      updated_at: now,
      version: run.version + 1,
      sync_status: 'pending',
      sync_error: undefined,
    };
    await db.fixedAssetDepreciationRuns.put(reversedRun);
    await writeActivityLog({ user: actor, action: 'FIXED_ASSET_DEPRECIATION_REVERSED', entity: 'fixedAssetDepreciationRuns', entity_id: run.id, description: `${actor?.name ?? 'User'} membalik ${run.run_number}: ${reason}` });
  });
  scheduleRunSync(reversedRun, 'update');
  return reversedRun;
};

export const getFixedAssetPostedLines = getPostedRunsAndLines;

export const ensureFixedAssetAccountDefaults = async () => {
  const accounts = await db.chartOfAccounts.toArray();
  const now = new Date().toISOString();
  const corrections = accounts.filter((account) => (
    account.is_system &&
    account.normal_balance === 'DEBIT' &&
    (
      account.id === 'accumulated-depreciation' ||
      account.id === 'template-accumulated-depreciation' ||
      /akumulasi penyusutan|accumulated depreciation/i.test(account.name)
    )
  )).map((account) => ({
    ...account,
    normal_balance: 'CREDIT' as const,
    updated_at: now,
    sync_status: 'pending' as const,
    sync_error: undefined,
  }));
  if (corrections.length > 0) await db.chartOfAccounts.bulkPut(corrections);
};
