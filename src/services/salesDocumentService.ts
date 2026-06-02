import { getSalesDocumentConfig, type SalesDocumentConfig } from '@/configs/sales-document';
import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import {
  recalculateSalesInvoicePaidAmount,
  recordSalesInvoicePayment,
} from '@/services/accountsReceivableService';
import {
  postSalesInvoiceIssuedJournal,
  reverseSalesInvoiceJournal,
} from '@/services/generalLedgerService';
import { enqueueSalesDocumentBundleSync } from '@/services/syncQueueService';
import type {
  PaymentMethod,
  SalesDocument,
  SalesDocumentItem,
  SalesDocumentType,
  StockMutation,
  AuthUser,
} from '@/types';
import { konversiSatuanProduk } from '@/utils/pricing';
import { getDocumentDiscountAccountSnapshot } from '@/utils/chartOfAccounts/getDocumentDiscountAccountSnapshot';
import { calculateDocumentTotal } from '@/utils/salesDocuments/calculateDocumentTotal';
import { createSalesDocumentNumber } from '@/utils/salesDocuments/createSalesDocumentNumber';
import {
  createContactSnapshot,
  createDepartmentSnapshot,
  createProjectSnapshot,
  createTaxSnapshot,
  createWarehouseSnapshot,
} from '@/utils/salesDocuments/createSalesDocumentSnapshots';
import { validateSalesDocument } from '@/utils/salesDocuments/validateSalesDocument';
import { createStockMutation, enqueueStockMutations } from '@/services/stockMutationSyncService';

export interface SalesDocumentUpsertInput {
  document: Partial<SalesDocument>;
  items: SalesDocumentItem[];
}

export interface SalesInvoicePaymentInput {
  amount?: number;
  paid_amount?: number;
  paid_at?: string;
  payment_method?: PaymentMethod;
  payment_channel?: string;
  cash_account_id?: string;
  notes?: string;
}

const salesDocumentTables = [
  db.salesDocuments,
  db.salesDocumentItems,
  db.products,
  db.financeTransactions,
  db.financeBalance,
  db.chartOfAccounts,
  db.financeAccountMappings,
  db.enabledModules,
  db.generalLedgerSetting,
  db.journalEntries,
  db.journalEntryLines,
  db.activityLogs,
];

const buildDocumentSnapshot = async (input: Partial<SalesDocument>): Promise<Partial<SalesDocument>> => {
  const [contact, tax, department, project, warehouse, discountAccountSnapshot] = await Promise.all([
    input.contact_id ? db.contacts.get(input.contact_id) : undefined,
    input.tax_id ? db.taxes.get(input.tax_id) : undefined,
    input.department_id ? db.departments.get(input.department_id) : undefined,
    input.project_id ? db.projects.get(input.project_id) : undefined,
    input.warehouse_id ? db.warehouses.get(input.warehouse_id) : undefined,
    getDocumentDiscountAccountSnapshot('sales', input.discount_account_id),
  ]);

  return {
    ...input,
    ...createContactSnapshot(contact),
    ...createTaxSnapshot(tax),
    ...createDepartmentSnapshot(department),
    ...createProjectSnapshot(project),
    ...createWarehouseSnapshot(warehouse),
    ...discountAccountSnapshot,
    customer_name: createContactSnapshot(contact).customer_name ?? input.customer_name?.trim() ?? '',
  };
};

const normalizeDocumentItems = (
  items: SalesDocumentItem[],
  documentId: string,
  createdAt: string,
): SalesDocumentItem[] => items.map((item) => ({
  ...item,
  id: item.id || crypto.randomUUID(),
  document_id: documentId,
  quantity: Number(item.quantity || item.delivered_quantity || 0),
  ordered_quantity: item.ordered_quantity === undefined ? undefined : Number(item.ordered_quantity),
  delivered_quantity: item.delivered_quantity === undefined ? undefined : Number(item.delivered_quantity),
  price: item.price === undefined ? undefined : Number(item.price),
  discount_type: item.discount_type,
  discount_value: item.discount_value === undefined ? undefined : Number(item.discount_value),
  discount_amount: item.discount_amount === undefined ? undefined : Number(item.discount_amount),
  tax_id: item.tax_id,
  tax_name: item.tax_name,
  tax_code: item.tax_code,
  tax_rate: item.tax_rate === undefined ? undefined : Number(item.tax_rate),
  tax_calculation_mode: item.tax_calculation_mode,
  tax_base_amount: item.tax_base_amount === undefined ? undefined : Number(item.tax_base_amount),
  tax_amount: item.tax_amount === undefined ? undefined : Number(item.tax_amount),
  subtotal: item.subtotal === undefined ? undefined : Number(item.subtotal),
  total_amount: item.total_amount === undefined ? undefined : Number(item.total_amount),
  purchase_price: item.purchase_price === undefined ? undefined : Number(item.purchase_price),
  original_price: item.original_price === undefined ? undefined : Number(item.original_price),
  is_price_edited: item.is_price_edited || undefined,
  price_edited_by: item.price_edited_by,
  price_edited_at: item.price_edited_at,
  created_at: item.created_at || createdAt,
}));

const getSalesDocumentWarehouse = (document: SalesDocument) => ({
  id: document.warehouse_id,
  code: document.warehouse_code,
  name: document.warehouse_name,
});

const reduceDeliveryStock = async (
  document: SalesDocument,
  items: SalesDocumentItem[],
  actor: AuthUser | null,
  occurredAt: string,
) => {
  const stockMutations: StockMutation[] = [];

  for (const item of items) {
    const product = await db.products.get(item.product_id);
    if (!product) continue;

    const quantity = item.delivered_quantity ?? item.quantity;
    const quantityInStockUnit = konversiSatuanProduk(quantity, product, item.unit, product.purchase_unit);
    await db.products.update(product.id, {
      stock: product.stock - quantityInStockUnit,
    });

    if (quantityInStockUnit > 0) {
      stockMutations.push(createStockMutation({
        product,
        warehouse: getSalesDocumentWarehouse(document),
        sourceType: 'SALES_DELIVERY',
        sourceId: document.id,
        sourceNumber: document.document_number,
        sourceLineId: item.id,
        quantityDelta: -quantityInStockUnit,
        sourceQuantity: quantity,
        sourceUnit: item.unit,
        actor,
        occurredAt,
      }));
    }
  }

  return stockMutations;
};

const restoreDeliveryStock = async (
  document: SalesDocument,
  items: SalesDocumentItem[],
  actor: AuthUser | null,
  occurredAt: string,
  reason: string,
) => {
  const stockMutations: StockMutation[] = [];

  for (const item of items) {
    const product = await db.products.get(item.product_id);
    if (!product) continue;

    const quantity = item.delivered_quantity ?? item.quantity;
    const quantityInStockUnit = konversiSatuanProduk(quantity, product, item.unit, product.purchase_unit);
    await db.products.update(product.id, {
      stock: product.stock + quantityInStockUnit,
    });

    if (quantityInStockUnit > 0) {
      stockMutations.push(createStockMutation({
        product,
        warehouse: getSalesDocumentWarehouse(document),
        sourceType: 'SALES_DELIVERY_VOID',
        sourceId: document.id,
        sourceNumber: document.document_number,
        sourceLineId: item.id,
        quantityDelta: quantityInStockUnit,
        sourceQuantity: quantity,
        sourceUnit: item.unit,
        reason,
        actor,
        occurredAt,
      }));
    }
  }

  return stockMutations;
};

const assertDraft = (document: SalesDocument) => {
  if (document.status !== 'DRAFT') {
    throw new Error('Hanya dokumen draft yang bisa diubah.');
  }
};

const applyPaymentStatusBehavior = <T extends Partial<SalesDocument>>(
  document: T,
  config: SalesDocumentConfig,
): T => {
  const nextDocument = { ...document };

  if (config.behavior.hasPaymentStatus) {
    return {
      ...nextDocument,
      payment_status: nextDocument.payment_status ?? 'UNPAID',
    } as T;
  }

  delete nextDocument.payment_status;
  delete nextDocument.paid_amount;
  delete nextDocument.paid_at;
  delete nextDocument.payment_method;
  delete nextDocument.cash_account_id;
  delete nextDocument.cash_account_code;
  delete nextDocument.cash_account_name;
  delete nextDocument.finance_transaction_id;
  return nextDocument as T;
};

const withCreatedSalesDocumentSync = (
  document: SalesDocument,
  actor: AuthUser | null,
): SalesDocument => ({
  ...document,
  version: 1,
  created_by: actor?.id,
  created_by_name: actor?.name,
  updated_by: actor?.id,
  updated_by_name: actor?.name,
  sync_status: 'pending',
  sync_error: undefined,
});

const withUpdatedSalesDocumentSync = (
  document: SalesDocument,
  previousDocument: SalesDocument,
  actor: AuthUser | null,
): SalesDocument => ({
  ...document,
  version: Math.max(1, Number(previousDocument.version ?? 1)) + 1,
  updated_by: actor?.id,
  updated_by_name: actor?.name,
  sync_status: 'pending',
  sync_error: undefined,
});

export const createSalesDocument = async ({ document, items }: SalesDocumentUpsertInput) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');

  if (!document.type) {
    throw new Error('Tipe dokumen wajib diisi.');
  }

  const config = getSalesDocumentConfig(document.type);
  const now = new Date();
  const createdAt = now.toISOString();
  const documentId = crypto.randomUUID();
  const snapshot = applyPaymentStatusBehavior(await buildDocumentSnapshot(document), config);
  const documentNumber = document.document_number || await createSalesDocumentNumber(config.numberPrefix, now);
  const normalizedItems = normalizeDocumentItems(items, documentId, createdAt);
  const { items: calculatedItems, ...total } = calculateDocumentTotal({
    items: normalizedItems,
    discountType: snapshot.discount_type,
    discountValue: snapshot.discount_value,
    discountAmount: snapshot.discount_amount,
    taxRate: snapshot.tax_rate,
    taxCalculationMode: snapshot.tax_calculation_mode,
    taxId: snapshot.tax_id,
    taxName: snapshot.tax_name,
    taxCode: snapshot.tax_code,
    config,
  });
  const nextDocument = withCreatedSalesDocumentSync(applyPaymentStatusBehavior({
    id: documentId,
    document_number: documentNumber,
    type: document.type,
    status: document.status ?? 'DRAFT',
    customer_name: snapshot.customer_name ?? '',
    document_date: snapshot.document_date || createdAt.slice(0, 10),
    created_at: createdAt,
    updated_at: createdAt,
    ...snapshot,
    ...total,
  } satisfies SalesDocument, config), currentUser);
  const products = await db.products.toArray();
  validateSalesDocument({ document: nextDocument, items: calculatedItems, config, products });

  await db.transaction('rw', salesDocumentTables, async () => {
    await db.salesDocuments.add(nextDocument);
    await db.salesDocumentItems.bulkAdd(calculatedItems);
    await writeActivityLog({
      user: currentUser,
      action: 'SALES_DOCUMENT_CREATED',
      entity: 'salesDocuments',
      entity_id: nextDocument.id,
      description: `${currentUser?.name ?? 'User'} membuat ${config.title} ${nextDocument.document_number}.`,
    });
  });

  await enqueueSalesDocumentBundleSync(nextDocument, calculatedItems, 'create');

  return { document: nextDocument, items: calculatedItems };
};

export const updateSalesDocument = async (id: string, { document, items }: SalesDocumentUpsertInput) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');
  const existing = await db.salesDocuments.get(id);
  if (!existing) throw new Error('Dokumen tidak ditemukan.');
  assertDraft(existing);

  const config = getSalesDocumentConfig(existing.type);
  const updatedAt = new Date().toISOString();
  const snapshot = applyPaymentStatusBehavior(
    await buildDocumentSnapshot({ ...existing, ...document, type: existing.type }),
    config,
  );
  const normalizedItems = normalizeDocumentItems(items, id, existing.created_at);
  const { items: calculatedItems, ...total } = calculateDocumentTotal({
    items: normalizedItems,
    discountType: snapshot.discount_type,
    discountValue: snapshot.discount_value,
    discountAmount: snapshot.discount_amount,
    taxRate: snapshot.tax_rate,
    taxCalculationMode: snapshot.tax_calculation_mode,
    taxId: snapshot.tax_id,
    taxName: snapshot.tax_name,
    taxCode: snapshot.tax_code,
    config,
  });
  const nextDocument = withUpdatedSalesDocumentSync(applyPaymentStatusBehavior({
    ...existing,
    ...snapshot,
    ...total,
    id,
    type: existing.type,
    status: existing.status,
    document_number: existing.document_number,
    updated_at: updatedAt,
  } satisfies SalesDocument, config), existing, currentUser);
  const products = await db.products.toArray();
  validateSalesDocument({ document: nextDocument, items: calculatedItems, config, products });

  await db.transaction('rw', salesDocumentTables, async () => {
    await db.salesDocuments.put(nextDocument);
    await db.salesDocumentItems.where('document_id').equals(id).delete();
    await db.salesDocumentItems.bulkAdd(calculatedItems);
    await writeActivityLog({
      user: currentUser,
      action: 'SALES_DOCUMENT_UPDATED',
      entity: 'salesDocuments',
      entity_id: id,
      description: `${currentUser?.name ?? 'User'} mengubah ${config.title} ${nextDocument.document_number}.`,
    });
  });

  await enqueueSalesDocumentBundleSync(nextDocument, calculatedItems, 'update');

  return { document: nextDocument, items: calculatedItems };
};

export const issueSalesDocument = async (id: string) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');
  const document = await db.salesDocuments.get(id);
  if (!document) throw new Error('Dokumen tidak ditemukan.');
  assertDraft(document);

  const config = getSalesDocumentConfig(document.type);
  const items = await db.salesDocumentItems.where('document_id').equals(id).toArray();
  const products = await db.products.toArray();
  validateSalesDocument({ document, items, config, products });
  const now = new Date().toISOString();
  let stockMutations: StockMutation[] = [];
  const issuedDocument: SalesDocument = withUpdatedSalesDocumentSync({
    ...document,
    status: 'ISSUED',
    issued_at: now,
    updated_at: now,
  }, document, currentUser);

  await db.transaction('rw', salesDocumentTables, async () => {
    if (config.behavior.affectsStock) {
      stockMutations = await reduceDeliveryStock(issuedDocument, items, currentUser, now);
    }

    await db.salesDocuments.put(issuedDocument);
    if (document.type === 'SALES_INVOICE') {
      await postSalesInvoiceIssuedJournal(issuedDocument);
    }
    await writeActivityLog({
      user: currentUser,
      action: 'SALES_DOCUMENT_ISSUED',
      entity: 'salesDocuments',
      entity_id: id,
      description: `${currentUser?.name ?? 'User'} menerbitkan ${config.title} ${document.document_number}.`,
    });
  });

  await enqueueStockMutations(stockMutations);
  await enqueueSalesDocumentBundleSync(issuedDocument, items, 'update');
};

export const convertSalesDocument = async (sourceId: string, targetType: SalesDocumentType) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');
  const source = await db.salesDocuments.get(sourceId);
  if (!source) throw new Error('Dokumen sumber tidak ditemukan.');

  const targetConfig = getSalesDocumentConfig(targetType);
  const now = new Date();
  const createdAt = now.toISOString();
  const targetId = crypto.randomUUID();
  const sourceItems = await db.salesDocumentItems.where('document_id').equals(sourceId).toArray();
  const documentNumber = await createSalesDocumentNumber(targetConfig.numberPrefix, now);
  const discountAccountSnapshot = await getDocumentDiscountAccountSnapshot('sales', source.discount_account_id);
  const targetItems = normalizeDocumentItems(sourceItems.map((item) => ({
    ...item,
    id: crypto.randomUUID(),
    document_id: targetId,
  })), targetId, createdAt);
  const { items: calculatedItems, ...total } = calculateDocumentTotal({
    items: targetItems,
    discountType: source.discount_type,
    discountValue: source.discount_value,
    discountAmount: source.discount_amount,
    taxRate: source.tax_rate,
    taxCalculationMode: source.tax_calculation_mode,
    taxId: source.tax_id,
    taxName: source.tax_name,
    taxCode: source.tax_code,
    config: targetConfig,
  });
  const targetDocument = withCreatedSalesDocumentSync(applyPaymentStatusBehavior({
    ...source,
    id: targetId,
    document_number: documentNumber,
    type: targetType,
    status: 'DRAFT',
    source_document_id: source.id,
    source_document_number: source.document_number,
    source_document_type: source.type,
    payment_status: targetConfig.behavior.hasPaymentStatus ? 'UNPAID' : undefined,
    finance_transaction_id: undefined,
    paid_amount: undefined,
    paid_at: undefined,
    issued_at: undefined,
    voided_at: undefined,
    void_reason: undefined,
    sync_error: undefined,
    last_synced_at: undefined,
    remote_updated_at: undefined,
    created_at: createdAt,
    updated_at: createdAt,
    ...discountAccountSnapshot,
    ...total,
  } satisfies SalesDocument, targetConfig), currentUser);
  const convertedSourceDocument = withUpdatedSalesDocumentSync({
    ...source,
    status: 'CONVERTED',
    updated_at: createdAt,
  }, source, currentUser);

  await db.transaction('rw', salesDocumentTables, async () => {
    await db.salesDocuments.add(targetDocument);
    await db.salesDocumentItems.bulkAdd(calculatedItems);
    await db.salesDocuments.put(convertedSourceDocument);
    await writeActivityLog({
      user: currentUser,
      action: 'SALES_DOCUMENT_CONVERTED',
      entity: 'salesDocuments',
      entity_id: targetDocument.id,
      description: `${currentUser?.name ?? 'User'} convert ${source.document_number} menjadi ${targetDocument.document_number}.`,
    });
  });

  await enqueueSalesDocumentBundleSync(convertedSourceDocument, sourceItems, 'update');
  await enqueueSalesDocumentBundleSync(targetDocument, calculatedItems, 'create');

  return { document: targetDocument, items: calculatedItems };
};

export const voidSalesDocument = async (id: string, reason: string) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');
  const document = await db.salesDocuments.get(id);
  if (!document) throw new Error('Dokumen tidak ditemukan.');
  if (document.status === 'VOIDED') return;
  if (document.status !== 'DRAFT' && document.status !== 'ISSUED') {
    throw new Error('Hanya dokumen draft atau posted yang bisa di-void.');
  }
  const activePaymentCount = document.type === 'SALES_INVOICE'
    ? await db.salesInvoicePayments
      .where('sales_document_id')
      .equals(id)
      .filter((payment) => payment.status === 'ACTIVE')
      .count()
    : 0;
  if (document.type === 'SALES_INVOICE' && (document.finance_transaction_id || activePaymentCount > 0)) {
    throw new Error('Invoice yang sudah memiliki pembayaran tidak bisa di-void dari fitur ini.');
  }
  const normalizedReason = reason.trim();
  if (!normalizedReason) {
    throw new Error('Alasan pembatalan wajib diisi.');
  }

  const items = await db.salesDocumentItems.where('document_id').equals(id).toArray();
  const now = new Date().toISOString();
  let stockMutations: StockMutation[] = [];
  const voidedDocument = withUpdatedSalesDocumentSync({
    ...document,
    status: 'VOIDED',
    voided_at: now,
    void_reason: normalizedReason,
    updated_at: now,
  }, document, currentUser);

  await db.transaction('rw', salesDocumentTables, async () => {
    if (document.type === 'SALES_DELIVERY' && document.status === 'ISSUED') {
      stockMutations = await restoreDeliveryStock(document, items, currentUser, now, normalizedReason);
    }

    await db.salesDocuments.put(voidedDocument);
    if (document.type === 'SALES_INVOICE' && document.status === 'ISSUED') {
      await reverseSalesInvoiceJournal(document, `Pembalikan jurnal invoice ${document.document_number}: ${normalizedReason}`);
    }
    await writeActivityLog({
      user: currentUser,
      action: 'SALES_DOCUMENT_VOIDED',
      entity: 'salesDocuments',
      entity_id: id,
      description: `${currentUser?.name ?? 'User'} membatalkan ${document.document_number}. Alasan: ${normalizedReason}`,
    });
  });

  await enqueueStockMutations(stockMutations);
  await enqueueSalesDocumentBundleSync(voidedDocument, items, 'update');
};

export const recalculateSalesInvoicePaymentStatus = async (invoiceId: string) => {
  await recalculateSalesInvoicePaidAmount(invoiceId);
};

export const markSalesInvoicePaid = async (id: string, input: SalesInvoicePaymentInput) => {
  return recordSalesInvoicePayment(id, {
    amount: Number(input.amount ?? input.paid_amount ?? 0),
    paid_at: input.paid_at,
    payment_method: input.payment_method,
    payment_channel: input.payment_channel,
    cash_account_id: input.cash_account_id,
    notes: input.notes,
  });
};
