import { db } from '@/lib/db';
import {
  contactPostgresAdapter,
  isPostgresUnavailableError,
  isTauriRuntime,
  type RemoteContactDto,
} from '@/services/postgresAdapter';
import {
  getLatestLocalRemoteUpdatedAt,
  getLatestRemoteUpdatedAt,
  toTimestamp,
} from '@/services/shared/remoteRefreshCursor';
import type { Contact, ContactType, RetailMembershipStatus } from '@/types';

export interface ContactReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

const EMPTY_CONTACT_READ_SYNC_RESULT: ContactReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
};

const CONTACT_REFRESH_LIMIT = 500;

let isRefreshingContactsFromPostgres = false;

const isContactType = (contactType: string): contactType is ContactType => (
  ['CUSTOMER', 'SUPPLIER', 'CUSTOMER_SUPPLIER', 'OTHER'].includes(contactType)
);

const isRetailMembershipStatus = (status?: string | null): status is RetailMembershipStatus => (
  status === 'ACTIVE' || status === 'INACTIVE'
);

interface MembershipSnapshotLike {
  is_member?: boolean | null;
  membership_number?: string | null;
  membership_status?: RetailMembershipStatus | string | null;
  membership_joined_at?: string | null;
  membership_points_balance?: number | null;
}

const hasMembershipSnapshot = (contact?: MembershipSnapshotLike | null) => (
  Boolean(
    contact?.is_member ||
    contact?.membership_number ||
    contact?.membership_status ||
    contact?.membership_joined_at ||
    Number(contact?.membership_points_balance || 0) > 0,
  )
);

const shouldKeepLocalMembershipSnapshot = (
  remoteContact: RemoteContactDto,
  localContact?: Contact,
) => {
  if (!hasMembershipSnapshot(localContact) || hasMembershipSnapshot(remoteContact)) return false;

  const localRemoteUpdatedAt = localContact?.remote_updated_at ?? localContact?.updated_at;
  if (!localRemoteUpdatedAt) return true;

  const remoteTimestamp = toTimestamp(remoteContact.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp <= localTimestamp;
  }

  return remoteContact.updated_at <= localRemoteUpdatedAt;
};

const mapRemoteContactToLocal = (
  remoteContact: RemoteContactDto,
  syncedAt: string,
  localContact?: Contact,
): Contact => {
  const keepLocalMembership = shouldKeepLocalMembershipSnapshot(remoteContact, localContact);

  return {
    id: remoteContact.id,
    name: remoteContact.name,
    contact_type: isContactType(remoteContact.contact_type) ? remoteContact.contact_type : 'OTHER',
    phone: remoteContact.phone ?? undefined,
    email: remoteContact.email ?? undefined,
    address: remoteContact.address ?? undefined,
    company_name: remoteContact.company_name ?? undefined,
    tax_number: remoteContact.tax_number ?? undefined,
    notes: remoteContact.notes ?? undefined,
    is_active: remoteContact.deleted_at ? false : remoteContact.is_active,
    is_member: keepLocalMembership ? localContact?.is_member : Boolean(remoteContact.is_member),
    membership_number: keepLocalMembership ? localContact?.membership_number : remoteContact.membership_number ?? undefined,
    membership_status: keepLocalMembership
      ? localContact?.membership_status
      : isRetailMembershipStatus(remoteContact.membership_status)
        ? remoteContact.membership_status
        : undefined,
    membership_joined_at: keepLocalMembership ? localContact?.membership_joined_at : remoteContact.membership_joined_at ?? undefined,
    membership_points_balance: keepLocalMembership ? localContact?.membership_points_balance : Number(remoteContact.membership_points_balance ?? 0),
    created_at: remoteContact.created_at,
    updated_at: remoteContact.updated_at,
    sync_status: keepLocalMembership ? 'pending' : 'synced',
    sync_error: undefined,
    last_synced_at: syncedAt,
    remote_updated_at: remoteContact.updated_at,
  };
};

const hasLocalUnsyncedChanges = (contact: Contact) => (
  contact.sync_status === 'pending' || contact.sync_status === 'failed'
);

const shouldApplyRemoteContact = (
  localContact: Contact | undefined,
  remoteContact: RemoteContactDto,
) => {
  if (!localContact) return true;
  if (hasLocalUnsyncedChanges(localContact)) return false;

  const localRemoteUpdatedAt = localContact.remote_updated_at ?? localContact.updated_at;
  const remoteTimestamp = toTimestamp(remoteContact.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteContact.updated_at >= localRemoteUpdatedAt;
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

export const mergeRemoteContactsIntoDexie = async (
  remoteContacts: RemoteContactDto[],
  syncedAt = new Date().toISOString(),
): Promise<ContactReadSyncResult> => {
  const result: ContactReadSyncResult = {
    ...EMPTY_CONTACT_READ_SYNC_RESULT,
    fetched: remoteContacts.length,
  };
  if (remoteContacts.length === 0) return result;

  const contactsToPut: Contact[] = [];

  await db.transaction('rw', db.contacts, async () => {
    for (const remoteContact of remoteContacts) {
      const localContact = await db.contacts.get(remoteContact.id);
      if (!shouldApplyRemoteContact(localContact, remoteContact)) {
        result.skipped += 1;
        continue;
      }

      contactsToPut.push(mapRemoteContactToLocal(remoteContact, syncedAt, localContact));
      if (localContact) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }

    if (contactsToPut.length > 0) {
      await db.contacts.bulkPut(contactsToPut);
    }
  });

  return result;
};

const getLatestLocalContactUpdatedAt = async () => {
  const contacts = await db.contacts.toArray();
  return getLatestLocalRemoteUpdatedAt(
    contacts,
    (contact) => contact.remote_updated_at ?? (contact.sync_status === 'synced' ? contact.updated_at : undefined),
  );
};

const getLatestRemoteContactUpdatedAt = (remoteContacts: RemoteContactDto[]) => (
  getLatestRemoteUpdatedAt(remoteContacts, (contact) => contact.updated_at)
);

const addContactReadSyncResult = (
  aggregate: ContactReadSyncResult,
  next: ContactReadSyncResult,
) => {
  aggregate.fetched += next.fetched;
  aggregate.inserted += next.inserted;
  aggregate.updated += next.updated;
  aggregate.skipped += next.skipped;
};

export const refreshContactsFromPostgres = async (): Promise<ContactReadSyncResult> => {
  if (isRefreshingContactsFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_CONTACT_READ_SYNC_RESULT };
  }

  isRefreshingContactsFromPostgres = true;
  try {
    const aggregate = { ...EMPTY_CONTACT_READ_SYNC_RESULT };
    let updatedAfter = await getLatestLocalContactUpdatedAt();

    while (true) {
      const remoteContacts = await contactPostgresAdapter.list({
        updatedAfter,
        limit: CONTACT_REFRESH_LIMIT,
      });
      const result = await mergeRemoteContactsIntoDexie(remoteContacts);
      addContactReadSyncResult(aggregate, result);

      if (remoteContacts.length < CONTACT_REFRESH_LIMIT) {
        break;
      }

      const nextUpdatedAfter = getLatestRemoteContactUpdatedAt(remoteContacts);
      if (!nextUpdatedAfter || nextUpdatedAfter === updatedAfter) {
        break;
      }

      updatedAfter = nextUpdatedAfter;
    }

    return aggregate;
  } catch (error) {
    if (isPostgresUnavailableError(error)) {
      return { ...EMPTY_CONTACT_READ_SYNC_RESULT };
    }

    throw error;
  } finally {
    isRefreshingContactsFromPostgres = false;
  }
};
