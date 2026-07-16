import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import { cooperativeMemberSchema } from '@/lib/validations/cooperativeMember';
import { enqueueCooperativeMembersSync, withPendingCooperativeSync } from '@/services/cooperativeSyncService';
import type { CooperativeMember, CooperativeMemberCode, CooperativeMemberStatus } from '@/types';

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

const MEMBER_NUMBER_PADDING_LENGTH = 4;
const LEGACY_GENERATED_MEMBER_NUMBER_PATTERN = /^KS[PU]-(\d+)$/i;
const NUMERIC_MEMBER_NUMBER_PATTERN = /^\d+$/;

const formatGeneratedMemberNumber = (sequence: number) => String(sequence).padStart(MEMBER_NUMBER_PADDING_LENGTH, '0');

export const normalizeCooperativeMemberCode = (value?: string | null) => {
  const trimmedValue = value?.trim() ?? '';
  const legacyMatch = trimmedValue.match(LEGACY_GENERATED_MEMBER_NUMBER_PATTERN);
  if (legacyMatch) return formatGeneratedMemberNumber(Number(legacyMatch[1]));
  if (NUMERIC_MEMBER_NUMBER_PATTERN.test(trimmedValue) && trimmedValue.length < MEMBER_NUMBER_PADDING_LENGTH) {
    return trimmedValue.padStart(MEMBER_NUMBER_PADDING_LENGTH, '0');
  }

  return trimmedValue;
};

const getCooperativeMemberCodeId = (value?: string | null) => normalizeCooperativeMemberCode(value).toUpperCase();

const buildCooperativeMemberCodeRecord = (
  value: string | undefined,
  now: string,
): CooperativeMemberCode | undefined => {
  const code = normalizeCooperativeMemberCode(value);
  if (!code) return undefined;

  return {
    id: getCooperativeMemberCodeId(code),
    code,
    created_at: now,
    updated_at: now,
  };
};

const upsertCooperativeMemberCode = async (value: string | undefined, now = new Date().toISOString()) => {
  const codeRecord = buildCooperativeMemberCodeRecord(value, now);
  if (!codeRecord) return;

  const existingCode = await db.cooperativeMemberCodes.get(codeRecord.id);
  await db.cooperativeMemberCodes.put({
    ...codeRecord,
    created_at: existingCode?.created_at ?? codeRecord.created_at,
  });
};

const getActiveUsedMemberCodeIds = (
  members: Array<Pick<CooperativeMember, 'id' | 'member_number' | 'status'>>,
  excludeMemberId?: string,
) => {
  return new Set(
    members
      .filter((member) => member.id !== excludeMemberId && member.status === 'ACTIVE')
      .map((member) => getCooperativeMemberCodeId(member.member_number))
      .filter(Boolean),
  );
};

const getNextCooperativeMemberNumber = (
  members: Array<Pick<CooperativeMember, 'id' | 'member_number' | 'status'>>,
  memberCodes: Array<Pick<CooperativeMemberCode, 'code'>>,
  excludeMemberId?: string,
) => {
  const usedCodeIds = getActiveUsedMemberCodeIds(members, excludeMemberId);
  const reusableCode = memberCodes
    .filter((memberCode) => !usedCodeIds.has(getCooperativeMemberCodeId(memberCode.code)))
    .sort((left, right) => left.code.localeCompare(right.code, undefined, { numeric: true }))[0];
  if (reusableCode) return reusableCode.code;

  const reservedCodeIds = new Set([
    ...Array.from(usedCodeIds),
    ...memberCodes.map((memberCode) => getCooperativeMemberCodeId(memberCode.code)).filter(Boolean),
  ]);
  let nextSequence = 1;
  let nextMemberNumber = formatGeneratedMemberNumber(nextSequence);

  while (reservedCodeIds.has(getCooperativeMemberCodeId(nextMemberNumber))) {
    nextSequence += 1;
    nextMemberNumber = formatGeneratedMemberNumber(nextSequence);
  }

  return nextMemberNumber;
};

export const generateCooperativeMemberNumber = async (excludeMemberId?: string) => {
  const [members, memberCodes] = await Promise.all([
    db.cooperativeMembers.toArray(),
    db.cooperativeMemberCodes.toArray(),
  ]);
  return getNextCooperativeMemberNumber(members, memberCodes, excludeMemberId);
};

export const buildAvailableCooperativeMemberNumberOptions = (
  memberCodes: Array<Pick<CooperativeMemberCode, 'code'>>,
  members: Array<Pick<CooperativeMember, 'id' | 'member_number' | 'status'>>,
  options: { excludeMemberId?: string } = {},
) => {
  const usedCodeIds = getActiveUsedMemberCodeIds(members, options.excludeMemberId);
  const availableCodes = new Map<string, string>();

  memberCodes.forEach((memberCode) => {
    const code = normalizeCooperativeMemberCode(memberCode.code);
    const codeId = getCooperativeMemberCodeId(code);
    if (!code || usedCodeIds.has(codeId)) return;
    availableCodes.set(codeId, code);
  });

  return Array.from(availableCodes.values())
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
};

const sanitizeCooperativeMemberInput = (input: CooperativeMemberUpsertInput): SanitizedCooperativeMemberInput => {
  const parsed = cooperativeMemberSchema.parse(input);

  return {
    ...parsed,
    member_number: normalizeCooperativeMemberCode(parsed.member_number),
    name: parsed.name.trim(),
  };
};

const assertActiveMemberNumberAvailable = async (
  memberNumber: string,
  excludeMemberId?: string,
) => {
  if (!memberNumber.trim()) return;

  const memberNumberKey = getCooperativeMemberCodeId(memberNumber);
  const existingMember = (await db.cooperativeMembers.toArray())
    .find((member) => (
      member.id !== excludeMemberId &&
      member.status === 'ACTIVE' &&
      getCooperativeMemberCodeId(member.member_number) === memberNumberKey
    ));

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

  await db.transaction('rw', [db.cooperativeMembers, db.cooperativeMemberCodes, db.activityLogs], async () => {
    if (member.status === 'ACTIVE') {
      await assertActiveMemberNumberAvailable(member.member_number);
    }

    await upsertCooperativeMemberCode(member.member_number, now);
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

  await db.transaction('rw', [db.cooperativeMembers, db.cooperativeMemberCodes, db.activityLogs], async () => {
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

    await upsertCooperativeMemberCode(updatedMember.member_number, updatedAt);
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

  await db.transaction('rw', [db.cooperativeMembers, db.cooperativeMemberCodes, db.activityLogs], async () => {
    const member = await db.cooperativeMembers.get(id);
    if (!member) {
      throw new Error('Anggota koperasi tidak ditemukan.');
    }

    const memberNumber = normalizeCooperativeMemberCode(member.member_number) || await generateCooperativeMemberNumber(id);

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

    await upsertCooperativeMemberCode(memberNumber, updatedAt);
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
