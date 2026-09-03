import { getPurchaseDocumentPermission } from '@/auth/documentPermissions';
import type { Permission, PurchaseDocument, PurchaseDocumentType } from '@/types';

export type PurchaseDocumentActionSurface = 'detail-toolbar' | 'list-menu' | 'context-menu';

export type PurchaseDocumentActionId =
  | 'view'
  | 'edit'
  | 'issue'
  | 'reconcile-cost'
  | 'update-sell-prices'
  | 'correct'
  | 'void'
  | `convert-${PurchaseDocumentType}`;

export type PurchaseDocumentActionGroup = 'primary' | 'secondary' | 'danger';

export interface PurchaseDocumentActionDefinition {
  id: PurchaseDocumentActionId;
  group: PurchaseDocumentActionGroup;
  surfaces: PurchaseDocumentActionSurface[];
  targetType?: PurchaseDocumentType;
}

export interface PurchaseDocumentActionPolicyContext {
  document: PurchaseDocument;
  can: (permission: Permission) => boolean;
}

const conversionTargets: Record<PurchaseDocumentType, PurchaseDocumentType[]> = {
  PURCHASE_REQUEST: ['REQUEST_FOR_QUOTATION', 'PURCHASE_ORDER'],
  REQUEST_FOR_QUOTATION: ['PURCHASE_ORDER'],
  PURCHASE_ORDER: ['PURCHASE_RECEIPT'],
  PURCHASE_RECEIPT: ['PURCHASE_INVOICE', 'PURCHASE_RETURN'],
  PURCHASE_INVOICE: ['PURCHASE_RETURN'],
  PURCHASE_RETURN: [],
};

const allActionSurfaces: PurchaseDocumentActionSurface[] = [
  'detail-toolbar',
  'list-menu',
  'context-menu',
];

/**
 * Satu sumber aturan action Purchase Document. Renderer (toolbar, tombol More,
 * atau context menu) cukup memilih surface yang ingin ditampilkan tanpa
 * mengulang aturan status dan permission di masing-masing halaman.
 */
export const getPurchaseDocumentActionDefinitions = ({
  document,
  can,
}: PurchaseDocumentActionPolicyContext): PurchaseDocumentActionDefinition[] => {
  const canManageDocument = can(getPurchaseDocumentPermission(document.type));
  const hasInvoicePayment = document.type === 'PURCHASE_INVOICE'
    && Boolean(document.finance_transaction_id || Number(document.paid_amount || 0) > 0);
  const canVoid = canManageDocument
    && (document.status === 'DRAFT' || document.status === 'ISSUED')
    && !hasInvoicePayment;
  const canCorrect = canManageDocument && document.status === 'ISSUED' && !hasInvoicePayment;

  const actions: PurchaseDocumentActionDefinition[] = [
    {
      id: 'view',
      group: 'primary',
      surfaces: ['list-menu', 'context-menu'],
    },
  ];

  if (canManageDocument && document.status === 'DRAFT') {
    actions.push(
      { id: 'edit', group: 'primary', surfaces: allActionSurfaces },
      { id: 'issue', group: 'primary', surfaces: allActionSurfaces },
    );
  }

  if (
    can('PURCHASE_RECEIPT_MANAGE')
    && document.type === 'PURCHASE_RECEIPT'
    && document.status === 'ISSUED'
    && (document.cost_status ?? 'FINAL') !== 'FINAL'
  ) {
    actions.push({ id: 'reconcile-cost', group: 'primary', surfaces: allActionSurfaces });
  }

  if (
    can('PRODUCT_MANAGE')
    && document.type === 'PURCHASE_INVOICE'
    && document.status === 'ISSUED'
  ) {
    actions.push({ id: 'update-sell-prices', group: 'secondary', surfaces: allActionSurfaces });
  }

  if (canManageDocument && document.status === 'ISSUED') {
    conversionTargets[document.type]
      .filter((targetType) => can(getPurchaseDocumentPermission(targetType)))
      .forEach((targetType) => {
        actions.push({
          id: `convert-${targetType}`,
          group: 'primary',
          surfaces: allActionSurfaces,
          targetType,
        });
      });
  }

  if (canCorrect) {
    actions.push({ id: 'correct', group: 'secondary', surfaces: allActionSurfaces });
  }

  if (canVoid) {
    actions.push({ id: 'void', group: 'danger', surfaces: allActionSurfaces });
  }

  return actions;
};

export const getPurchaseDocumentActionsForSurface = (
  context: PurchaseDocumentActionPolicyContext,
  surface: PurchaseDocumentActionSurface,
) => getPurchaseDocumentActionDefinitions(context)
  .filter((action) => action.surfaces.includes(surface));
