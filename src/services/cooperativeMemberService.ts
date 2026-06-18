import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import { cooperativeMemberSchema } from '@/lib/validations/cooperativeMember';
import { enqueueCooperativeMembersSync, withPendingCooperativeSync } from '@/services/cooperativeSyncService';
import type { CooperativeMember, CooperativeMemberStatus } from '@/types';

export interface CooperativeMemberUpsertInput {
  member_number: string;
  name: string;
  identity_number?: string;
  phone?: string;
  address?: string;
  area_id: string;
  officer_id?: string;
  join_date: string;
  status: CooperativeMemberStatus;
  notes?: string;
}

type SanitizedCooperativeMemberInput =
  Required<Pick<CooperativeMemberUpsertInput, 'member_number' | 'name' | 'join_date' | 'status'>> &
  Omit<CooperativeMemberUpsertInput, 'member_number' | 'name' | 'join_date' | 'status'>;

const sanitizeCooperativeMemberInput = (input: CooperativeMemberUpsertInput): SanitizedCooperativeMemberInput => {
  const parsed = cooperativeMemberSchema.parse(input);

  return {
    ...parsed,
    member_number: parsed.member_number.trim().toUpperCase(),
    name: parsed.name.trim(),
  };
};

const assertActiveMemberNumberAvailable = async (
  memberNumber: string,
  excludeMemberId?: string,
) => {
  const existingMember = await db.cooperativeMembers
    .where('member_number')
    .equals(memberNumber)
    .and((member) => member.id !== excludeMemberId && member.status === 'ACTIVE')
    .first();

  if (existingMember) {
    throw new Error('Nomor anggota sudah dipakai anggota aktif lain.');
  }
};

const requireCooperativeActor = async () => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'COOPERATIVE_MEMBER_MANAGE');
  return currentUser;
};

const resolveActiveArea = async (areaId: string) => {
  const area = await db.cooperativeAreas.get(areaId);
  if (!area) {
    throw new Error('Area anggota tidak ditemukan.');
  }

  if (!area.is_active) {
    throw new Error('Area anggota sudah nonaktif.');
  }

  return area;
};

const resolveOfficer = async (officerId: string | undefined, areaId: string) => {
  if (!officerId) return undefined;

  const officer = await db.employees.get(officerId);
  if (!officer) {
    throw new Error('Petugas anggota tidak ditemukan.');
  }
  if (!officer.is_active) {
    throw new Error('Petugas anggota sudah nonaktif.');
  }
  const areaAssignment = await db.employeeAreas
    .where('employee_id')
    .equals(officerId)
    .and((assignment) => assignment.area_id === areaId)
    .first();
  if (!areaAssignment) {
    throw new Error('Area anggota belum termasuk wilayah tugas petugas yang dipilih.');
  }

  return officer;
};

export const createCooperativeMember = async (
  input: CooperativeMemberUpsertInput,
): Promise<CooperativeMember> => {
  const currentUser = await requireCooperativeActor();
  const sanitizedInput = sanitizeCooperativeMemberInput(input);
  const area = await resolveActiveArea(sanitizedInput.area_id);
  const officer = await resolveOfficer(sanitizedInput.officer_id, sanitizedInput.area_id);
  const now = new Date().toISOString();
  const member: CooperativeMember = withPendingCooperativeSync({
    id: crypto.randomUUID(),
    ...sanitizedInput,
    area_name: area.name,
    area_code: area.code,
    officer_name: officer?.name,
    officer_position: officer?.position,
    created_at: now,
    updated_at: now,
    created_by: currentUser?.id,
    created_by_name: currentUser?.name,
    updated_by: currentUser?.id,
    updated_by_name: currentUser?.name,
  });

  await db.transaction('rw', [db.cooperativeMembers, db.activityLogs], async () => {
    if (member.status === 'ACTIVE') {
      await assertActiveMemberNumberAvailable(member.member_number);
    }

    await db.cooperativeMembers.add(member);
    await writeActivityLog({
      user: currentUser,
      action: 'COOPERATIVE_MEMBER_CREATED',
      entity: 'cooperativeMembers',
      entity_id: member.id,
      description: `${currentUser?.name ?? 'User'} membuat anggota koperasi ${member.member_number} - ${member.name}.`,
    });
  });

  await enqueueCooperativeMembersSync([member], 'create');

  return member;
};

export const updateCooperativeMember = async (
  id: string,
  input: CooperativeMemberUpsertInput,
): Promise<CooperativeMember> => {
  const currentUser = await requireCooperativeActor();
  const sanitizedInput = sanitizeCooperativeMemberInput(input);
  const area = await resolveActiveArea(sanitizedInput.area_id);
  const officer = await resolveOfficer(sanitizedInput.officer_id, sanitizedInput.area_id);
  const updatedAt = new Date().toISOString();
  let updatedMember: CooperativeMember | undefined;

  await db.transaction('rw', [db.cooperativeMembers, db.activityLogs], async () => {
    const existingMember = await db.cooperativeMembers.get(id);
    if (!existingMember) {
      throw new Error('Anggota koperasi tidak ditemukan.');
    }

    if (sanitizedInput.status === 'ACTIVE') {
      await assertActiveMemberNumberAvailable(sanitizedInput.member_number, id);
    }

    updatedMember = withPendingCooperativeSync({
      ...existingMember,
      ...sanitizedInput,
      area_name: area.name,
      area_code: area.code,
      officer_name: officer?.name,
      officer_position: officer?.position,
      updated_at: updatedAt,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
    });

    await db.cooperativeMembers.put(updatedMember);
    await writeActivityLog({
      user: currentUser,
      action: 'COOPERATIVE_MEMBER_UPDATED',
      entity: 'cooperativeMembers',
      entity_id: id,
      description: `${currentUser?.name ?? 'User'} memperbarui anggota koperasi ${updatedMember.member_number} - ${updatedMember.name}.`,
    });
  });

  if (!updatedMember) {
    throw new Error('Anggota koperasi tidak ditemukan setelah diperbarui.');
  }

  await enqueueCooperativeMembersSync([updatedMember], 'update');

  return updatedMember;
};

export const archiveCooperativeMember = async (id: string): Promise<CooperativeMember> => {
  const currentUser = await requireCooperativeActor();
  const updatedAt = new Date().toISOString();
  let archivedMember: CooperativeMember | undefined;

  await db.transaction('rw', [db.cooperativeMembers, db.activityLogs], async () => {
    const member = await db.cooperativeMembers.get(id);
    if (!member) {
      throw new Error('Anggota koperasi tidak ditemukan.');
    }

    const nextArchivedMember: CooperativeMember = withPendingCooperativeSync({
      ...member,
      status: 'INACTIVE' as const,
      updated_at: updatedAt,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
    });
    archivedMember = nextArchivedMember;

    await db.cooperativeMembers.put(nextArchivedMember);
    await writeActivityLog({
      user: currentUser,
      action: 'COOPERATIVE_MEMBER_ARCHIVED',
      entity: 'cooperativeMembers',
      entity_id: id,
      description: `${currentUser?.name ?? 'User'} mengarsipkan anggota koperasi ${member.member_number} - ${member.name}.`,
    });
  });

  if (!archivedMember) {
    throw new Error('Anggota koperasi tidak ditemukan setelah diarsipkan.');
  }

  await enqueueCooperativeMembersSync([archivedMember], 'update');

  return archivedMember;
};

export const restoreCooperativeMember = async (id: string): Promise<CooperativeMember> => {
  const currentUser = await requireCooperativeActor();
  const updatedAt = new Date().toISOString();
  let restoredMember: CooperativeMember | undefined;

  await db.transaction('rw', [db.cooperativeMembers, db.activityLogs], async () => {
    const member = await db.cooperativeMembers.get(id);
    if (!member) {
      throw new Error('Anggota koperasi tidak ditemukan.');
    }

    await assertActiveMemberNumberAvailable(member.member_number, id);

    const nextRestoredMember: CooperativeMember = withPendingCooperativeSync({
      ...member,
      status: 'ACTIVE' as const,
      updated_at: updatedAt,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
    });
    restoredMember = nextRestoredMember;

    await db.cooperativeMembers.put(nextRestoredMember);
    await writeActivityLog({
      user: currentUser,
      action: 'COOPERATIVE_MEMBER_RESTORED',
      entity: 'cooperativeMembers',
      entity_id: id,
      description: `${currentUser?.name ?? 'User'} memulihkan anggota koperasi ${member.member_number} - ${member.name}.`,
    });
  });

  if (!restoredMember) {
    throw new Error('Anggota koperasi tidak ditemukan setelah dipulihkan.');
  }

  await enqueueCooperativeMembersSync([restoredMember], 'update');

  return restoredMember;
};
