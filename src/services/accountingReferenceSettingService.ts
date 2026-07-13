import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import { enqueueAccountingPeriodSync, enqueueGeneralLedgerSettingSync } from '@/services/syncQueueService';
import type { AccountingPeriod, GeneralLedgerSetting, InventoryAccountingPolicy } from '@/types';

export interface SaveAccountingReferenceSettingInput {
  cutoff_date: string;
  inventory_policy: InventoryAccountingPolicy;
  period_start: string;
  period_end: string;
}

export interface SaveAccountingReferenceSettingResult {
  generalLedgerSetting: GeneralLedgerSetting;
  accountingPeriod: AccountingPeriod;
  createdPeriod: boolean;
}

const toDateOnly = (value: string) => value.slice(0, 10);

const normalizeDateOnly = (value: string) => {
  const date = dayjs(toDateOnly(value));
  if (!date.isValid()) {
    throw new Error('Tanggal akuntansi tidak valid.');
  }
  return date.format('YYYY-MM-DD');
};

const normalizeStartOfDay = (value: string) => `${normalizeDateOnly(value)}T00:00:00.000`;

const rangesOverlap = (
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
) => aStart <= bEnd && bStart <= aEnd;

const buildPeriodName = (startDate: string, endDate: string) => {
  const startYear = startDate.slice(0, 4);
  const endYear = endDate.slice(0, 4);
  return startYear === endYear
    ? `Tahun Buku ${startYear}`
    : `Tahun Buku ${startYear}-${endYear}`;
};

export const saveAccountingReferenceSetting = async (
  input: SaveAccountingReferenceSettingInput,
): Promise<SaveAccountingReferenceSettingResult> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'ACCOUNTING_PERIOD_MANAGE');

  const cutoffDate = normalizeStartOfDay(input.cutoff_date);
  const periodStart = normalizeDateOnly(input.period_start);
  const periodEnd = normalizeDateOnly(input.period_end);

  if (periodEnd < periodStart) {
    throw new Error('Tanggal akhir periode tidak boleh sebelum tanggal awal.');
  }

  const now = new Date().toISOString();
  let updatedGeneralLedger!: GeneralLedgerSetting;
  let referencePeriod!: AccountingPeriod;
  let createdPeriod = false;

  await db.transaction('rw', [
    db.generalLedgerSetting,
    db.accountingPeriods,
    db.activityLogs,
  ], async () => {
    const setting = await db.generalLedgerSetting.get('default');
    const openingBalancePosted = Boolean(setting?.opening_balance_journal_id);

    if (
      openingBalancePosted &&
      setting?.cutoff_date &&
      toDateOnly(setting.cutoff_date) !== toDateOnly(cutoffDate)
    ) {
      throw new Error('Cutoff sudah dipakai opening balance. Cutoff tidak bisa diubah dari Settings.');
    }

    if (
      openingBalancePosted &&
      setting?.inventory_policy &&
      setting.inventory_policy !== input.inventory_policy
    ) {
      throw new Error('Policy persediaan sudah dipakai opening balance. Policy tidak bisa diubah dari Settings.');
    }

    updatedGeneralLedger = {
      id: 'default',
      is_ready: setting?.is_ready ?? false,
      cutoff_date: cutoffDate,
      inventory_policy: input.inventory_policy,
      opening_balance_journal_id: setting?.opening_balance_journal_id,
      activated_at: setting?.activated_at,
      created_at: setting?.created_at ?? now,
      updated_at: now,
      sync_status: 'pending',
      sync_error: undefined,
    };

    const periods = await db.accountingPeriods.toArray();
    const activePeriods = periods.filter((period) => !period.deleted_at);
    const exactPeriod = activePeriods.find((period) => (
      toDateOnly(period.start_date) === periodStart &&
      toDateOnly(period.end_date) === periodEnd &&
      period.period_type === 'YEARLY'
    ));
    const overlappingPeriod = activePeriods.find((period) => (
      period.id !== exactPeriod?.id &&
      rangesOverlap(periodStart, periodEnd, toDateOnly(period.start_date), toDateOnly(period.end_date))
    ));

    if (overlappingPeriod) {
      throw new Error(
        `Periode rujukan tumpang tindih dengan "${overlappingPeriod.name}" (${toDateOnly(overlappingPeriod.start_date)} s/d ${toDateOnly(overlappingPeriod.end_date)}).`,
      );
    }

    if (exactPeriod) {
      referencePeriod = exactPeriod;
    } else {
      referencePeriod = {
        id: crypto.randomUUID(),
        name: buildPeriodName(periodStart, periodEnd),
        period_type: 'YEARLY',
        start_date: periodStart,
        end_date: periodEnd,
        status: 'OPEN',
        notes: 'Periode rujukan dibuat dari Settings Akuntansi.',
        version: 1,
        created_by: currentUser?.id,
        created_by_name: currentUser?.name,
        updated_by: currentUser?.id,
        updated_by_name: currentUser?.name,
        created_at: now,
        updated_at: now,
        sync_status: 'pending',
        sync_error: undefined,
      };
      createdPeriod = true;
      await db.accountingPeriods.add(referencePeriod);
    }

    await db.generalLedgerSetting.put(updatedGeneralLedger);
    await writeActivityLog({
      user: currentUser,
      action: 'ACCOUNTING_REFERENCE_SETTING_UPDATED',
      entity: 'generalLedgerSetting',
      entity_id: 'default',
      description: `${currentUser?.name ?? 'User'} menyimpan rujukan tanggal akuntansi cutoff ${toDateOnly(cutoffDate)} dan periode ${periodStart} s/d ${periodEnd}.`,
    });
  });

  await enqueueGeneralLedgerSettingSync(updatedGeneralLedger, 'update');
  if (createdPeriod) {
    await enqueueAccountingPeriodSync(referencePeriod, 'create');
  }

  return {
    generalLedgerSetting: updatedGeneralLedger,
    accountingPeriod: referencePeriod,
    createdPeriod,
  };
};
