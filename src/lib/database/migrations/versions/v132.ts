import type * as DatabaseTypes from '@/types';
import type { KasirkuDB } from '../../KasirkuDB';

interface LegacyMembershipContact {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
  is_active: boolean;
  is_member?: boolean;
  membership_number?: string;
  membership_status?: DatabaseTypes.RetailMembershipStatus;
  membership_joined_at?: string;
  membership_points_balance?: number;
  created_at: string;
  updated_at: string;
}

type LegacyMembershipPointTransaction = Omit<DatabaseTypes.MembershipPointTransaction, 'membership_id'> & {
  contact_id?: string;
  membership_id?: string;
};

export function registerMigrationV132(db: KasirkuDB) {
  db.version(132)
    .stores({
      memberships: 'id, contact_id, member_number, phone, status, is_active, sync_status, updated_at, created_at',
      membershipPointTransactions: 'id, membership_id, membership_number, transaction_id, transaction_number, type, created_at',
    })
    .upgrade(async (tx) => {
      const contacts = await tx.table<LegacyMembershipContact, string>('contacts').toArray();
      const memberships = tx.table<DatabaseTypes.Membership, string>('memberships');

      const backfilled: DatabaseTypes.Membership[] = contacts
        .filter((contact) => contact.is_member)
        .map((contact) => ({
          id: contact.id,
          contact_id: contact.id,
          member_number: contact.membership_number ?? `MBR-LEGACY-${contact.id.slice(0, 8).toUpperCase()}`,
          name: contact.name,
          phone: contact.phone ?? '',
          email: contact.email,
          status: contact.membership_status ?? 'ACTIVE',
          joined_at: contact.membership_joined_at ?? contact.created_at,
          points_balance: contact.membership_points_balance ?? 0,
          is_active: contact.is_active,
          created_at: contact.created_at,
          updated_at: contact.updated_at,
          sync_status: 'pending',
        }));

      if (backfilled.length > 0) {
        await memberships.bulkPut(backfilled);
      }

      const ledger = tx.table<LegacyMembershipPointTransaction, string>('membershipPointTransactions');
      const ledgerRows = await ledger.toArray();
      if (ledgerRows.length > 0) {
        await ledger.bulkPut(
          ledgerRows.map((row) => {
            const { contact_id, ...rest } = row;
            return { ...rest, membership_id: contact_id };
          }),
        );
      }
    });
}
