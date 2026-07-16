import { db } from '@/lib/db';
import { buildLegacyPosPaymentSnapshot, toLegacyPaymentMethod } from '@/utils/posPaymentMethod';
import type {
  ChartOfAccount,
  PaymentMethod,
  PaymentMethodMaster,
  Transaction,
} from '@/types';

export interface ResolvePosPaymentMethodInput {
  paymentMethodId: string;
  paymentReference?: string;
}

export interface ResolvedPosPaymentMethod {
  master: PaymentMethodMaster;
  postingAccount: ChartOfAccount;
  legacyPaymentMethod: PaymentMethod;
  normalizedReference?: string;
}

const normalizeReference = (reference?: string) => {
  const normalized = reference?.trim() || undefined;
  if (normalized && normalized.length > 100) {
    throw new Error('Nomor referensi maksimal 100 karakter.');
  }
  if (normalized && /[\r\n\t]/.test(normalized)) {
    throw new Error('Nomor referensi tidak boleh mengandung baris baru atau tab.');
  }
  return normalized;
};

export const isValidPosPostingAccount = (account?: ChartOfAccount): boolean => (
  Boolean(account && account.type === 'ASSET' && account.is_active && account.is_postable)
);

export const resolvePosPaymentMethod = async ({
  paymentMethodId,
  paymentReference,
}: ResolvePosPaymentMethodInput): Promise<ResolvedPosPaymentMethod> => {
  if (!paymentMethodId?.trim()) throw new Error('Metode pembayaran belum dipilih.');

  const master = await db.paymentMethods.get(paymentMethodId);
  if (!master) throw new Error('Metode pembayaran tidak ditemukan.');
  if (!master.is_active) throw new Error(`Metode pembayaran ${master.name} sudah tidak aktif.`);
  if (!master.posting_account_id) {
    throw new Error(`Akun penerimaan untuk ${master.name} belum dikonfigurasi.`);
  }

  const postingAccount = await db.chartOfAccounts.get(master.posting_account_id);
  if (!postingAccount || !isValidPosPostingAccount(postingAccount)) {
    const accountLabel = postingAccount
      ? `${postingAccount.code} - ${postingAccount.name}`
      : master.posting_account_code || master.posting_account_id;
    throw new Error(`Akun ${accountLabel} sudah tidak valid untuk posting.`);
  }

  const normalizedReference = normalizeReference(paymentReference);
  if (master.requires_reference && !normalizedReference) {
    throw new Error(`Nomor referensi wajib diisi untuk ${master.name}.`);
  }

  return {
    master,
    postingAccount,
    legacyPaymentMethod: toLegacyPaymentMethod(master.category),
    normalizedReference,
  };
};

export const buildPosPaymentSnapshot = (resolved: ResolvedPosPaymentMethod) => ({
  payment_method: resolved.legacyPaymentMethod,
  payment_method_id: resolved.master.id,
  payment_method_code: resolved.master.code,
  payment_method_name: resolved.master.name,
  payment_method_category: resolved.master.category,
  payment_reference: resolved.normalizedReference,
  payment_posting_account_id: resolved.postingAccount.id,
  payment_posting_account_code: resolved.postingAccount.code,
  payment_posting_account_name: resolved.postingAccount.name,
});

export const backfillLegacyPosPaymentSnapshots = async (): Promise<number> => {
  const [transactions, methods] = await Promise.all([
    db.transactions.toArray(),
    db.paymentMethods.toArray(),
  ]);
  const missing = transactions.filter((transaction) => (
    !transaction.payment_method_id && !transaction.payment_method_code
  ));
  if (missing.length === 0) return 0;

  const updated: Transaction[] = missing.map((transaction) => (
    buildLegacyPosPaymentSnapshot(transaction, methods)
  ));
  await db.transactions.bulkPut(updated);
  return updated.length;
};
