import { db } from '@/lib/db';
import type { PurchaseDocument, SalesDocument } from '@/types';
import type { DocumentSyncCheck, DocumentSyncEntity, DocumentSyncIssue } from '@/types/documentSync';
import { assertCurrentHostIdentity } from '@/services/hostIdentityService';
import {
  isTauriRuntime, postgresAdapter, purchaseDocumentPostgresAdapter, salesDocumentPostgresAdapter,
  type RemotePurchaseDocumentBundleDto, type RemoteSalesDocumentBundleDto,
} from '@/services/postgresAdapter';
import {
  mapRemotePurchaseDocumentToLocal, mapRemotePurchaseDocumentItemToLocal,
  mergeRemotePurchaseDocumentBundlesIntoDexie,
} from '@/services/purchaseDocumentReadService';
import {
  mapRemoteSalesDocumentToLocal, mapRemoteSalesDocumentItemToLocal,
  mergeRemoteSalesDocumentBundlesIntoDexie,
} from '@/services/salesDocumentReadService';
import {
  mapPurchaseDocumentBundleToRemoteDto, mapSalesDocumentBundleToRemoteDto,
} from '@/services/syncQueueService';
import { classifyDocumentSync, type ComparableDocumentBundle } from '@/services/shared/documentSyncComparison';
import { pullUpdatedAtIdPages } from '@/services/shared/remoteRefreshCursor';

export const DOCUMENT_RECONCILIATION_INTERVAL_MS = 15 * 60_000;
const PAGE_SIZE = 100;
type RemoteBundle = RemotePurchaseDocumentBundleDto | RemoteSalesDocumentBundleDto;
let activeCheck: Promise<DocumentSyncCheck> | undefined;

const getAdapter = (entity: DocumentSyncEntity) => (
  entity === 'purchaseDocuments' ? purchaseDocumentPostgresAdapter : salesDocumentPostgresAdapter
);
const getItemsTable = (entity: DocumentSyncEntity) => (
  entity === 'purchaseDocuments' ? db.purchaseDocumentItems : db.salesDocumentItems
);

const readLocal = async (entity: DocumentSyncEntity, id: string) => {
  if (entity === 'purchaseDocuments') {
    const document = await db.purchaseDocuments.get(id);
    if (!document) return undefined;
    const items = await db.purchaseDocumentItems.where('document_id').equals(id).toArray();
    return { snapshot: { document, items }, comparable: mapPurchaseDocumentBundleToRemoteDto(document, items) };
  }
  const document = await db.salesDocuments.get(id);
  if (!document) return undefined;
  const items = await db.salesDocumentItems.where('document_id').equals(id).toArray();
  return { snapshot: { document, items }, comparable: mapSalesDocumentBundleToRemoteDto(document, items) };
};

// Compare only fields covered by the current sync contract, using the same
// default/optional-value normalization on each side.
const remoteComparable = (entity: DocumentSyncEntity, remote: RemoteBundle): ComparableDocumentBundle => {
  if (entity === 'purchaseDocuments') {
    const bundle = remote as RemotePurchaseDocumentBundleDto;
    return mapPurchaseDocumentBundleToRemoteDto(
      mapRemotePurchaseDocumentToLocal(bundle.document, ''),
      bundle.items.map(mapRemotePurchaseDocumentItemToLocal),
    );
  }
  const bundle = remote as RemoteSalesDocumentBundleDto;
  return mapSalesDocumentBundleToRemoteDto(
    mapRemoteSalesDocumentToLocal(bundle.document, ''),
    bundle.items.map(mapRemoteSalesDocumentItemToLocal),
  );
};

const inspectBundle = async (
  entity: DocumentSyncEntity,
  id: string,
  remote: RemoteBundle | null,
  check: DocumentSyncCheck,
) => {
  // The reread, backup, pending check and merge share one transaction. An edit
  // made while the network request is running cannot be overwritten by a stale read.
  await db.transaction('rw', [
    db[entity], getItemsTable(entity), db.syncQueue, db.documentSyncIssues,
  ], async () => {
    const local = await readLocal(entity, id);
    const activeQueue = await db.syncQueue.where('entity_id').equals(id)
      .filter((item) => item.entity === entity && item.status !== 'synced').count();
    const status = local?.snapshot.document.sync_status;
    const decision = classifyDocumentSync(
      local?.comparable,
      remote ? remoteComparable(entity, remote) : null,
      activeQueue > 0 || status === 'pending' || status === 'failed',
    );
    const issueId = `${check.host_id}:${entity}:${id}`;
    check.checked += 1;
    if (decision === 'equal') {
      // Keep any previous snapshots as audit evidence, but close resolved issues.
      await db.documentSyncIssues.update(issueId, { state: 'repaired' });
      return;
    }

    const issue: DocumentSyncIssue = {
      id: issueId, entity, document_id: id,
      document_number: local?.snapshot.document.document_number ?? remote!.document.document_number,
      host_id: check.host_id, run_id: check.run_id,
      kind: decision === 'pull' ? 'repaired' : decision,
      state: decision === 'pull' ? 'repaired' : 'open',
      checked_at: new Date().toISOString(),
      local_bundle: local?.snapshot ?? null, remote_bundle: remote,
    };
    await db.documentSyncIssues.put(issue);
    if (decision !== 'pull' || !remote) {
      check.issues += 1;
      return;
    }
    const merged = entity === 'purchaseDocuments'
      ? await mergeRemotePurchaseDocumentBundlesIntoDexie([remote as RemotePurchaseDocumentBundleDto])
      : await mergeRemoteSalesDocumentBundlesIntoDexie([remote as RemoteSalesDocumentBundleDto]);
    if (merged.skipped > 0) throw new Error('Dokumen berubah saat pemeriksaan. Jalankan pemeriksaan ulang.');
    check.repaired += merged.inserted + merged.updated;
  });
};

const runCheck = async (): Promise<DocumentSyncCheck> => {
  if (!isTauriRuntime()) throw new Error('Pemeriksaan memerlukan aplikasi desktop dan koneksi PostgreSQL.');
  const health = await postgresAdapter.healthCheck();
  if (!health.available) throw new Error(health.message || 'PostgreSQL belum tersedia.');
  const hostId = await assertCurrentHostIdentity();
  const check: DocumentSyncCheck = {
    id: 'sales-purchase', run_id: crypto.randomUUID(), host_id: hostId,
    status: 'running', started_at: new Date().toISOString(), checked: 0, repaired: 0, issues: 0,
  };
  await db.documentSyncChecks.put(check);
  try {
    for (const entity of ['purchaseDocuments', 'salesDocuments'] as const) {
      const seen = new Set<string>();
      const adapter = getAdapter(entity);
      // Deliberately starts at the beginning on EVERY run. The ordinary delta
      // cursor is never reset/advanced: late arrivals behind it remain discoverable.
      await pullUpdatedAtIdPages<RemoteBundle>({
        pageSize: PAGE_SIZE,
        loadPage: async (cursor) => {
          await assertCurrentHostIdentity(hostId);
          return adapter.list({ updatedAfter: cursor?.updatedAt, cursorId: cursor?.id, limit: PAGE_SIZE });
        },
        mergePage: async (bundles) => {
          await assertCurrentHostIdentity(hostId);
          for (const bundle of bundles) {
            seen.add(bundle.document.id);
            await inspectBundle(entity, bundle.document.id, bundle, check);
          }
          await db.documentSyncChecks.put(check);
        },
        saveCursor: async () => {},
        getId: (bundle) => bundle.document.id,
        getUpdatedAt: (bundle) => bundle.document.updated_at,
      });

      // Check local-only records, INCLUDING synced records. Confirm absence by ID
      // because a concurrent upload can move behind the scan's page boundary.
      let lastId: string | undefined;
      while (true) {
        const rows: (PurchaseDocument | SalesDocument)[] = await (lastId === undefined
          ? db[entity].orderBy('id') : db[entity].where('id').above(lastId)).limit(PAGE_SIZE).toArray();
        if (rows.length === 0) break;
        await assertCurrentHostIdentity(hostId);
        for (const row of rows) {
          if (!seen.has(row.id)) {
            const remote = await adapter.get(row.id);
            await assertCurrentHostIdentity(hostId);
            await inspectBundle(entity, row.id, remote, check);
          }
        }
        lastId = rows[rows.length - 1].id;
        await db.documentSyncChecks.put(check);
      }
    }
    await assertCurrentHostIdentity(hostId);
    check.status = 'completed';
    check.completed_at = new Date().toISOString();
    await db.documentSyncChecks.put(check);
    return check;
  } catch (error) {
    check.status = 'failed';
    check.error = error instanceof Error ? error.message : String(error);
    await db.documentSyncChecks.put(check);
    throw error;
  }
};

/** Concurrent manual/automatic callers await the same scan, never a false empty success. */
export const reconcileSalesPurchaseDocuments = (): Promise<DocumentSyncCheck> => {
  if (!activeCheck) activeCheck = runCheck().finally(() => { activeCheck = undefined; });
  return activeCheck;
};

export const reconcileSalesPurchaseDocumentsIfDue = async () => {
  if (activeCheck) return activeCheck;
  const last = await db.documentSyncChecks.get('sales-purchase');
  if (last?.status === 'completed' && last.completed_at
    && Date.now() - Date.parse(last.completed_at) < DOCUMENT_RECONCILIATION_INTERVAL_MS) return;
  return reconcileSalesPurchaseDocuments();
};
