import { db } from '@/lib/db';
import type { Membership } from '@/types';

/**
 * The POS member picker used to materialise every active member on each render,
 * and its live query re-ran whenever a membership row changed — including the
 * point update written by a member checkout and every background sync merge.
 *
 * These readers keep the work proportional to what the picker shows: a bounded
 * page by member number, prefix lookups through the `member_number` and `phone`
 * indexes, and the selected member by primary key.
 */
export const POS_MEMBER_OPTION_LIMIT = 50;

// `is_active` is a boolean, which IndexedDB cannot index, and `status` is absent
// on rows created before it existed. Both are therefore checked in the callback.
const isSelectableMember = (member: Membership) => Boolean(
  member.is_active && (member.status ?? 'ACTIVE') === 'ACTIVE',
);

const NAME_SEARCH_MIN_LENGTH = 2;

export const readPosMemberOptions = async (
  search = '',
  limit = POS_MEMBER_OPTION_LIMIT,
): Promise<Membership[]> => {
  const term = search.trim().toLowerCase();

  if (!term) {
    return db.memberships.orderBy('member_number').filter(isSelectableMember).limit(limit).toArray();
  }

  const [byNumber, byPhone] = await Promise.all([
    db.memberships.where('member_number').startsWithIgnoreCase(term)
      .filter(isSelectableMember).limit(limit).toArray(),
    db.memberships.where('phone').startsWith(term)
      .filter(isSelectableMember).limit(limit).toArray(),
  ]);

  const matches = new Map<string, Membership>();
  [...byNumber, ...byPhone].forEach((member) => matches.set(member.id, member));

  // Names have no index, so this walks the member_number order until the page is
  // filled. It only runs while someone types in the picker, never on checkout.
  if (matches.size < limit && term.length >= NAME_SEARCH_MIN_LENGTH) {
    const byName = await db.memberships.orderBy('member_number')
      .filter((member) => isSelectableMember(member)
        && (member.name ?? '').toLowerCase().includes(term))
      .limit(limit)
      .toArray();
    byName.forEach((member) => matches.set(member.id, member));
  }

  return [...matches.values()].slice(0, limit);
};

export const readPosMember = async (memberId?: string): Promise<Membership | undefined> => (
  memberId ? db.memberships.get(memberId) : undefined
);

/**
 * The picker needs a label for the current selection even when it falls outside
 * the page or the active filter, so the selected member always leads the list.
 */
export const withSelectedMemberFirst = (
  options: Membership[],
  selected?: Membership | null,
): Membership[] => (
  selected ? [selected, ...options.filter((member) => member.id !== selected.id)] : options
);
