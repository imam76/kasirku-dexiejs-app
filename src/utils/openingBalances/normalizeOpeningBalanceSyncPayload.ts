import type {
  RemoteOpeningBalanceBatchDto,
  RemoteOpeningBalanceBundleDto,
  RemoteOpeningBalanceLineDto,
} from '@/services/postgresAdapter';
import {
  toCanonicalIsoTimestamp,
  toCanonicalOptionalIsoTimestamp,
} from '@/utils/timestamps';

const normalizeRequiredTimestamp = (value: string, field: string) => {
  if (!value?.trim()) {
    throw new Error(`Timestamp wajib ${field} pada payload saldo awal kosong.`);
  }

  try {
    return toCanonicalIsoTimestamp(value);
  } catch {
    throw new Error(`Timestamp ${field} pada payload saldo awal tidak valid: ${value}`);
  }
};

const normalizeOptionalTimestamp = (value: string | null | undefined, field: string) => {
  if (!value?.trim()) return null;

  try {
    return toCanonicalOptionalIsoTimestamp(value) ?? null;
  } catch {
    throw new Error(`Timestamp ${field} pada payload saldo awal tidak valid: ${value}`);
  }
};

const normalizeBatch = (
  batch: RemoteOpeningBalanceBatchDto,
): RemoteOpeningBalanceBatchDto => ({
  ...batch,
  cutoff_date: normalizeRequiredTimestamp(batch.cutoff_date, 'batch.cutoff_date'),
  accounting_start_date: normalizeOptionalTimestamp(
    batch.accounting_start_date,
    'batch.accounting_start_date',
  ),
  posted_at: normalizeOptionalTimestamp(batch.posted_at, 'batch.posted_at'),
  locked_at: normalizeOptionalTimestamp(batch.locked_at, 'batch.locked_at'),
  reversed_at: normalizeOptionalTimestamp(batch.reversed_at, 'batch.reversed_at'),
  skipped_at: normalizeOptionalTimestamp(batch.skipped_at, 'batch.skipped_at'),
  validated_at: normalizeOptionalTimestamp(batch.validated_at, 'batch.validated_at'),
  created_at: normalizeRequiredTimestamp(batch.created_at, 'batch.created_at'),
  updated_at: normalizeRequiredTimestamp(batch.updated_at, 'batch.updated_at'),
  deleted_at: normalizeOptionalTimestamp(batch.deleted_at, 'batch.deleted_at'),
});

const normalizeLine = (
  line: RemoteOpeningBalanceLineDto,
): RemoteOpeningBalanceLineDto => ({
  ...line,
  document_date: normalizeOptionalTimestamp(line.document_date, `${line.id}.document_date`),
  due_date: normalizeOptionalTimestamp(line.due_date, `${line.id}.due_date`),
  last_paid_at: normalizeOptionalTimestamp(line.last_paid_at, `${line.id}.last_paid_at`),
  created_at: normalizeRequiredTimestamp(line.created_at, `${line.id}.created_at`),
  updated_at: normalizeRequiredTimestamp(line.updated_at, `${line.id}.updated_at`),
});

/**
 * Queue Dexie dapat bertahan melewati update aplikasi. Normalisasi ini membuat
 * payload saldo awal versi lama (terutama optional timestamp berupa string
 * kosong atau tanggal tanpa jam) tetap dapat dibaca oleh command Rust.
 */
export const normalizeOpeningBalanceSyncPayload = (
  payload: RemoteOpeningBalanceBundleDto,
): RemoteOpeningBalanceBundleDto => ({
  batch: normalizeBatch(payload.batch),
  lines: payload.lines.map(normalizeLine),
});
