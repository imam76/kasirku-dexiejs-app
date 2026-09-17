export type DocumentSyncEntity = 'purchaseDocuments' | 'salesDocuments';
export type DocumentSyncIssueKind = 'missing_remote' | 'local_pending' | 'local_newer' | 'content_mismatch';

export interface DocumentSyncIssue {
  id: string;
  entity: DocumentSyncEntity;
  document_id: string;
  document_number: string;
  host_id: string;
  run_id: string;
  kind: DocumentSyncIssueKind | 'repaired';
  state: 'open' | 'repaired';
  checked_at: string;
  local_bundle: unknown;
  remote_bundle: unknown;
}

export interface DocumentSyncCheck {
  id: 'sales-purchase';
  run_id: string;
  host_id: string;
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at?: string;
  checked: number;
  repaired: number;
  issues: number;
  error?: string;
}
