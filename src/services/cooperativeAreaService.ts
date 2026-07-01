import {
  getCurrentSessionUser,
  requireAnyUserPermission,
  requireUserPermission,
  writeActivityLog,
} from '@/auth/authService';
import { db } from '@/lib/db';
import { cooperativeAreaSchema } from '@/lib/validations/cooperativeArea';
import { refreshCooperativeAreasFromPostgres } from '@/services/cooperativeAreaReadService';
import { enqueueCooperativeAreasSync } from '@/services/cooperativeSyncService';
import type { CooperativeArea, Permission } from '@/types';

export interface CooperativeAreaUpsertInput {
  name: string;
  code?: string;
  description?: string;
  is_active?: boolean;
}

export type CooperativeAreaQuickCreateSource = 'member' | 'employee';

export interface CooperativeAreaQuickCreateInput {
  name: string;
  description?: string;
  source: CooperativeAreaQuickCreateSource;
}

type SanitizedCooperativeAreaInput =
  Required<Pick<CooperativeAreaUpsertInput, 'name' | 'is_active'>> &
  Omit<CooperativeAreaUpsertInput, 'name' | 'is_active'>;

type CurrentSessionUser = Awaited<ReturnType<typeof getCurrentSessionUser>>;

const QUICK_CREATE_AREA_PERMISSIONS: Record<CooperativeAreaQuickCreateSource, Permission[]> = {
  member: ['AREA_MANAGE', 'COOPERATIVE_MEMBER_MANAGE'],
  employee: ['AREA_MANAGE', 'EMPLOYEE_MANAGE'],
};

const QUICK_CREATE_AREA_SOURCE_LABELS: Record<CooperativeAreaQuickCreateSource, string> = {
  member: 'form anggota koperasi',
  employee: 'form karyawan',
};

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

const withPendingSync = (area: CooperativeArea): CooperativeArea => ({
  ...area,
  sync_status: 'pending',
  sync_error: undefined,
});

const createNextCooperativeAreaCode = async () => {
  const areas = await db.cooperativeAreas.toArray();
  const usedCodes = new Set(
    areas
      .map((area) => area.code?.trim().toUpperCase())
      .filter((code): code is string => Boolean(code)),
  );
  const usedAreaNumbers = areas
    .map((area) => {
      const match = area.code?.trim().toUpperCase().match(/^AREA-(\d+)$/);
      return match ? Number(match[1]) : 0;
    })
    .filter((value) => value > 0);
  let nextNumber = Math.max(0, ...usedAreaNumbers) + 1;
  let nextCode = `AREA-${String(nextNumber).padStart(3, '0')}`;

  while (usedCodes.has(nextCode)) {
    nextNumber += 1;
    nextCode = `AREA-${String(nextNumber).padStart(3, '0')}`;
  }

  return nextCode;
};

const persistCooperativeArea = async (
  currentUser: CurrentSessionUser,
  input: CooperativeAreaUpsertInput,
  descriptionSource?: string,
): Promise<CooperativeArea> => {
  const sanitizedInput = sanitizeCooperativeAreaInput(input);
  await assertAreaCodeAvailable(sanitizedInput.code);

  const now = new Date().toISOString();
  const area: CooperativeArea = withPendingSync({
    id: crypto.randomUUID(),
    ...sanitizedInput,
    created_at: now,
    updated_at: now,
  });

  await db.cooperativeAreas.add(area);
  await writeActivityLog({
    user: currentUser,
    action: 'COOPERATIVE_AREA_CREATED',
    entity: 'cooperativeAreas',
    entity_id: area.id,
    description: `${currentUser?.name ?? 'User'} membuat area ${area.name}${descriptionSource ? ` dari ${descriptionSource}` : ''}.`,
  });
  await enqueueCooperativeAreasSync([area], 'create');

  return area;
};

export const createCooperativeArea = async (input: CooperativeAreaUpsertInput): Promise<CooperativeArea> => {
  const currentUser = await requireAreaActor();
  return persistCooperativeArea(currentUser, input);
};

export const createCooperativeAreaWithGeneratedCode = async (
  input: CooperativeAreaQuickCreateInput,
): Promise<CooperativeArea> => {
  const currentUser = await getCurrentSessionUser();
  await requireAnyUserPermission(currentUser, QUICK_CREATE_AREA_PERMISSIONS[input.source]);
  await refreshCooperativeAreasFromPostgres();

  return persistCooperativeArea(currentUser, {
    name: input.name,
    code: await createNextCooperativeAreaCode(),
    description: input.description,
    is_active: true,
  }, QUICK_CREATE_AREA_SOURCE_LABELS[input.source]);
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

  const updatedArea: CooperativeArea = withPendingSync({
    ...existingArea,
    ...sanitizedInput,
    updated_at: new Date().toISOString(),
  });

  await db.cooperativeAreas.put(updatedArea);
  await writeActivityLog({
    user: currentUser,
    action: 'COOPERATIVE_AREA_UPDATED',
    entity: 'cooperativeAreas',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} memperbarui area ${updatedArea.name}.`,
  });
  await enqueueCooperativeAreasSync([updatedArea], 'update');

  return updatedArea;
};

export const archiveCooperativeArea = async (id: string): Promise<CooperativeArea> => {
  const currentUser = await requireAreaActor();
  const area = await db.cooperativeAreas.get(id);
  if (!area) {
    throw new Error('Area tidak ditemukan.');
  }

  const archivedArea: CooperativeArea = withPendingSync({
    ...area,
    is_active: false,
    updated_at: new Date().toISOString(),
  });

  await db.cooperativeAreas.put(archivedArea);
  await writeActivityLog({
    user: currentUser,
    action: 'COOPERATIVE_AREA_ARCHIVED',
    entity: 'cooperativeAreas',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} mengarsipkan area ${area.name}.`,
  });
  await enqueueCooperativeAreasSync([archivedArea], 'update');

  return archivedArea;
};

export const restoreCooperativeArea = async (id: string): Promise<CooperativeArea> => {
  const currentUser = await requireAreaActor();
  const area = await db.cooperativeAreas.get(id);
  if (!area) {
    throw new Error('Area tidak ditemukan.');
  }

  await assertAreaCodeAvailable(area.code, id);

  const restoredArea: CooperativeArea = withPendingSync({
    ...area,
    is_active: true,
    updated_at: new Date().toISOString(),
  });

  await db.cooperativeAreas.put(restoredArea);
  await writeActivityLog({
    user: currentUser,
    action: 'COOPERATIVE_AREA_RESTORED',
    entity: 'cooperativeAreas',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} memulihkan area ${area.name}.`,
  });
  await enqueueCooperativeAreasSync([restoredArea], 'update');

  return restoredArea;
};
