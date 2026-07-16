import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import { paymentMethodSchema } from '@/lib/validations/paymentMethod';
import { buildDefaultPaymentMethods } from '@/lib/database/seeds';
import { enqueuePaymentMethodSync } from '@/services/syncQueueService';
import type { ChartOfAccount, PaymentMethodCategory, PaymentMethodMaster } from '@/types';

export interface PaymentMethodUpsertInput {
  code: string;
  name: string;
  category: PaymentMethodCategory;
  posting_account_id?: string;
  requires_reference?: boolean;
  is_active?: boolean;
  sort_order?: number;
}

type SanitizedPaymentMethodInput = {
  code: string;
  name: string;
  category: PaymentMethodCategory;
  posting_account_id?: string;
  requires_reference: boolean;
  is_active: boolean;
  sort_order: number;
};

const sanitizePaymentMethodInput = (input: PaymentMethodUpsertInput): SanitizedPaymentMethodInput => {
  const parsed = paymentMethodSchema.parse(input);
  return {
    code: parsed.code,
    name: parsed.name,
    category: parsed.category,
    posting_account_id: parsed.posting_account_id,
    requires_reference: parsed.requires_reference ?? false,
    is_active: parsed.is_active ?? true,
    sort_order: parsed.sort_order ?? 0,
  };
};

const ensureUniquePaymentMethodCode = async (code: string, ignoredId?: string) => {
  const normalizedCode = code.trim().toUpperCase();
  const duplicate = await db.paymentMethods
    .filter((method) => method.id !== ignoredId && method.code.trim().toUpperCase() === normalizedCode)
    .first();
  if (duplicate) {
    throw new Error('Kode metode pembayaran sudah digunakan.');
  }
};

const resolvePostingAccountSnapshot = async (
  postingAccountId: string | undefined,
  isActive: boolean,
): Promise<Pick<PaymentMethodMaster, 'posting_account_id' | 'posting_account_code' | 'posting_account_name'>> => {
  if (!postingAccountId) {
    if (isActive) {
      throw new Error('Akun penerimaan/clearing wajib dipilih untuk metode aktif.');
    }
    return {};
  }

  const account = await db.chartOfAccounts.get(postingAccountId);
  if (!account) {
    throw new Error('Akun penerimaan/clearing tidak ditemukan.');
  }
  validatePostingAccount(account);

  return {
    posting_account_id: account.id,
    posting_account_code: account.code,
    posting_account_name: account.name,
  };
};

const validatePostingAccount = (account: ChartOfAccount) => {
  if (account.type !== 'ASSET' || !account.is_active || !account.is_postable) {
    throw new Error('Akun penerimaan/clearing harus bertipe aset, aktif, dan postable.');
  }
};

const withPendingSync = (method: PaymentMethodMaster): PaymentMethodMaster => ({
  ...method,
  sync_status: 'pending',
  sync_error: undefined,
});

export const ensureDefaultPaymentMethods = async () => {
  const existing = await db.paymentMethods.toArray();
  const existingIds = new Set(existing.map((method) => method.id));
  const existingCodes = new Set(existing.map((method) => method.code.toUpperCase()));
  const defaults = buildDefaultPaymentMethods(
    await db.chartOfAccounts.toArray(),
    new Date().toISOString(),
  ).filter((method) => !existingIds.has(method.id) && !existingCodes.has(method.code));
  if (defaults.length > 0) {
    await db.paymentMethods.bulkPut(defaults);
    await Promise.all(defaults.map((method) => enqueuePaymentMethodSync(method, 'create')));
  }

  return defaults;
};

export const createPaymentMethod = async (
  input: PaymentMethodUpsertInput,
): Promise<PaymentMethodMaster> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'PAYMENT_METHOD_MANAGE');
  const sanitized = sanitizePaymentMethodInput(input);
  await ensureUniquePaymentMethodCode(sanitized.code);
  const accountSnapshot = await resolvePostingAccountSnapshot(
    sanitized.posting_account_id,
    sanitized.is_active,
  );
  const now = new Date().toISOString();
  const method = withPendingSync({
    id: crypto.randomUUID(),
    ...sanitized,
    ...accountSnapshot,
    is_system: false,
    created_at: now,
    updated_at: now,
  });

  await db.paymentMethods.add(method);
  await writeActivityLog({
    user: currentUser,
    action: 'PAYMENT_METHOD_CREATED',
    entity: 'paymentMethods',
    entity_id: method.id,
    description: `${currentUser?.name ?? 'User'} membuat metode pembayaran ${method.name}.`,
  });
  await enqueuePaymentMethodSync(method, 'create');
  return method;
};

export const updatePaymentMethod = async (
  id: string,
  input: PaymentMethodUpsertInput,
): Promise<PaymentMethodMaster> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'PAYMENT_METHOD_MANAGE');
  const existing = await db.paymentMethods.get(id);
  if (!existing) {
    throw new Error('Metode pembayaran tidak ditemukan.');
  }

  const sanitized = sanitizePaymentMethodInput(input);
  if (existing.is_system && sanitized.code !== existing.code) {
    throw new Error('Kode metode pembayaran sistem tidak dapat diubah.');
  }
  await ensureUniquePaymentMethodCode(sanitized.code, id);
  const accountSnapshot = await resolvePostingAccountSnapshot(
    sanitized.posting_account_id,
    sanitized.is_active,
  );
  const updated = withPendingSync({
    ...existing,
    ...sanitized,
    ...accountSnapshot,
    code: existing.is_system ? existing.code : sanitized.code,
    updated_at: new Date().toISOString(),
  });

  if (!sanitized.posting_account_id) {
    updated.posting_account_id = undefined;
    updated.posting_account_code = undefined;
    updated.posting_account_name = undefined;
  }

  await db.paymentMethods.put(updated);
  await writeActivityLog({
    user: currentUser,
    action: 'PAYMENT_METHOD_UPDATED',
    entity: 'paymentMethods',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} memperbarui metode pembayaran ${updated.name}.`,
  });
  await enqueuePaymentMethodSync(updated, 'update');
  return updated;
};

export const archivePaymentMethod = async (id: string): Promise<PaymentMethodMaster> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'PAYMENT_METHOD_MANAGE');
  const existing = await db.paymentMethods.get(id);
  if (!existing) {
    throw new Error('Metode pembayaran tidak ditemukan.');
  }
  if (existing.is_system) {
    throw new Error('Metode pembayaran sistem tidak dapat diarsipkan.');
  }

  const archived = withPendingSync({
    ...existing,
    is_active: false,
    updated_at: new Date().toISOString(),
  });
  await db.paymentMethods.put(archived);
  await writeActivityLog({
    user: currentUser,
    action: 'PAYMENT_METHOD_ARCHIVED',
    entity: 'paymentMethods',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} mengarsipkan metode pembayaran ${archived.name}.`,
  });
  await enqueuePaymentMethodSync(archived, 'delete');
  return archived;
};

export const restorePaymentMethod = async (id: string): Promise<PaymentMethodMaster> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'PAYMENT_METHOD_MANAGE');
  const existing = await db.paymentMethods.get(id);
  if (!existing) {
    throw new Error('Metode pembayaran tidak ditemukan.');
  }
  const accountSnapshot = await resolvePostingAccountSnapshot(existing.posting_account_id, true);
  const restored = withPendingSync({
    ...existing,
    ...accountSnapshot,
    is_active: true,
    updated_at: new Date().toISOString(),
  });
  await db.paymentMethods.put(restored);
  await writeActivityLog({
    user: currentUser,
    action: 'PAYMENT_METHOD_RESTORED',
    entity: 'paymentMethods',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} memulihkan metode pembayaran ${restored.name}.`,
  });
  await enqueuePaymentMethodSync(restored, 'update');
  return restored;
};
