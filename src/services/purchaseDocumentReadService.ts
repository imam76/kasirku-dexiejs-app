import { db } from '@/lib/db';
import {
  isTauriRuntime,
  purchaseDocumentPostgresAdapter,
  type RemotePurchaseDocumentBundleDto,
  type RemotePurchaseDocumentDto,
  type RemotePurchaseDocumentItemDto,
} from '@/services/postgresAdapter';
import type {
  PaymentMethod,
  ProductUnit,
  PromoType,
  PurchaseDocument,
  PurchaseDocumentItem,
  PurchaseDocumentStatus,
  PurchaseDocumentType,
  PurchaseInvoicePaymentStatus,
  TaxCalculationMode,
} from '@/types';

export interface PurchaseDocumentReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

const EMPTY_PURCHASE_DOCUMENT_READ_SYNC_RESULT: PurchaseDocumentReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
};

const VALID_PURCHASE_DOCUMENT_TYPES: PurchaseDocumentType[] = [
  'PURCHASE_REQUEST',
  'REQUEST_FOR_QUOTATION',
  'PURCHASE_ORDER',
  'PURCHASE_RECEIPT',
  'PURCHASE_INVOICE',
  'PURCHASE_RETURN',
];

const VALID_PURCHASE_DOCUMENT_STATUSES: PurchaseDocumentStatus[] = [
  'DRAFT',
  'ISSUED',
  'CONVERTED',
  'VOIDED',
];

const VALID_PAYMENT_STATUSES: PurchaseInvoicePaymentStatus[] = ['UNPAID', 'PARTIAL', 'PAID'];
const VALID_PROMO_TYPES: PromoType[] = ['percent', 'fixed'];
const VALID_TAX_CALCULATION_MODES: TaxCalculationMode[] = ['EXCLUSIVE', 'INCLUSIVE'];
const VALID_PAYMENT_METHODS: PaymentMethod[] = ['TUNAI', 'NON_TUNAI'];

let isRefreshingPurchaseDocumentsFromPostgres = false;

const optionalString = (value: string | null | undefined) => value ?? undefined;
const optionalNumber = (value: number | null | undefined) => (
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
);

const isPurchaseDocumentType = (type: string): type is PurchaseDocumentType => (
  VALID_PURCHASE_DOCUMENT_TYPES.includes(type as PurchaseDocumentType)
);

const isPurchaseDocumentStatus = (status: string): status is PurchaseDocumentStatus => (
  VALID_PURCHASE_DOCUMENT_STATUSES.includes(status as PurchaseDocumentStatus)
);

const isPaymentStatus = (status: string | null | undefined): status is PurchaseInvoicePaymentStatus => (
  Boolean(status) && VALID_PAYMENT_STATUSES.includes(status as PurchaseInvoicePaymentStatus)
);

const isPromoType = (type: string | null | undefined): type is PromoType => (
  Boolean(type) && VALID_PROMO_TYPES.includes(type as PromoType)
);

const isTaxCalculationMode = (mode: string | null | undefined): mode is TaxCalculationMode => (
  Boolean(mode) && VALID_TAX_CALCULATION_MODES.includes(mode as TaxCalculationMode)
);

const isPaymentMethod = (method: string | null | undefined): method is PaymentMethod => (
  Boolean(method) && VALID_PAYMENT_METHODS.includes(method as PaymentMethod)
);

const toPositiveVersion = (version: number | null | undefined) => (
  typeof version === 'number' && Number.isFinite(version) && version > 0 ? version : 1
);

const mapRemotePurchaseDocumentToLocal = (
  remoteDocument: RemotePurchaseDocumentDto,
  syncedAt: string,
): PurchaseDocument => ({
  id: remoteDocument.id,
  document_number: remoteDocument.document_number,
  type: isPurchaseDocumentType(remoteDocument.type) ? remoteDocument.type : 'PURCHASE_REQUEST',
  status: isPurchaseDocumentStatus(remoteDocument.status) ? remoteDocument.status : 'DRAFT',
  contact_id: optionalString(remoteDocument.contact_id),
  supplier_name: optionalString(remoteDocument.supplier_name),
  supplier_phone: optionalString(remoteDocument.supplier_phone),
  supplier_email: optionalString(remoteDocument.supplier_email),
  supplier_address: optionalString(remoteDocument.supplier_address),
  supplier_company_name: optionalString(remoteDocument.supplier_company_name),
  supplier_tax_number: optionalString(remoteDocument.supplier_tax_number),
  department_id: optionalString(remoteDocument.department_id),
  department_code: optionalString(remoteDocument.department_code),
  department_name: optionalString(remoteDocument.department_name),
  project_id: optionalString(remoteDocument.project_id),
  project_code: optionalString(remoteDocument.project_code),
  project_name: optionalString(remoteDocument.project_name),
  document_date: remoteDocument.document_date,
  required_date: optionalString(remoteDocument.required_date),
  quotation_due_date: optionalString(remoteDocument.quotation_due_date),
  due_date: optionalString(remoteDocument.due_date),
  warehouse_id: optionalString(remoteDocument.warehouse_id),
  warehouse_code: optionalString(remoteDocument.warehouse_code),
  warehouse_name: optionalString(remoteDocument.warehouse_name),
  source_document_id: optionalString(remoteDocument.source_document_id),
  source_document_number: optionalString(remoteDocument.source_document_number),
  source_document_type: remoteDocument.source_document_type && isPurchaseDocumentType(remoteDocument.source_document_type)
    ? remoteDocument.source_document_type
    : undefined,
  currency_code: optionalString(remoteDocument.currency_code),
  currency_name: optionalString(remoteDocument.currency_name),
  currency_symbol: optionalString(remoteDocument.currency_symbol),
  base_currency_code: optionalString(remoteDocument.base_currency_code),
  exchange_rate: optionalNumber(remoteDocument.exchange_rate),
  exchange_rate_source: remoteDocument.exchange_rate_source ?? undefined,
  exchange_rate_basis: remoteDocument.exchange_rate_basis ?? undefined,
  exchange_rate_date: optionalString(remoteDocument.exchange_rate_date),
  subtotal_amount: optionalNumber(remoteDocument.subtotal_amount),
  foreign_subtotal_amount: optionalNumber(remoteDocument.foreign_subtotal_amount),
  discount_type: isPromoType(remoteDocument.discount_type) ? remoteDocument.discount_type : undefined,
  discount_value: optionalNumber(remoteDocument.discount_value),
  discount_amount: optionalNumber(remoteDocument.discount_amount),
  foreign_discount_amount: optionalNumber(remoteDocument.foreign_discount_amount),
  discount_account_id: optionalString(remoteDocument.discount_account_id),
  discount_account_code: optionalString(remoteDocument.discount_account_code),
  discount_account_name: optionalString(remoteDocument.discount_account_name),
  tax_id: optionalString(remoteDocument.tax_id),
  tax_name: optionalString(remoteDocument.tax_name),
  tax_code: optionalString(remoteDocument.tax_code),
  tax_rate: optionalNumber(remoteDocument.tax_rate),
  tax_calculation_mode: isTaxCalculationMode(remoteDocument.tax_calculation_mode)
    ? remoteDocument.tax_calculation_mode
    : undefined,
  tax_amount: optionalNumber(remoteDocument.tax_amount),
  foreign_tax_amount: optionalNumber(remoteDocument.foreign_tax_amount),
  total_amount: optionalNumber(remoteDocument.total_amount),
  foreign_total_amount: optionalNumber(remoteDocument.foreign_total_amount),
  payment_status: isPaymentStatus(remoteDocument.payment_status) ? remoteDocument.payment_status : undefined,
  paid_amount: optionalNumber(remoteDocument.paid_amount),
  paid_at: optionalString(remoteDocument.paid_at),
  payment_method: isPaymentMethod(remoteDocument.payment_method) ? remoteDocument.payment_method : undefined,
  cash_account_id: optionalString(remoteDocument.cash_account_id),
  cash_account_code: optionalString(remoteDocument.cash_account_code),
  cash_account_name: optionalString(remoteDocument.cash_account_name),
  finance_transaction_id: optionalString(remoteDocument.finance_transaction_id),
  notes: optionalString(remoteDocument.notes),
  cost_status: remoteDocument.cost_status ?? undefined,
  delivery_note_number: optionalString(remoteDocument.delivery_note_number),
  delivery_note_date: optionalString(remoteDocument.delivery_note_date),
  supplier_invoice_number: optionalString(remoteDocument.supplier_invoice_number),
  supplier_invoice_date: optionalString(remoteDocument.supplier_invoice_date),
  additional_cost_treatment: remoteDocument.additional_cost_treatment ?? undefined,
  additional_cost_amount: optionalNumber(remoteDocument.additional_cost_amount),
  supplier_discount_amount: optionalNumber(remoteDocument.supplier_discount_amount),
  supplier_tax_amount: optionalNumber(remoteDocument.supplier_tax_amount),
  cost_finalized_at: optionalString(remoteDocument.cost_finalized_at),
  cost_finalized_by: optionalString(remoteDocument.cost_finalized_by),
  cost_finalized_by_name: optionalString(remoteDocument.cost_finalized_by_name),
  issued_at: optionalString(remoteDocument.issued_at),
  voided_at: optionalString(remoteDocument.voided_at),
  void_reason: optionalString(remoteDocument.void_reason),
  version: toPositiveVersion(remoteDocument.version),
  created_by: optionalString(remoteDocument.created_by),
  created_by_name: optionalString(remoteDocument.created_by_name),
  updated_by: optionalString(remoteDocument.updated_by),
  updated_by_name: optionalString(remoteDocument.updated_by_name),
  created_at: remoteDocument.created_at,
  updated_at: remoteDocument.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteDocument.updated_at,
});

const mapRemotePurchaseDocumentItemToLocal = (
  remoteItem: RemotePurchaseDocumentItemDto,
): PurchaseDocumentItem => ({
  id: remoteItem.id,
  document_id: remoteItem.document_id,
  product_id: remoteItem.product_id,
  product_name: remoteItem.product_name,
  sku: optionalString(remoteItem.sku),
  unit: remoteItem.unit as ProductUnit,
  quantity: remoteItem.quantity,
  ordered_quantity: optionalNumber(remoteItem.ordered_quantity),
  received_quantity: optionalNumber(remoteItem.received_quantity),
  price: optionalNumber(remoteItem.price),
  currency_code: optionalString(remoteItem.currency_code),
  exchange_rate: optionalNumber(remoteItem.exchange_rate),
  exchange_rate_source: remoteItem.exchange_rate_source ?? undefined,
  exchange_rate_basis: remoteItem.exchange_rate_basis ?? undefined,
  exchange_rate_date: optionalString(remoteItem.exchange_rate_date),
  foreign_price: optionalNumber(remoteItem.foreign_price),
  discount_type: isPromoType(remoteItem.discount_type) ? remoteItem.discount_type : undefined,
  discount_value: optionalNumber(remoteItem.discount_value),
  discount_amount: optionalNumber(remoteItem.discount_amount),
  foreign_discount_amount: optionalNumber(remoteItem.foreign_discount_amount),
  tax_id: optionalString(remoteItem.tax_id),
  tax_name: optionalString(remoteItem.tax_name),
  tax_code: optionalString(remoteItem.tax_code),
  tax_rate: optionalNumber(remoteItem.tax_rate),
  tax_calculation_mode: isTaxCalculationMode(remoteItem.tax_calculation_mode)
    ? remoteItem.tax_calculation_mode
    : undefined,
  tax_base_amount: optionalNumber(remoteItem.tax_base_amount),
  foreign_tax_base_amount: optionalNumber(remoteItem.foreign_tax_base_amount),
  tax_amount: optionalNumber(remoteItem.tax_amount),
  foreign_tax_amount: optionalNumber(remoteItem.foreign_tax_amount),
  subtotal: optionalNumber(remoteItem.subtotal),
  foreign_subtotal: optionalNumber(remoteItem.foreign_subtotal),
  total_amount: optionalNumber(remoteItem.total_amount),
  foreign_total_amount: optionalNumber(remoteItem.foreign_total_amount),
  cost_status: remoteItem.cost_status ?? undefined,
  estimate_source: remoteItem.estimate_source ?? undefined,
  estimated_price: optionalNumber(remoteItem.estimated_price),
  final_price: optionalNumber(remoteItem.final_price),
  invoiced_quantity: optionalNumber(remoteItem.invoiced_quantity),
  quantity_variance: optionalNumber(remoteItem.quantity_variance),
  additional_cost_allocation: optionalNumber(remoteItem.additional_cost_allocation),
  supplier_discount_allocation: optionalNumber(remoteItem.supplier_discount_allocation),
  supplier_tax_allocation: optionalNumber(remoteItem.supplier_tax_allocation),
  final_landed_cost_per_unit: optionalNumber(remoteItem.final_landed_cost_per_unit),
  cost_finalized_at: optionalString(remoteItem.cost_finalized_at),
  cost_variance_amount: optionalNumber(remoteItem.cost_variance_amount),
  created_at: remoteItem.created_at,
});

const hasLocalUnsyncedChanges = (document: PurchaseDocument) => (
  document.sync_status === 'pending' || document.sync_status === 'failed'
);

const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const shouldApplyRemotePurchaseDocument = (
  localDocument: PurchaseDocument | undefined,
  remoteDocument: RemotePurchaseDocumentDto,
) => {
  if (!localDocument) return true;
  if (hasLocalUnsyncedChanges(localDocument)) return false;

  const localVersion = toPositiveVersion(localDocument.version);
  const remoteVersion = toPositiveVersion(remoteDocument.version);
  if (remoteVersion !== localVersion) {
    return remoteVersion > localVersion;
  }

  const localRemoteUpdatedAt = localDocument.remote_updated_at ?? localDocument.updated_at;
  const remoteTimestamp = toTimestamp(remoteDocument.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteDocument.updated_at >= localRemoteUpdatedAt;
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

export const mergeRemotePurchaseDocumentBundlesIntoDexie = async (
  remoteBundles: RemotePurchaseDocumentBundleDto[],
  syncedAt = new Date().toISOString(),
): Promise<PurchaseDocumentReadSyncResult> => {
  const result: PurchaseDocumentReadSyncResult = {
    ...EMPTY_PURCHASE_DOCUMENT_READ_SYNC_RESULT,
    fetched: remoteBundles.length,
  };
  if (remoteBundles.length === 0) return result;

  await db.transaction('rw', db.purchaseDocuments, db.purchaseDocumentItems, async () => {
    for (const remoteBundle of remoteBundles) {
      const localDocument = await db.purchaseDocuments.get(remoteBundle.document.id);
      if (!shouldApplyRemotePurchaseDocument(localDocument, remoteBundle.document)) {
        result.skipped += 1;
        continue;
      }

      await db.purchaseDocuments.put(mapRemotePurchaseDocumentToLocal(remoteBundle.document, syncedAt));
      await db.purchaseDocumentItems.where('document_id').equals(remoteBundle.document.id).delete();
      const localItems = remoteBundle.items.map(mapRemotePurchaseDocumentItemToLocal);
      if (localItems.length > 0) {
        await db.purchaseDocumentItems.bulkPut(localItems);
      }

      if (localDocument) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }
  });

  return result;
};

export const refreshPurchaseDocumentsFromPostgres = async (): Promise<PurchaseDocumentReadSyncResult> => {
  if (isRefreshingPurchaseDocumentsFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_PURCHASE_DOCUMENT_READ_SYNC_RESULT };
  }

  isRefreshingPurchaseDocumentsFromPostgres = true;
  try {
    const remoteBundles = await purchaseDocumentPostgresAdapter.list();
    return mergeRemotePurchaseDocumentBundlesIntoDexie(remoteBundles);
  } finally {
    isRefreshingPurchaseDocumentsFromPostgres = false;
  }
};
