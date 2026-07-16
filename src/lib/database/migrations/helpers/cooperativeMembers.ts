import type * as DatabaseTypes from '@/types';
import type { Transaction as DexieTransaction } from 'dexie';

const COOPERATIVE_MEMBER_NUMBER_PADDING_LENGTH = 4;
const LEGACY_GENERATED_COOPERATIVE_MEMBER_NUMBER_PATTERN = /^KS[PU]-(\d+)$/i;
const NUMERIC_COOPERATIVE_MEMBER_NUMBER_PATTERN = /^\d+$/;

const formatGeneratedCooperativeMemberNumber = (sequence: number) => (
  String(sequence).padStart(COOPERATIVE_MEMBER_NUMBER_PADDING_LENGTH, '0')
);

const normalizeCooperativeMemberNumber = (value?: string | null) => {
  const trimmedValue = value?.trim() ?? '';
  const legacyMatch = trimmedValue.match(LEGACY_GENERATED_COOPERATIVE_MEMBER_NUMBER_PATTERN);
  if (legacyMatch) return formatGeneratedCooperativeMemberNumber(Number(legacyMatch[1]));
  if (
    NUMERIC_COOPERATIVE_MEMBER_NUMBER_PATTERN.test(trimmedValue) &&
    trimmedValue.length < COOPERATIVE_MEMBER_NUMBER_PADDING_LENGTH
  ) {
    return trimmedValue.padStart(COOPERATIVE_MEMBER_NUMBER_PADDING_LENGTH, '0');
  }

  return trimmedValue;
};

const getCooperativeMemberNumberComparisonKey = (value?: string | null) => (
  normalizeCooperativeMemberNumber(value).toUpperCase()
);

const buildCooperativeMemberCodeRecord = (
  value: string | undefined,
  now: string,
): DatabaseTypes.CooperativeMemberCode | undefined => {
  const code = normalizeCooperativeMemberNumber(value);
  if (!code) return undefined;

  return {
    id: getCooperativeMemberNumberComparisonKey(code),
    code,
    created_at: now,
    updated_at: now,
  };
};

const buildNextCooperativeMemberNumberGenerator = (
  members: Array<Pick<DatabaseTypes.CooperativeMember, 'member_number'>>,
) => {
  const usedNumbers = new Set(
    members
      .map((member) => getCooperativeMemberNumberComparisonKey(member.member_number))
      .filter(Boolean),
  );
  let nextSequence = 1;

  return () => {
    let nextNumber = formatGeneratedCooperativeMemberNumber(nextSequence);
    while (usedNumbers.has(getCooperativeMemberNumberComparisonKey(nextNumber))) {
      nextSequence += 1;
      nextNumber = formatGeneratedCooperativeMemberNumber(nextSequence);
    }

    usedNumbers.add(getCooperativeMemberNumberComparisonKey(nextNumber));
    nextSequence += 1;
    return nextNumber;
  };
};

export const backfillMissingCooperativeMemberNumbers = async (tx: DexieTransaction) => {
  const now = new Date().toISOString();
  const memberTable = tx.table<DatabaseTypes.CooperativeMember, string>('cooperativeMembers');
  const members = await memberTable.toArray();
  const nextMemberNumber = buildNextCooperativeMemberNumberGenerator(members);
  const membersWithoutCode = members
    .filter((member) => !normalizeCooperativeMemberNumber(member.member_number))
    .map((member) => ({
      ...member,
      member_number: nextMemberNumber(),
      updated_at: now,
      sync_status: 'pending' as const,
      sync_error: undefined,
    }));

  if (membersWithoutCode.length > 0) {
    await memberTable.bulkPut(membersWithoutCode);
  }
};

export const seedCooperativeMemberCodesFromMembers = async (tx: DexieTransaction) => {
  const now = new Date().toISOString();
  const memberTable = tx.table<DatabaseTypes.CooperativeMember, string>('cooperativeMembers');
  const codeTable = tx.table<DatabaseTypes.CooperativeMemberCode, string>('cooperativeMemberCodes');
  const [members, existingCodes] = await Promise.all([
    memberTable.toArray(),
    codeTable.toArray(),
  ]);
  const codeById = new Map(existingCodes.map((code) => [code.id, code]));

  members.forEach((member) => {
    const codeRecord = buildCooperativeMemberCodeRecord(member.member_number, member.created_at ?? now);
    if (!codeRecord) return;

    const existingCode = codeById.get(codeRecord.id);
    codeById.set(codeRecord.id, {
      ...codeRecord,
      created_at: existingCode?.created_at ?? codeRecord.created_at,
      updated_at: existingCode?.updated_at ?? member.updated_at ?? now,
    });
  });

  if (codeById.size > 0) {
    await codeTable.bulkPut(Array.from(codeById.values()));
  }
};
