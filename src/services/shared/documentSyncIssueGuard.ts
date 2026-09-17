import { db } from '@/lib/db';
import type { DocumentSyncEntity } from '@/types/documentSync';

/** Normal delta/realtime pulls must not silently erase a discrepancy awaiting review. */
export const hasOpenDocumentSyncConflict = async (entity: DocumentSyncEntity, id: string) => {
  const conflicts = await db.documentSyncIssues.where('document_id').equals(id)
    .filter((issue) => issue.entity === entity && issue.state === 'open' && issue.kind !== 'local_pending')
    .count();
  if (conflicts > 0) return true;
  return (await db.syncQueue.where('entity_id').equals(id)
    .filter((item) => item.entity === entity && item.status !== 'synced').count()) > 0;
};
