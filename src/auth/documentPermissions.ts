import {
  getSalesDocumentTypeFromPathSegment,
} from '@/configs/sales-document';
import {
  getPurchaseDocumentTypeFromPathSegment,
} from '@/configs/purchase-document';
import type {
  Permission,
  PurchaseDocumentType,
  SalesDocumentType,
} from '@/types';

export const SALES_DOCUMENT_PERMISSIONS: Record<SalesDocumentType, Permission> = {
  SALES_QUOTATION: 'SALES_QUOTATION_MANAGE',
  SALES_ORDER: 'SALES_ORDER_MANAGE',
  SALES_DELIVERY: 'SALES_DELIVERY_MANAGE',
  SALES_INVOICE: 'SALES_INVOICE_MANAGE',
};

export const PURCHASE_DOCUMENT_PERMISSIONS: Record<PurchaseDocumentType, Permission> = {
  PURCHASE_REQUEST: 'PURCHASE_REQUEST_MANAGE',
  REQUEST_FOR_QUOTATION: 'PURCHASE_RFQ_MANAGE',
  PURCHASE_ORDER: 'PURCHASE_ORDER_MANAGE',
  PURCHASE_RECEIPT: 'PURCHASE_RECEIPT_MANAGE',
  PURCHASE_INVOICE: 'PURCHASE_INVOICE_MANAGE',
  PURCHASE_RETURN: 'PURCHASE_RETURN_MANAGE',
};

export const SALES_DOCUMENT_PERMISSION_LIST = Object.values(SALES_DOCUMENT_PERMISSIONS);
export const PURCHASE_DOCUMENT_PERMISSION_LIST = Object.values(PURCHASE_DOCUMENT_PERMISSIONS);

export const getSalesDocumentPermission = (type: SalesDocumentType) => (
  SALES_DOCUMENT_PERMISSIONS[type]
);

export const getPurchaseDocumentPermission = (type: PurchaseDocumentType) => (
  PURCHASE_DOCUMENT_PERMISSIONS[type]
);

const SALES_DOCUMENT_MODULES: Record<SalesDocumentType, string> = {
  SALES_QUOTATION: 'SALES_QUOTATION',
  SALES_ORDER: 'SALES_ORDER',
  SALES_DELIVERY: 'SALES_DELIVERY',
  SALES_INVOICE: 'SALES_INVOICE',
};

const PURCHASE_DOCUMENT_MODULES: Record<PurchaseDocumentType, string> = {
  PURCHASE_REQUEST: 'PURCHASE_REQUEST',
  REQUEST_FOR_QUOTATION: 'PURCHASE_RFQ',
  PURCHASE_ORDER: 'PURCHASE_ORDER',
  PURCHASE_RECEIPT: 'PURCHASE_RECEIPT',
  PURCHASE_INVOICE: 'PURCHASE_INVOICE',
  PURCHASE_RETURN: 'PURCHASE_RETURN',
};

const normalizeSegments = (path: string) => (
  path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)
);

const getDocumentPathContext = (path: string) => {
  const segments = normalizeSegments(path);

  if (segments[0] === 'sales') {
    return { family: 'sales' as const, documentTypeSegment: segments[1] };
  }
  if (segments[0] === 'purchases') {
    return { family: 'purchases' as const, documentTypeSegment: segments[1] };
  }
  if (segments[0] === 'finance' && segments[1] === 'sales') {
    return { family: 'sales' as const, documentTypeSegment: segments[2] };
  }
  if (segments[0] === 'finance' && segments[1] === 'purchases') {
    return { family: 'purchases' as const, documentTypeSegment: segments[2] };
  }

  return undefined;
};

export const getDocumentPermissionRuleForPath = (
  path: string,
): Permission | Permission[] | undefined => {
  const context = getDocumentPathContext(path);
  if (!context) return undefined;

  if (!context.documentTypeSegment) {
    return context.family === 'sales'
      ? [...SALES_DOCUMENT_PERMISSION_LIST, 'SALES_RETURN_MANAGE']
      : PURCHASE_DOCUMENT_PERMISSION_LIST;
  }

  if (context.family === 'sales') {
    if (context.documentTypeSegment.toLowerCase() === 'returns') {
      return 'SALES_RETURN_MANAGE';
    }
    const type = getSalesDocumentTypeFromPathSegment(context.documentTypeSegment);
    return type ? getSalesDocumentPermission(type) : undefined;
  }

  if (context.documentTypeSegment.toLowerCase() === 'pending-costs') {
    return 'PURCHASE_RECEIPT_MANAGE';
  }
  const type = getPurchaseDocumentTypeFromPathSegment(context.documentTypeSegment);
  return type ? getPurchaseDocumentPermission(type) : undefined;
};

export const getDocumentModuleCodesForPath = (path: string): string[] | undefined => {
  const context = getDocumentPathContext(path);
  if (!context) return undefined;

  if (!context.documentTypeSegment) {
    return context.family === 'sales'
      ? [...Object.values(SALES_DOCUMENT_MODULES), 'SALES_RETURN']
      : Object.values(PURCHASE_DOCUMENT_MODULES);
  }

  if (context.family === 'sales') {
    if (context.documentTypeSegment.toLowerCase() === 'returns') {
      return ['SALES_RETURN'];
    }
    const type = getSalesDocumentTypeFromPathSegment(context.documentTypeSegment);
    return type ? [SALES_DOCUMENT_MODULES[type]] : undefined;
  }

  if (context.documentTypeSegment.toLowerCase() === 'pending-costs') {
    return ['PURCHASE_RECEIPT'];
  }
  const type = getPurchaseDocumentTypeFromPathSegment(context.documentTypeSegment);
  return type ? [PURCHASE_DOCUMENT_MODULES[type]] : undefined;
};
