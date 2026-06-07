import { db } from '@/lib/db';
import {
  isPostgresUnavailableError,
  isTauriRuntime,
  salesDocumentPostgresAdapter,
  type RemoteSalesDocumentBundleDto,
  type RemoteSalesDocumentDto,
  type RemoteSalesDocumentItemDto,
} from '@/services/postgresAdapter';
import type {
  PaymentMethod,
  ProductUnit,
  PromoType,
  SalesDocument,
  SalesDocumentItem,
  SalesDocumentStatus,
  SalesDocumentType,
  SalesInvoicePaymentStatus,
  TaxCalculationMode,
} from '@/types';

export interface SalesDocumentReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

const EMPTY_SALES_DOCUMENT_READ_SYNC_RESULT: SalesDocumentReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
};

const VALID_SALES_DOCUMENT_TYPES: SalesDocumentType[] = [
  'SALES_QUOTATION',
  'SALES_ORDER',
  'SALES_DELIVERY',
  'SALES_INVOICE',
];

const VALID_SALES_DOCUMENT_STATUSES: SalesDocumentStatus[] = [
  'DRAFT',
  'ISSUED',
  'CONVERTED',
  'VOIDED',
];

const VALID_PAYMENT_STATUSES: SalesInvoicePaymentStatus[] = ['UNPAID', 'PARTIAL', 'PAID'];
const VALID_PROMO_TYPES: PromoType[] = ['percent', 'fixed'];
const VALID_TAX_CALCULATION_MODES: TaxCalculationMode[] = ['EXCLUSIVE', 'INCLUSIVE'];
const VALID_PAYMENT_METHODS: PaymentMethod[] = ['TUNAI', 'NON_TUNAI'];
const POSTGRES_SALES_DOCUMENT_REFRESH_LIMIT = 200;

let isRefreshingSalesDocumentsFromPostgres = false;

const optionalString = (value: string | null | undefined) => value ?? undefined;
const optionalNumber = (value: number | null | undefined) => (
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
);
const optionalBoolean = (value: boolean | null | undefined) => (
  typeof value === 'boolean' ? value : undefined
);

const isSalesDocumentType = (type: string): type is SalesDocumentType => (
  VALID_SALES_DOCUMENT_TYPES.includes(type as SalesDocumentType)
);

const isSalesDocumentStatus = (status: string): status is SalesDocumentStatus => (
  VALID_SALES_DOCUMENT_STATUSES.includes(status as SalesDocumentStatus)
);

const isPaymentStatus = (status: string | null | undefined): status is SalesInvoicePaymentStatus => (
  Boolean(status) && VALID_PAYMENT_STATUSES.includes(status as SalesInvoicePaymentStatus)
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

const mapRemoteSalesDocumentToLocal = (
  remoteDocument: RemoteSalesDocumentDto,
  syncedAt: string,
): SalesDocument => ({
  id: remoteDocument.id,
  document_number: remoteDocument.document_number,
  type: isSalesDocumentType(remoteDocument.type) ? remoteDocument.type : 'SALES_QUOTATION',
  status: isSalesDocumentStatus(remoteDocument.status) ? remoteDocument.status : 'DRAFT',
  contact_id: optionalString(remoteDocument.contact_id),
  customer_name: remoteDocument.customer_name,
  customer_phone: optionalString(remoteDocument.customer_phone),
  customer_email: optionalString(remoteDocument.customer_email),
  customer_address: optionalString(remoteDocument.customer_address),
  customer_company_name: optionalString(remoteDocument.customer_company_name),
  customer_tax_number: optionalString(remoteDocument.customer_tax_number),
  department_id: optionalString(remoteDocument.department_id),
  department_code: optionalString(remoteDocument.department_code),
  department_name: optionalString(remoteDocument.department_name),
  project_id: optionalString(remoteDocument.project_id),
  project_code: optionalString(remoteDocument.project_code),
  project_name: optionalString(remoteDocument.project_name),
  document_date: remoteDocument.document_date,
  expired_at: optionalString(remoteDocument.expired_at),
  due_date: optionalString(remoteDocument.due_date),
  warehouse_id: optionalString(remoteDocument.warehouse_id),
  warehouse_code: optionalString(remoteDocument.warehouse_code),
  warehouse_name: optionalString(remoteDocument.warehouse_name),
  source_document_id: optionalString(remoteDocument.source_document_id),
  source_document_number: optionalString(remoteDocument.source_document_number),
  source_document_type: remoteDocument.source_document_type && isSalesDocumentType(remoteDocument.source_document_type)
    ? remoteDocument.source_document_type
    : undefined,
  subtotal_amount: optionalNumber(remoteDocument.subtotal_amount),
  discount_type: isPromoType(remoteDocument.discount_type) ? remoteDocument.discount_type : undefined,
  discount_value: optionalNumber(remoteDocument.discount_value),
  discount_amount: optionalNumber(remoteDocument.discount_amount),
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
  total_amount: optionalNumber(remoteDocument.total_amount),
  payment_status: isPaymentStatus(remoteDocument.payment_status) ? remoteDocument.payment_status : undefined,
  paid_amount: optionalNumber(remoteDocument.paid_amount),
  paid_at: optionalString(remoteDocument.paid_at),
  payment_method: isPaymentMethod(remoteDocument.payment_method) ? remoteDocument.payment_method : undefined,
  cash_account_id: optionalString(remoteDocument.cash_account_id),
  cash_account_code: optionalString(remoteDocument.cash_account_code),
  cash_account_name: optionalString(remoteDocument.cash_account_name),
  finance_transaction_id: optionalString(remoteDocument.finance_transaction_id),
  notes: optionalString(remoteDocument.notes),
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

const mapRemoteSalesDocumentItemToLocal = (
  remoteItem: RemoteSalesDocumentItemDto,
): SalesDocumentItem => ({
  id: remoteItem.id,
  document_id: remoteItem.document_id,
  product_id: remoteItem.product_id,
  product_name: remoteItem.product_name,
  sku: optionalString(remoteItem.sku),
  unit: remoteItem.unit as ProductUnit,
  quantity: remoteItem.quantity,
  ordered_quantity: optionalNumber(remoteItem.ordered_quantity),
  delivered_quantity: optionalNumber(remoteItem.delivered_quantity),
  price: optionalNumber(remoteItem.price),
  discount_type: isPromoType(remoteItem.discount_type) ? remoteItem.discount_type : undefined,
  discount_value: optionalNumber(remoteItem.discount_value),
  discount_amount: optionalNumber(remoteItem.discount_amount),
  tax_id: optionalString(remoteItem.tax_id),
  tax_name: optionalString(remoteItem.tax_name),
  tax_code: optionalString(remoteItem.tax_code),
  tax_rate: optionalNumber(remoteItem.tax_rate),
  tax_calculation_mode: isTaxCalculationMode(remoteItem.tax_calculation_mode)
    ? remoteItem.tax_calculation_mode
    : undefined,
  tax_base_amount: optionalNumber(remoteItem.tax_base_amount),
  tax_amount: optionalNumber(remoteItem.tax_amount),
  subtotal: optionalNumber(remoteItem.subtotal),
  total_amount: optionalNumber(remoteItem.total_amount),
  purchase_price: optionalNumber(remoteItem.purchase_price),
  original_price: optionalNumber(remoteItem.original_price),
  is_price_edited: optionalBoolean(remoteItem.is_price_edited),
  price_edited_by: optionalString(remoteItem.price_edited_by),
  price_edited_at: optionalString(remoteItem.price_edited_at),
  created_at: remoteItem.created_at,
});

const hasLocalUnsyncedChanges = (document: SalesDocument) => (
  document.sync_status === 'pending' || document.sync_status === 'failed'
);

const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const getLaterUpdatedAt = (current: string | undefined, candidate: string | undefined) => {
  if (!candidate) return current;
  if (!current) return candidate;

  const currentTimestamp = toTimestamp(current);
  const candidateTimestamp = toTimestamp(candidate);

  if (currentTimestamp !== null && candidateTimestamp !== null) {
    return candidateTimestamp > currentTimestamp ? candidate : current;
  }

  return candidate > current ? candidate : current;
};

const getLatestLocalRemoteUpdatedAt = async () => {
  const documents = await db.salesDocuments.toArray();

  return documents.reduce<string | undefined>((latest, document) => {
    const remoteUpdatedAt = document.remote_updated_at
      ?? (document.sync_status === 'synced' ? document.updated_at : undefined);
    return getLaterUpdatedAt(latest, remoteUpdatedAt);
  }, undefined);
};

const getLatestRemoteBundleUpdatedAt = (remoteBundles: RemoteSalesDocumentBundleDto[]) => (
  remoteBundles.reduce<string | undefined>(
    (latest, bundle) => getLaterUpdatedAt(latest, bundle.document.updated_at),
    undefined,
  )
);

const addSalesDocumentReadSyncResult = (
  aggregate: SalesDocumentReadSyncResult,
  next: SalesDocumentReadSyncResult,
) => {
  aggregate.fetched += next.fetched;
  aggregate.inserted += next.inserted;
  aggregate.updated += next.updated;
  aggregate.skipped += next.skipped;
};

const shouldApplyRemoteSalesDocument = (
  localDocument: SalesDocument | undefined,
  remoteDocument: RemoteSalesDocumentDto,
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

export const mergeRemoteSalesDocumentBundlesIntoDexie = async (
  remoteBundles: RemoteSalesDocumentBundleDto[],
  syncedAt = new Date().toISOString(),
): Promise<SalesDocumentReadSyncResult> => {
  const result: SalesDocumentReadSyncResult = {
    ...EMPTY_SALES_DOCUMENT_READ_SYNC_RESULT,
    fetched: remoteBundles.length,
  };
  if (remoteBundles.length === 0) return result;

  await db.transaction('rw', db.salesDocuments, db.salesDocumentItems, async () => {
    for (const remoteBundle of remoteBundles) {
      const localDocument = await db.salesDocuments.get(remoteBundle.document.id);
      if (!shouldApplyRemoteSalesDocument(localDocument, remoteBundle.document)) {
        result.skipped += 1;
        continue;
      }

      await db.salesDocuments.put(mapRemoteSalesDocumentToLocal(remoteBundle.document, syncedAt));
      await db.salesDocumentItems.where('document_id').equals(remoteBundle.document.id).delete();
      const localItems = remoteBundle.items.map(mapRemoteSalesDocumentItemToLocal);
      if (localItems.length > 0) {
        await db.salesDocumentItems.bulkPut(localItems);
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

export const refreshSalesDocumentsFromPostgres = async (): Promise<SalesDocumentReadSyncResult> => {
  if (isRefreshingSalesDocumentsFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_SALES_DOCUMENT_READ_SYNC_RESULT };
  }

  isRefreshingSalesDocumentsFromPostgres = true;
  try {
    const aggregate = { ...EMPTY_SALES_DOCUMENT_READ_SYNC_RESULT };
    let updatedAfter = await getLatestLocalRemoteUpdatedAt();

    while (true) {
      const remoteBundles = await salesDocumentPostgresAdapter.list({
        updatedAfter,
        limit: POSTGRES_SALES_DOCUMENT_REFRESH_LIMIT,
      });
      const result = await mergeRemoteSalesDocumentBundlesIntoDexie(remoteBundles);
      addSalesDocumentReadSyncResult(aggregate, result);

      if (remoteBundles.length < POSTGRES_SALES_DOCUMENT_REFRESH_LIMIT) {
        break;
      }

      const nextUpdatedAfter = getLatestRemoteBundleUpdatedAt(remoteBundles);
      if (!nextUpdatedAfter || nextUpdatedAfter === updatedAfter) {
        break;
      }

      updatedAfter = nextUpdatedAfter;
    }

    return aggregate;
  } catch (error) {
    if (isPostgresUnavailableError(error)) {
      return { ...EMPTY_SALES_DOCUMENT_READ_SYNC_RESULT };
    }

    throw error;
  } finally {
    isRefreshingSalesDocumentsFromPostgres = false;
  }
};
