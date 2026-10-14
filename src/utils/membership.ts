import type { Membership, RetailMembershipStatus } from '@/types';

/**
 * The single rule for "this member is active". `is_active` is what the form, archive and
 * restore write; `status` is kept in step with it, and rows from before that rule existed
 * may still disagree, so both must hold. Every screen and the POS go through this check, so
 * a member can no longer look active in the list yet be missing from the POS picker.
 */
export const isMembershipActive = (
  member?: Pick<Membership, 'is_active' | 'status'> | null,
): boolean => Boolean(member?.is_active && (member.status ?? 'ACTIVE') === 'ACTIVE');

export const toMembershipStatus = (isActive: boolean): RetailMembershipStatus => (
  isActive ? 'ACTIVE' : 'INACTIVE'
);

/**
 * One stored form per phone number, so the same customer typed as "0812-3456-789",
 * "+62 812 3456 789" or "628123456789" is recognised as one member.
 */
export const normalizeMembershipPhone = (phone: string): string => {
  const compact = phone.trim().replace(/[\s().-]/g, '');
  if (compact.startsWith('+62')) return `0${compact.slice(3)}`;
  if (/^628\d{6,}$/.test(compact)) return `0${compact.slice(2)}`;
  return compact;
};

/** Points a member can spend now. A negative balance is debt, not spendable points. */
export const getRedeemablePoints = (pointsBalance?: number | null): number => (
  Math.max(0, Math.floor(Number(pointsBalance || 0)))
);

// Crockford base32: no I, L, O or U to misread when a number is read out at the counter.
const MEMBER_NUMBER_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const MEMBER_NUMBER_SUFFIX_LENGTH = 5;

/**
 * Random rather than a per-day counter: each terminal numbers members on its own, often
 * offline, and two terminals counting from 0001 on the same day produced the same number.
 * 32^5 suffixes per day make a cross-terminal collision negligible.
 */
export const createMembershipNumberSuffix = (length = MEMBER_NUMBER_SUFFIX_LENGTH): string => {
  // 256 is a multiple of 32, so the modulo keeps every character equally likely.
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => MEMBER_NUMBER_ALPHABET[byte % MEMBER_NUMBER_ALPHABET.length]).join('');
};

export const formatMembershipNumber = (dateKey: string, suffix: string): string => `MBR-${dateKey}-${suffix}`;
