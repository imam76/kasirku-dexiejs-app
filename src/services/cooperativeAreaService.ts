import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import { cooperativeAreaSchema } from '@/lib/validations/cooperativeArea';
import type { CooperativeArea } from '@/types';

export interface CooperativeAreaUpsertInput {
  name: string;
  code?: string;
  description?: string;
  is_active?: boolean;
}

type SanitizedCooperativeAreaInput =
  Required<Pick<CooperativeAreaUpsertInput, 'name' | 'is_active'>> &
  Omit<CooperativeAreaUpsertInput, 'name' | 'is_active'>;

const sanitizeCooperativeAreaInput = (input: CooperativeAreaUpsertInput): SanitizedCooperativeAreaInput => {
  const parsed = cooperativeAreaSchema.parse(input);

  return {
    ...parsed,
    name: parsed.name.trim(),
    code: parsed.code?.toUpperCase(),
    is_active: parsed.is_active ?? true,
  };
};

const assertAreaCodeAvailable = async (code: string | undefined, excludeAreaId?: string) => {
  if (!code) return;

  const existingArea = await db.cooperativeAreas
    .where('code')
    .equals(code)
    .and((area) => area.id !== excludeAreaId && area.is_active)
    .first();

  if (existingArea) {
    throw new Error('Kode area sudah dipakai area aktif lain.');
  }
};

const requireAreaActor = async () => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'AREA_MANAGE');
  return currentUser;
};

export const createCooperativeArea = async (input: CooperativeAreaUpsertInput): Promise<CooperativeArea> => {
  const currentUser = await requireAreaActor();
  const sanitizedInput = sanitizeCooperativeAreaInput(input);
  await assertAreaCodeAvailable(sanitizedInput.code);

  const now = new Date().toISOString();
  const area: CooperativeArea = {
    id: crypto.randomUUID(),
    ...sanitizedInput,
    created_at: now,
    updated_at: now,
  };

  await db.cooperativeAreas.add(area);
  await writeActivityLog({
    user: currentUser,
    action: 'COOPERATIVE_AREA_CREATED',
    entity: 'cooperativeAreas',
    entity_id: area.id,
    description: `${currentUser?.name ?? 'User'} membuat area ${area.name}.`,
  });

  return area;
};

export const updateCooperativeArea = async (
  id: string,
  input: CooperativeAreaUpsertInput,
): Promise<CooperativeArea> => {
  const currentUser = await requireAreaActor();
  const existingArea = await db.cooperativeAreas.get(id);
  if (!existingArea) {
    throw new Error('Area tidak ditemukan.');
  }

  const sanitizedInput = sanitizeCooperativeAreaInput(input);
  await assertAreaCodeAvailable(sanitizedInput.code, id);

  const updatedArea: CooperativeArea = {
    ...existingArea,
    ...sanitizedInput,
    updated_at: new Date().toISOString(),
  };

  await db.cooperativeAreas.put(updatedArea);
  await writeActivityLog({
    user: currentUser,
    action: 'COOPERATIVE_AREA_UPDATED',
    entity: 'cooperativeAreas',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} memperbarui area ${updatedArea.name}.`,
  });

  return updatedArea;
};

export const archiveCooperativeArea = async (id: string): Promise<CooperativeArea> => {
  const currentUser = await requireAreaActor();
  const area = await db.cooperativeAreas.get(id);
  if (!area) {
    throw new Error('Area tidak ditemukan.');
  }

  const archivedArea: CooperativeArea = {
    ...area,
    is_active: false,
    updated_at: new Date().toISOString(),
  };

  await db.cooperativeAreas.put(archivedArea);
  await writeActivityLog({
    user: currentUser,
    action: 'COOPERATIVE_AREA_ARCHIVED',
    entity: 'cooperativeAreas',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} mengarsipkan area ${area.name}.`,
  });

  return archivedArea;
};

export const restoreCooperativeArea = async (id: string): Promise<CooperativeArea> => {
  const currentUser = await requireAreaActor();
  const area = await db.cooperativeAreas.get(id);
  if (!area) {
    throw new Error('Area tidak ditemukan.');
  }

  await assertAreaCodeAvailable(area.code, id);

  const restoredArea: CooperativeArea = {
    ...area,
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  await db.cooperativeAreas.put(restoredArea);
  await writeActivityLog({
    user: currentUser,
    action: 'COOPERATIVE_AREA_RESTORED',
    entity: 'cooperativeAreas',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} memulihkan area ${area.name}.`,
  });

  return restoredArea;
};
