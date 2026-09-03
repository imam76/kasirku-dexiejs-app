import { describe, expect, test } from 'bun:test';
import type { Permission, PurchaseDocument } from '@/types';
import {
  getPurchaseDocumentActionDefinitions,
  getPurchaseDocumentActionsForSurface,
} from '@/utils/purchaseDocuments/actions';

const createDocument = (overrides: Partial<PurchaseDocument> = {}): PurchaseDocument => ({
  id: 'purchase-document-1',
  document_number: 'GR-20260903-0004',
  type: 'PURCHASE_RECEIPT',
  status: 'ISSUED',
  document_date: '2026-09-03',
  created_at: '2026-09-03T00:00:00.000Z',
  updated_at: '2026-09-03T00:00:00.000Z',
  ...overrides,
});

const actionIds = (document: PurchaseDocument, permissions: Permission[]) => (
  getPurchaseDocumentActionDefinitions({
    document,
    can: (permission) => permissions.includes(permission),
  }).map((action) => action.id)
);

describe('purchase document action policy', () => {
  test('receipt terbit dengan HPP belum final menampilkan aksi rekonsiliasi dan convert yang valid', () => {
    const document = createDocument({ cost_status: 'ESTIMATED' });

    expect(actionIds(document, [
      'PURCHASE_RECEIPT_MANAGE',
      'PURCHASE_INVOICE_MANAGE',
      'PURCHASE_RETURN_MANAGE',
    ])).toEqual([
      'view',
      'reconcile-cost',
      'convert-PURCHASE_INVOICE',
      'convert-PURCHASE_RETURN',
      'correct',
      'void',
    ]);
  });

  test('receipt dengan HPP final tidak menawarkan rekonsiliasi lagi', () => {
    const document = createDocument({ cost_status: 'FINAL' });

    expect(actionIds(document, [
      'PURCHASE_RECEIPT_MANAGE',
      'PURCHASE_INVOICE_MANAGE',
      'PURCHASE_RETURN_MANAGE',
    ])).not.toContain('reconcile-cost');
  });

  test('invoice yang sudah dibayar menyembunyikan action koreksi dan void', () => {
    const document = createDocument({
      type: 'PURCHASE_INVOICE',
      paid_amount: 92_000,
    });

    const actions = actionIds(document, [
      'PURCHASE_INVOICE_MANAGE',
      'PURCHASE_RETURN_MANAGE',
      'PRODUCT_MANAGE',
    ]);

    expect(actions).toContain('update-sell-prices');
    expect(actions).toContain('convert-PURCHASE_RETURN');
    expect(actions).not.toContain('correct');
    expect(actions).not.toContain('void');
  });

  test('draft hanya menyediakan edit, terbitkan, dan void; detail tidak masuk ke toolbar', () => {
    const document = createDocument({ status: 'DRAFT' });
    const permissions: Permission[] = ['PURCHASE_RECEIPT_MANAGE'];

    expect(actionIds(document, permissions)).toEqual(['view', 'edit', 'issue', 'void']);
    expect(getPurchaseDocumentActionsForSurface({
      document,
      can: (permission) => permissions.includes(permission),
    }, 'detail-toolbar').map((action) => action.id)).toEqual(['edit', 'issue', 'void']);
  });
});
