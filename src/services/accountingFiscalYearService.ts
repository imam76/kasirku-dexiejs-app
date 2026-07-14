import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import type { AccountingFiscalYear, AuthUser } from '@/types';

type FiscalYearActor = Pick<AuthUser, 'id' | 'name'> | null | undefined;

export interface FindOrCreateFiscalYearInput {
  fiscalStart: string;
  fiscalEnd: string;
  now: string;
  actorId?: string;
  actorName?: string;
  notes?: string;
}

const toDateOnly = (value: string) => value.slice(0, 10);

const rangesOverlap = (
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
) => toDateOnly(aStart) <= toDateOnly(bEnd) && toDateOnly(bStart) <= toDateOnly(aEnd);

export const buildFiscalYearName = (startDate: string, endDate: string) => {
  const startYear = toDateOnly(startDate).slice(0, 4);
  const endYear = toDateOnly(endDate).slice(0, 4);
  return startYear === endYear
    ? `Tahun Fiskal ${startYear}`
    : `Tahun Fiskal ${startYear}-${endYear}`;
};

export const findOrCreateAccountingFiscalYear = async (
  input: FindOrCreateFiscalYearInput,
) => {
  const fiscalStart = toDateOnly(input.fiscalStart);
  const fiscalEnd = toDateOnly(input.fiscalEnd);
  const fiscalYears = await db.accountingFiscalYears.toArray();
  const activeFiscalYears = fiscalYears.filter((fiscalYear) => !fiscalYear.deleted_at);
  const exactFiscalYear = activeFiscalYears.find((fiscalYear) => (
    toDateOnly(fiscalYear.start_date) === fiscalStart &&
    toDateOnly(fiscalYear.end_date) === fiscalEnd
  ));
  const overlappingFiscalYear = activeFiscalYears.find((fiscalYear) => (
    fiscalYear.id !== exactFiscalYear?.id &&
    rangesOverlap(fiscalStart, fiscalEnd, fiscalYear.start_date, fiscalYear.end_date)
  ));

  if (overlappingFiscalYear) {
    throw new Error(
      `Tahun fiskal tumpang tindih dengan "${overlappingFiscalYear.name}" (${toDateOnly(overlappingFiscalYear.start_date)} s/d ${toDateOnly(overlappingFiscalYear.end_date)}).`,
    );
  }

  if (exactFiscalYear) {
    return {
      fiscalYear: exactFiscalYear,
      operation: undefined,
    };
  }

  const fiscalYear: AccountingFiscalYear = {
    id: `fiscal-year-${fiscalStart}-${fiscalEnd}`,
    name: buildFiscalYearName(fiscalStart, fiscalEnd),
    start_date: fiscalStart,
    end_date: fiscalEnd,
    status: 'OPEN',
    notes: input.notes,
    version: 1,
    created_by: input.actorId,
    created_by_name: input.actorName,
    updated_by: input.actorId,
    updated_by_name: input.actorName,
    created_at: input.now,
    updated_at: input.now,
    sync_status: 'pending',
    sync_error: undefined,
  };

  await db.accountingFiscalYears.add(fiscalYear);
  return {
    fiscalYear,
    operation: 'create' as const,
  };
};

export const buildNextFiscalYearRange = (fiscalYear: Pick<AccountingFiscalYear, 'start_date' | 'end_date'>) => {
  const start = dayjs(toDateOnly(fiscalYear.start_date));
  const end = dayjs(toDateOnly(fiscalYear.end_date));
  const nextStart = end.add(1, 'day');
  const inclusiveDays = end.diff(start, 'day');
  const nextEnd = nextStart.add(inclusiveDays, 'day');

  return {
    start: nextStart.format('YYYY-MM-DD'),
    end: nextEnd.format('YYYY-MM-DD'),
  };
};

export const bumpFiscalYearSync = (
  fiscalYear: AccountingFiscalYear,
  actor: FiscalYearActor,
  updatedAt: string,
): AccountingFiscalYear => ({
  ...fiscalYear,
  version: Math.max(1, Number(fiscalYear.version || 1)) + 1,
  updated_by: actor?.id ?? fiscalYear.updated_by,
  updated_by_name: actor?.name ?? fiscalYear.updated_by_name,
  updated_at: updatedAt,
  sync_status: 'pending',
  sync_error: undefined,
});
