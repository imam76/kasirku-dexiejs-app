import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import { cooperativeMemberSchema } from '@/lib/validations/cooperativeMember';
import { enqueueCooperativeMembersSync, withPendingCooperativeSync } from '@/services/cooperativeSyncService';
import type { CooperativeMember, CooperativeMemberStatus } from '@/types';

export interface CooperativeMemberUpsertInput {
  member_number?: string;
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

export interface CooperativeMemberArchiveOptions {
  clearMemberNumber?: boolean;
}

type SanitizedCooperativeMemberInput =
  Required<Pick<CooperativeMemberUpsertInput, 'name' | 'join_date' | 'status' | 'area_id'>> &
  Omit<CooperativeMemberUpsertInput, 'member_number' | 'name' | 'join_date' | 'status' | 'area_id'> & {
    member_number: string;
  };

const GENERATED_MEMBER_NUMBER_PATTERN = /^KS[PU]-(\d+)$/;

const normalizeMemberNumber = (value?: string | null) => value?.trim().toUpperCase() ?? '';

const getNextCooperativeMemberNumber = (
  members: Array<Pick<CooperativeMember, 'member_number'>>,
) => {
  const usedNumbers = new Set(
    members
      .map((member) => normalizeMemberNumber(member.member_number))
      .filter(Boolean),
  );
  const usedGeneratedSequences = Array.from(usedNumbers)
    .map((memberNumber) => {
      const match = memberNumber.match(GENERATED_MEMBER_NUMBER_PATTERN);
      return match ? Number(match[1]) : 0;
    })
    .filter((sequence) => sequence > 0);
  let nextSequence = Math.max(0, ...usedGeneratedSequences) + 1;
  let nextMemberNumber = `KSU-${String(nextSequence).padStart(4, '0')}`;

  while (usedNumbers.has(nextMemberNumber)) {
    nextSequence += 1;
    nextMemberNumber = `KSU-${String(nextSequence).padStart(4, '0')}`;
  }

  return nextMemberNumber;
};

export const generateCooperativeMemberNumber = async (excludeMemberId?: string) => {
  const members = await db.cooperativeMembers.toArray();
  return getNextCooperativeMemberNumber(
    members.filter((member) => member.id !== excludeMemberId),
  );
};

const sanitizeCooperativeMemberInput = (input: CooperativeMemberUpsertInput): SanitizedCooperativeMemberInput => {
  const parsed = cooperativeMemberSchema.parse(input);

  return {
    ...parsed,
    member_number: normalizeMemberNumber(parsed.member_number),
    name: parsed.name.trim(),
  };
};

const assertActiveMemberNumberAvailable = async (
  memberNumber: string,
  excludeMemberId?: string,
) => {
  if (!memberNumber.trim()) return;

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
  const memberNumber = sanitizedInput.member_number || (
    sanitizedInput.status === 'ACTIVE' ? await generateCooperativeMemberNumber() : ''
  );
  const area = await resolveActiveArea(sanitizedInput.area_id);
  const officer = await resolveOfficer(sanitizedInput.officer_id, sanitizedInput.area_id);
  const now = new Date().toISOString();
  const member: CooperativeMember = withPendingCooperativeSync({
    id: crypto.randomUUID(),
    ...sanitizedInput,
    member_number: memberNumber,
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
      description: `${currentUser?.name ?? 'User'} membuat anggota koperasi ${member.member_number || '-'} - ${member.name}.`,
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
  const memberNumber = sanitizedInput.member_number || (
    sanitizedInput.status === 'ACTIVE' ? await generateCooperativeMemberNumber(id) : ''
  );
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
      await assertActiveMemberNumberAvailable(memberNumber, id);
    }

    updatedMember = withPendingCooperativeSync({
      ...existingMember,
      ...sanitizedInput,
      member_number: memberNumber,
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
      description: `${currentUser?.name ?? 'User'} memperbarui anggota koperasi ${updatedMember.member_number || '-'} - ${updatedMember.name}.`,
    });
  });

  if (!updatedMember) {
    throw new Error('Anggota koperasi tidak ditemukan setelah diperbarui.');
  }

  await enqueueCooperativeMembersSync([updatedMember], 'update');

  return updatedMember;
};

export const archiveCooperativeMember = async (
  id: string,
  options: CooperativeMemberArchiveOptions = {},
): Promise<CooperativeMember> => {
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
      member_number: options.clearMemberNumber ? '' : member.member_number,
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
      description: `${currentUser?.name ?? 'User'} mengarsipkan anggota koperasi ${member.member_number || '-'} - ${member.name}${
        options.clearMemberNumber ? ' dan mengosongkan nomor anggota.' : ''
      }.`,
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

    const memberNumber = normalizeMemberNumber(member.member_number) || await generateCooperativeMemberNumber(id);

    await assertActiveMemberNumberAvailable(memberNumber, id);

    const nextRestoredMember: CooperativeMember = withPendingCooperativeSync({
      ...member,
      member_number: memberNumber,
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
      description: `${currentUser?.name ?? 'User'} memulihkan anggota koperasi ${memberNumber} - ${member.name}.`,
    });
  });

  if (!restoredMember) {
    throw new Error('Anggota koperasi tidak ditemukan setelah dipulihkan.');
  }

  await enqueueCooperativeMembersSync([restoredMember], 'update');

  return restoredMember;
};
