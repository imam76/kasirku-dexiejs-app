import { db } from '@/lib/db';
import { contactPostgresAdapter, isTauriRuntime, type RemoteContactDto } from '@/services/postgresAdapter';
import type { Contact, ContactType } from '@/types';

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

let isRefreshingContactsFromPostgres = false;

const isContactType = (contactType: string): contactType is ContactType => (
  ['CUSTOMER', 'SUPPLIER', 'CUSTOMER_SUPPLIER', 'OTHER'].includes(contactType)
);

const mapRemoteContactToLocal = (
  remoteContact: RemoteContactDto,
  syncedAt: string,
  localContact?: Contact,
): Contact => ({
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
  is_member: localContact?.is_member,
  membership_number: localContact?.membership_number,
  membership_status: localContact?.membership_status,
  membership_joined_at: localContact?.membership_joined_at,
  membership_points_balance: localContact?.membership_points_balance,
  created_at: remoteContact.created_at,
  updated_at: remoteContact.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteContact.updated_at,
});

const hasLocalUnsyncedChanges = (contact: Contact) => (
  contact.sync_status === 'pending' || contact.sync_status === 'failed'
);

const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

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

export const refreshContactsFromPostgres = async (): Promise<ContactReadSyncResult> => {
  if (isRefreshingContactsFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_CONTACT_READ_SYNC_RESULT };
  }

  isRefreshingContactsFromPostgres = true;
  try {
    const remoteContacts = await contactPostgresAdapter.list();
    return mergeRemoteContactsIntoDexie(remoteContacts);
  } finally {
    isRefreshingContactsFromPostgres = false;
  }
};
