import { db } from '@/lib/db';
import {
  cooperativeCollectionEventPostgresAdapter,
  type RemoteCooperativeLoanCollectionEventDto,
} from '@/services/postgresAdapter';
import type { CooperativeLoanCollectionEvent } from '@/types';

const optionalString = (value: string | null | undefined) => value ?? undefined;

export const mapRemoteCooperativeCollectionEventToLocal = (
  remoteEvent: RemoteCooperativeLoanCollectionEventDto,
  syncedAt = new Date().toISOString(),
): CooperativeLoanCollectionEvent => ({
  id: remoteEvent.id,
  installment_id: remoteEvent.installment_id,
  loan_id: remoteEvent.loan_id,
  loan_number: remoteEvent.loan_number,
  member_id: remoteEvent.member_id,
  member_number: remoteEvent.member_number,
  member_name: remoteEvent.member_name,
  collection_status: remoteEvent.collection_status,
  follow_up_date: optionalString(remoteEvent.follow_up_date),
  collection_notes: remoteEvent.collection_notes,
  contacted_at: remoteEvent.contacted_at,
  actor_user_id: optionalString(remoteEvent.actor_user_id),
  actor_user_name: optionalString(remoteEvent.actor_user_name),
  actor_employee_id: optionalString(remoteEvent.actor_employee_id),
  created_at: remoteEvent.created_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteEvent.created_at,
});

export const mergeRemoteCooperativeCollectionEventsIntoDexie = async (
  remoteEvents: RemoteCooperativeLoanCollectionEventDto[],
  syncedAt = new Date().toISOString(),
) => {
  if (remoteEvents.length === 0) return;

  await db.cooperativeLoanCollectionEvents.bulkPut(
    remoteEvents.map((event) => mapRemoteCooperativeCollectionEventToLocal(event, syncedAt)),
  );
};

export const refreshCooperativeCollectionEventsFromPostgres = async () => {
  const remoteEvents = await cooperativeCollectionEventPostgresAdapter.list();
  await mergeRemoteCooperativeCollectionEventsIntoDexie(remoteEvents);
  return remoteEvents.length;
};
