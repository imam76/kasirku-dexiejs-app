import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import { cooperativeMemberSchema } from '@/lib/validations/cooperativeMember';
import type { CooperativeMember, CooperativeMemberStatus } from '@/types';

export interface CooperativeMemberUpsertInput {
  member_number: string;
  name: string;
  identity_number?: string;
  phone?: string;
  address?: string;
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
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');
  return currentUser;
};

export const createCooperativeMember = async (
  input: CooperativeMemberUpsertInput,
): Promise<CooperativeMember> => {
  const currentUser = await requireCooperativeActor();
  const sanitizedInput = sanitizeCooperativeMemberInput(input);
  const now = new Date().toISOString();
  const member: CooperativeMember = {
    id: crypto.randomUUID(),
    ...sanitizedInput,
    created_at: now,
    updated_at: now,
    created_by: currentUser?.id,
    created_by_name: currentUser?.name,
    updated_by: currentUser?.id,
    updated_by_name: currentUser?.name,
  };

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

  return member;
};

export const updateCooperativeMember = async (
  id: string,
  input: CooperativeMemberUpsertInput,
): Promise<CooperativeMember> => {
  const currentUser = await requireCooperativeActor();
  const sanitizedInput = sanitizeCooperativeMemberInput(input);
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

    updatedMember = {
      ...existingMember,
      ...sanitizedInput,
      updated_at: updatedAt,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
    };

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

    archivedMember = {
      ...member,
      status: 'INACTIVE',
      updated_at: updatedAt,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
    };

    await db.cooperativeMembers.put(archivedMember);
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

    restoredMember = {
      ...member,
      status: 'ACTIVE',
      updated_at: updatedAt,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
    };

    await db.cooperativeMembers.put(restoredMember);
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

  return restoredMember;
};
