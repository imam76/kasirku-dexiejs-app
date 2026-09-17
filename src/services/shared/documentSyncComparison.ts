import type { DocumentSyncIssueKind } from '@/types/documentSync';

interface DocumentRevision {
  id: string;
  version?: number;
  updated_at: string;
  status: string;
}

export interface ComparableDocumentBundle {
  document: DocumentRevision;
  items: { id: string }[];
}

// DTOs use null for absent fields and PostgreSQL can return equivalent timestamp
// offsets. Item order is not identity; sort_order, when present, remains data.
const canonicalize = (value: unknown, key = ''): unknown => {
  if (value == null) return undefined;
  if (typeof value === 'string' && key.endsWith('_at')) {
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? value : new Date(timestamp).toISOString();
  }
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item != null)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([field, item]) => [field, canonicalize(item, field)]));
  }
  return value;
};

export const sameDocumentSyncContent = (left: unknown, right: unknown) => (
  JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right))
);

export const sameDocumentRevision = (left: DocumentRevision, right: DocumentRevision) => (
  left.id === right.id
  && (left.version ?? 1) === (right.version ?? 1)
  && left.status === right.status
  && Date.parse(left.updated_at) === Date.parse(right.updated_at)
);

export const classifyDocumentSync = (
  local: ComparableDocumentBundle | undefined,
  remote: ComparableDocumentBundle | null,
  hasPendingChanges: boolean,
): 'equal' | 'pull' | DocumentSyncIssueKind => {
  if (!local) return remote ? 'pull' : 'equal';
  // Even identical content must not clear an active upload or its metadata.
  if (hasPendingChanges) return 'local_pending';
  if (!remote) return 'missing_remote';

  const localVersion = local.document.version ?? 1;
  const remoteVersion = remote.document.version ?? 1;
  if (remoteVersion !== localVersion) return remoteVersion > localVersion ? 'pull' : 'local_newer';
  const localTime = Date.parse(local.document.updated_at);
  const remoteTime = Date.parse(remote.document.updated_at);
  if (remoteTime !== localTime) {
    if (!Number.isFinite(localTime) || !Number.isFinite(remoteTime)) return 'content_mismatch';
    return remoteTime > localTime ? 'pull' : 'local_newer';
  }
  if (!sameDocumentSyncContent(local.document, remote.document)) return 'content_mismatch';

  const remoteItems = new Map(remote.items.map((item) => [item.id, item]));
  if (new Set(local.items.map((item) => item.id)).size !== local.items.length
    || remoteItems.size !== remote.items.length) return 'content_mismatch';
  // Restore missing local lines only when every surviving line agrees. A remote
  // bundle missing local lines could be a restore/partial upload: preserve both.
  if (!local.items.every((item) => sameDocumentSyncContent(item, remoteItems.get(item.id)))) {
    return 'content_mismatch';
  }
  return local.items.length < remote.items.length ? 'pull' : 'equal';
};
