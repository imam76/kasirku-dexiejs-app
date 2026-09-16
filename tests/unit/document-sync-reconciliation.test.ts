import { describe, expect, test } from 'bun:test';
import { classifyDocumentSync, sameDocumentRevision, sameDocumentSyncContent } from '@/services/shared/documentSyncComparison';

const document = { id: 'invoice', version: 2, status: 'ISSUED', updated_at: '2026-09-16T03:00:00.000Z' };
const line = { id: 'line-1', quantity: 2, price: 15_000 };
const bundle = { document, items: [line] };

describe('sales/purchase reconciliation decisions', () => {
  test('repairs absent local documents and lines, independent of delta cursor', () => {
    expect(classifyDocumentSync(undefined, bundle, false)).toBe('pull');
    expect(classifyDocumentSync({ ...bundle, items: [] }, bundle, false)).toBe('pull');
  });

  test('protects pending/failed/processing changes even when the server agrees', () => {
    expect(classifyDocumentSync(bundle, bundle, true)).toBe('local_pending');
    expect(classifyDocumentSync(bundle, null, true)).toBe('local_pending');
    expect(classifyDocumentSync(bundle, { ...bundle, document: { ...document, version: 3 } }, true)).toBe('local_pending');
  });

  test('does not upload synced local rows missing on server or discard extra local lines', () => {
    expect(classifyDocumentSync(bundle, null, false)).toBe('missing_remote');
    expect(classifyDocumentSync(bundle, { ...bundle, items: [] }, false)).toBe('content_mismatch');
  });

  test('detects same-revision content conflicts and local-ahead revisions', () => {
    expect(classifyDocumentSync(bundle, { ...bundle, items: [{ ...line, quantity: 3 }] }, false)).toBe('content_mismatch');
    expect(classifyDocumentSync(bundle, { ...bundle, document: { ...document, status: 'DRAFT' } }, false)).toBe('content_mismatch');
    expect(classifyDocumentSync(bundle, { ...bundle, document: { ...document, version: 1 } }, false)).toBe('local_newer');
    expect(classifyDocumentSync(bundle, { ...bundle, document: { ...document, version: 3 } }, false)).toBe('pull');
  });

  test('normalizes timestamp offsets, optional fields, key order and item order', () => {
    const remote = { document: { ...document, notes: null, updated_at: '2026-09-16T10:00:00+07:00' }, items: [line] };
    expect(classifyDocumentSync(bundle, remote, false)).toBe('equal');
    expect(sameDocumentRevision(document, remote.document)).toBe(true);
    expect(sameDocumentSyncContent({ price: 10, name: 'a' }, { name: 'a', price: 10 })).toBe(true);
    const second = { ...line, id: 'line-2' };
    expect(classifyDocumentSync({ ...bundle, items: [second, line] }, { ...bundle, items: [line, second] }, false)).toBe('equal');
  });

  test('rejects duplicate lines and mismatched upload acknowledgements', () => {
    expect(classifyDocumentSync(bundle, { ...bundle, items: [line, line] }, false)).toBe('content_mismatch');
    expect(sameDocumentRevision(document, { ...document, version: 3 })).toBe(false);
    expect(sameDocumentRevision(document, { ...document, updated_at: '2026-09-16T03:05:00Z' })).toBe(false);
  });
});
