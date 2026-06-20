import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import { taxSchema } from '@/lib/validations/tax';
import { enqueueTaxSync } from '@/services/syncQueueService';
import type { Tax, TaxCalculationMode, TaxRateType } from '@/types';

export interface TaxUpsertInput {
  name: string;
  code?: string;
  rate: number;
  rate_type?: TaxRateType;
  calculation_mode: TaxCalculationMode;
  description?: string;
  effective_from?: string;
  effective_to?: string;
  is_default?: boolean;
  is_active?: boolean;
}

type SanitizedTaxInput =
  Required<Pick<TaxUpsertInput, 'name' | 'rate' | 'rate_type' | 'calculation_mode' | 'is_default' | 'is_active'>> &
  Omit<TaxUpsertInput, 'name' | 'rate' | 'rate_type' | 'calculation_mode' | 'is_default' | 'is_active'>;

const sanitizeTaxInput = (input: TaxUpsertInput): SanitizedTaxInput => {
  const parsed = taxSchema.parse({
    ...input,
    rate_type: input.rate_type ?? 'PERCENTAGE',
  });

  return {
    ...parsed,
    code: parsed.code?.toUpperCase(),
    rate: Number(parsed.rate),
    rate_type: parsed.rate_type,
    is_default: Boolean(parsed.is_default),
    is_active: parsed.is_active ?? true,
  };
};

const withPendingSync = (tax: Tax): Tax => ({
  ...tax,
  sync_status: 'pending',
  sync_error: undefined,
});

const clearOtherDefaultTaxes = async (taxId: string, updatedAt = new Date().toISOString()): Promise<Tax[]> => {
  const defaultTaxes = await db.taxes
    .filter((tax) => tax.is_default && tax.id !== taxId)
    .toArray();

  const clearedTaxes = defaultTaxes.map((tax) => withPendingSync({
    ...tax,
    is_default: false,
    updated_at: updatedAt,
  }));

  if (clearedTaxes.length > 0) {
    await db.taxes.bulkPut(clearedTaxes);
  }

  return clearedTaxes;
};

export const createTax = async (input: TaxUpsertInput): Promise<Tax> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'TAX_MANAGE');

  const sanitizedInput = sanitizeTaxInput(input);
  const now = new Date().toISOString();
  const tax: Tax = withPendingSync({
    id: crypto.randomUUID(),
    ...sanitizedInput,
    is_default: sanitizedInput.is_active ? sanitizedInput.is_default : false,
    created_at: now,
    updated_at: now,
  });
  let clearedDefaultTaxes: Tax[] = [];

  await db.transaction('rw', db.taxes, async () => {
    if (tax.is_default) {
      clearedDefaultTaxes = await clearOtherDefaultTaxes(tax.id, now);
    }
    await db.taxes.add(tax);
  });

  await writeActivityLog({
    user: currentUser,
    action: 'TAX_CREATED',
    entity: 'taxes',
    entity_id: tax.id,
    description: `${currentUser?.name ?? 'User'} membuat tax ${tax.name}.`,
  });
  for (const clearedTax of clearedDefaultTaxes) {
    await enqueueTaxSync(clearedTax, 'update');
  }
  await enqueueTaxSync(tax, 'create');

  return tax;
};

export const updateTax = async (id: string, input: TaxUpsertInput): Promise<Tax> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'TAX_MANAGE');

  const existingTax = await db.taxes.get(id);
  if (!existingTax) {
    throw new Error('Tax tidak ditemukan.');
  }

  const sanitizedInput = sanitizeTaxInput(input);
  const updatedTax: Tax = withPendingSync({
    ...existingTax,
    ...sanitizedInput,
    is_default: sanitizedInput.is_active ? sanitizedInput.is_default : false,
    updated_at: new Date().toISOString(),
  });
  let clearedDefaultTaxes: Tax[] = [];

  await db.transaction('rw', db.taxes, async () => {
    if (updatedTax.is_default) {
      clearedDefaultTaxes = await clearOtherDefaultTaxes(id, updatedTax.updated_at);
    }
    await db.taxes.put(updatedTax);
  });

  await writeActivityLog({
    user: currentUser,
    action: 'TAX_UPDATED',
    entity: 'taxes',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} memperbarui tax ${updatedTax.name}.`,
  });
  for (const clearedTax of clearedDefaultTaxes) {
    await enqueueTaxSync(clearedTax, 'update');
  }
  await enqueueTaxSync(updatedTax, 'update');

  return updatedTax;
};

export const archiveTax = async (id: string): Promise<Tax> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'TAX_MANAGE');

  const tax = await db.taxes.get(id);
  if (!tax) {
    throw new Error('Tax tidak ditemukan.');
  }

  const archivedTax: Tax = withPendingSync({
    ...tax,
    is_active: false,
    is_default: false,
    updated_at: new Date().toISOString(),
  });

  await db.taxes.put(archivedTax);
  await writeActivityLog({
    user: currentUser,
    action: 'TAX_ARCHIVED',
    entity: 'taxes',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} mengarsipkan tax ${tax.name}.`,
  });
  await enqueueTaxSync(archivedTax, 'delete');

  return archivedTax;
};

export const restoreTax = async (id: string): Promise<Tax> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'TAX_MANAGE');

  const tax = await db.taxes.get(id);
  if (!tax) {
    throw new Error('Tax tidak ditemukan.');
  }

  const restoredTax: Tax = withPendingSync({
    ...tax,
    is_active: true,
    updated_at: new Date().toISOString(),
  });

  await db.taxes.put(restoredTax);
  await writeActivityLog({
    user: currentUser,
    action: 'TAX_RESTORED',
    entity: 'taxes',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} memulihkan tax ${tax.name}.`,
  });
  await enqueueTaxSync(restoredTax, 'update');

  return restoredTax;
};

export const setDefaultTax = async (id: string): Promise<Tax> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'TAX_MANAGE');

  const tax = await db.taxes.get(id);
  if (!tax) {
    throw new Error('Tax tidak ditemukan.');
  }
  if (!tax.is_active) {
    throw new Error('Tax nonaktif tidak bisa dijadikan default.');
  }

  const defaultTax: Tax = withPendingSync({
    ...tax,
    is_default: true,
    updated_at: new Date().toISOString(),
  });
  let clearedDefaultTaxes: Tax[] = [];

  await db.transaction('rw', db.taxes, async () => {
    clearedDefaultTaxes = await clearOtherDefaultTaxes(id, defaultTax.updated_at);
    await db.taxes.put(defaultTax);
  });

  await writeActivityLog({
    user: currentUser,
    action: 'TAX_SET_DEFAULT',
    entity: 'taxes',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} menjadikan tax ${tax.name} sebagai default.`,
  });
  for (const clearedTax of clearedDefaultTaxes) {
    await enqueueTaxSync(clearedTax, 'update');
  }
  await enqueueTaxSync(defaultTax, 'update');

  return defaultTax;
};
