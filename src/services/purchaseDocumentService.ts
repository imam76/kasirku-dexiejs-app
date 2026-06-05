import { getPurchaseDocumentConfig, type PurchaseDocumentConfig } from '@/configs/purchase-document';
import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import type {
  PurchaseDocument,
  PurchaseDocumentItem,
  PurchaseDocumentType,
  StockMutation,
  AuthUser,
} from '@/types';
import { calculateDocumentTotal } from '@/utils/documentTotals';
import { getDocumentDiscountAccountSnapshot } from '@/utils/chartOfAccounts/getDocumentDiscountAccountSnapshot';
import { getPurchasePrice } from '@/utils/pricing';
import { getPurchaseReceiptStockQuantity } from '@/utils/purchaseDocuments/calculatePurchaseDocumentStockImpact';
import { recalculatePurchaseInvoicePaymentsForReturnSource } from '@/services/accountsPayableService';
import { enqueuePurchaseDocumentBundleSync } from '@/services/syncQueueService';
import { createPurchaseDocumentNumber } from '@/utils/purchaseDocuments/createPurchaseDocumentNumber';
import {
  createPurchaseDepartmentSnapshot,
  createPurchaseProjectSnapshot,
  createPurchaseTaxSnapshot,
  createPurchaseWarehouseSnapshot,
  createSupplierSnapshot,
} from '@/utils/purchaseDocuments/createPurchaseDocumentSnapshots';
import { validatePurchaseDocument } from '@/utils/purchaseDocuments/validatePurchaseDocument';
import { createStockMutation, enqueueStockMutations } from '@/services/stockMutationSyncService';
import {
  applyCurrencySnapshotToLineItem,
  applyForeignAmountsToLineItem,
  getForeignDocumentTotals,
  isBaseCurrency,
  normalizeCurrencyCode,
  snapshotFromDocumentInput,
  type DocumentCurrencySnapshot,
} from '@/utils/documentCurrency';

export interface PurchaseDocumentUpsertInput {
  document: Partial<PurchaseDocument>;
  items: PurchaseDocumentItem[];
}

const purchaseDocumentTables = [
  db.purchaseDocuments,
  db.purchaseDocumentItems,
  db.products,
  db.activityLogs,
];

const allowedConversions: Record<PurchaseDocumentType, PurchaseDocumentType[]> = {
  PURCHASE_REQUEST: ['REQUEST_FOR_QUOTATION', 'PURCHASE_ORDER'],
  REQUEST_FOR_QUOTATION: ['PURCHASE_ORDER'],
  PURCHASE_ORDER: ['PURCHASE_RECEIPT'],
  PURCHASE_RECEIPT: ['PURCHASE_INVOICE', 'PURCHASE_RETURN'],
  PURCHASE_INVOICE: ['PURCHASE_RETURN'],
  PURCHASE_RETURN: [],
};

const nonClosingConversionTargets = new Set<PurchaseDocumentType>(['PURCHASE_RETURN']);

const buildDocumentSnapshot = async (input: Partial<PurchaseDocument>): Promise<Partial<PurchaseDocument>> => {
  const [contact, tax, department, project, warehouse, currency, discountAccountSnapshot] = await Promise.all([
    input.contact_id ? db.contacts.get(input.contact_id) : undefined,
    input.tax_id ? db.taxes.get(input.tax_id) : undefined,
    input.department_id ? db.departments.get(input.department_id) : undefined,
    input.project_id ? db.projects.get(input.project_id) : undefined,
    input.warehouse_id ? db.warehouses.get(input.warehouse_id) : undefined,
    db.currencies.get(normalizeCurrencyCode(input.currency_code)),
    getDocumentDiscountAccountSnapshot('purchase', input.discount_account_id),
  ]);
  const contactSnapshot = createSupplierSnapshot(contact);
  const currencySnapshot = snapshotFromDocumentInput(input, currency, input.document_date);

  return {
    ...input,
    ...currencySnapshot,
    ...contactSnapshot,
    ...createPurchaseTaxSnapshot(tax),
    ...createPurchaseDepartmentSnapshot(department),
    ...createPurchaseProjectSnapshot(project),
    ...createPurchaseWarehouseSnapshot(warehouse),
    ...discountAccountSnapshot,
    supplier_name: contactSnapshot.supplier_name ?? input.supplier_name?.trim() ?? '',
  };
};

const normalizeDocumentItems = (
  items: PurchaseDocumentItem[],
  documentId: string,
  createdAt: string,
  documentCurrency: DocumentCurrencySnapshot,
): PurchaseDocumentItem[] => items.map((item) => applyCurrencySnapshotToLineItem({
  ...item,
  id: item.id || crypto.randomUUID(),
  document_id: documentId,
  quantity: Number(item.quantity || item.received_quantity || 0),
  ordered_quantity: item.ordered_quantity === undefined ? undefined : Number(item.ordered_quantity),
  received_quantity: item.received_quantity === undefined ? undefined : Number(item.received_quantity),
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
  currency_code: item.currency_code,
  exchange_rate: item.exchange_rate === undefined ? undefined : Number(item.exchange_rate),
  exchange_rate_source: item.exchange_rate_source,
  exchange_rate_basis: item.exchange_rate_basis,
  exchange_rate_date: item.exchange_rate_date,
  foreign_price: item.foreign_price === undefined ? undefined : Number(item.foreign_price),
  foreign_discount_amount: item.foreign_discount_amount === undefined ? undefined : Number(item.foreign_discount_amount),
  foreign_tax_base_amount: item.foreign_tax_base_amount === undefined ? undefined : Number(item.foreign_tax_base_amount),
  foreign_tax_amount: item.foreign_tax_amount === undefined ? undefined : Number(item.foreign_tax_amount),
  foreign_subtotal: item.foreign_subtotal === undefined ? undefined : Number(item.foreign_subtotal),
  foreign_total_amount: item.foreign_total_amount === undefined ? undefined : Number(item.foreign_total_amount),
  created_at: item.created_at || createdAt,
}, documentCurrency, { preferForeignPrice: item.foreign_price !== undefined && !isBaseCurrency(documentCurrency.currency_code) }));

const applyConfigBehavior = <T extends Partial<PurchaseDocument>>(
  document: T,
  config: PurchaseDocumentConfig,
): T => {
  const nextDocument = { ...document };

  if (!config.behavior.hasPricing) {
    delete nextDocument.subtotal_amount;
    delete nextDocument.discount_type;
    delete nextDocument.discount_value;
    delete nextDocument.discount_amount;
    delete nextDocument.discount_account_id;
    delete nextDocument.discount_account_code;
    delete nextDocument.discount_account_name;
    delete nextDocument.tax_amount;
    delete nextDocument.total_amount;
  }

  if (!config.behavior.hasTax) {
    delete nextDocument.tax_id;
    delete nextDocument.tax_name;
    delete nextDocument.tax_code;
    delete nextDocument.tax_rate;
    delete nextDocument.tax_calculation_mode;
    delete nextDocument.tax_amount;
  }

  if (config.behavior.hasPaymentStatus) {
    return {
      ...nextDocument,
      payment_status: nextDocument.payment_status ?? 'UNPAID',
      paid_amount: nextDocument.paid_amount ?? 0,
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

const withCreatedPurchaseDocumentSync = (
  document: PurchaseDocument,
  actor: AuthUser | null,
): PurchaseDocument => ({
  ...document,
  version: 1,
  created_by: actor?.id,
  created_by_name: actor?.name,
  updated_by: actor?.id,
  updated_by_name: actor?.name,
  sync_status: 'pending',
  sync_error: undefined,
});

const withUpdatedPurchaseDocumentSync = (
  document: PurchaseDocument,
  previousDocument: PurchaseDocument,
  actor: AuthUser | null,
): PurchaseDocument => ({
  ...document,
  version: Math.max(1, Number(previousDocument.version ?? 1)) + 1,
  updated_by: actor?.id,
  updated_by_name: actor?.name,
  sync_status: 'pending',
  sync_error: undefined,
});

const assertDraft = (document: PurchaseDocument) => {
  if (document.status !== 'DRAFT') {
    throw new Error('Hanya dokumen draft yang bisa diubah.');
  }
};

const getPurchaseDocumentWarehouse = (document: PurchaseDocument) => ({
  id: document.warehouse_id,
  code: document.warehouse_code,
  name: document.warehouse_name,
});

const addReceiptStock = async (
  document: PurchaseDocument,
  items: PurchaseDocumentItem[],
  actor: AuthUser | null,
  occurredAt: string,
) => {
  const stockMutations: StockMutation[] = [];

  for (const item of items) {
    const product = await db.products.get(item.product_id);
    if (!product) continue;

    const quantityInStockUnit = getPurchaseReceiptStockQuantity(item, product);
    await db.products.update(product.id, {
      stock: Number(product.stock || 0) + quantityInStockUnit,
      updated_at: occurredAt,
    });

    if (quantityInStockUnit > 0) {
      stockMutations.push(createStockMutation({
        product,
        warehouse: getPurchaseDocumentWarehouse(document),
        sourceType: 'PURCHASE_RECEIPT',
        sourceId: document.id,
        sourceNumber: document.document_number,
        sourceLineId: item.id,
        quantityDelta: quantityInStockUnit,
        sourceQuantity: item.received_quantity ?? item.quantity,
        sourceUnit: item.unit,
        actor,
        occurredAt,
      }));
    }
  }

  return stockMutations;
};

const restoreReceiptStock = async (
  document: PurchaseDocument,
  items: PurchaseDocumentItem[],
  actor: AuthUser | null,
  occurredAt: string,
  reason: string,
) => {
  const stockMutations: StockMutation[] = [];

  for (const item of items) {
    const product = await db.products.get(item.product_id);
    if (!product) continue;

    const quantityInStockUnit = getPurchaseReceiptStockQuantity(item, product);
    await db.products.update(product.id, {
      stock: Number(product.stock || 0) - quantityInStockUnit,
      updated_at: occurredAt,
    });

    if (quantityInStockUnit > 0) {
      stockMutations.push(createStockMutation({
        product,
        warehouse: getPurchaseDocumentWarehouse(document),
        sourceType: 'PURCHASE_RECEIPT_VOID',
        sourceId: document.id,
        sourceNumber: document.document_number,
        sourceLineId: item.id,
        quantityDelta: -quantityInStockUnit,
        sourceQuantity: item.received_quantity ?? item.quantity,
        sourceUnit: item.unit,
        reason,
        actor,
        occurredAt,
      }));
    }
  }

  return stockMutations;
};

const removePurchaseReturnStock = async (
  document: PurchaseDocument,
  items: PurchaseDocumentItem[],
  actor: AuthUser | null,
  occurredAt: string,
) => {
  const stockMutations: StockMutation[] = [];

  for (const item of items) {
    const product = await db.products.get(item.product_id);
    if (!product) continue;

    const quantityInStockUnit = getPurchaseReceiptStockQuantity(item, product);
    await db.products.update(product.id, {
      stock: Number(product.stock || 0) - quantityInStockUnit,
      updated_at: occurredAt,
    });

    if (quantityInStockUnit > 0) {
      stockMutations.push(createStockMutation({
        product,
        warehouse: getPurchaseDocumentWarehouse(document),
        sourceType: 'PURCHASE_RETURN',
        sourceId: document.id,
        sourceNumber: document.document_number,
        sourceLineId: item.id,
        quantityDelta: -quantityInStockUnit,
        sourceQuantity: item.received_quantity ?? item.quantity,
        sourceUnit: item.unit,
        actor,
        occurredAt,
      }));
    }
  }

  return stockMutations;
};

const restorePurchaseReturnStock = async (
  document: PurchaseDocument,
  items: PurchaseDocumentItem[],
  actor: AuthUser | null,
  occurredAt: string,
  reason: string,
) => {
  const stockMutations: StockMutation[] = [];

  for (const item of items) {
    const product = await db.products.get(item.product_id);
    if (!product) continue;

    const quantityInStockUnit = getPurchaseReceiptStockQuantity(item, product);
    await db.products.update(product.id, {
      stock: Number(product.stock || 0) + quantityInStockUnit,
      updated_at: occurredAt,
    });

    if (quantityInStockUnit > 0) {
      stockMutations.push(createStockMutation({
        product,
        warehouse: getPurchaseDocumentWarehouse(document),
        sourceType: 'PURCHASE_RETURN_VOID',
        sourceId: document.id,
        sourceNumber: document.document_number,
        sourceLineId: item.id,
        quantityDelta: quantityInStockUnit,
        sourceQuantity: item.received_quantity ?? item.quantity,
        sourceUnit: item.unit,
        reason,
        actor,
        occurredAt,
      }));
    }
  }

  return stockMutations;
};

const calculatePurchaseTotal = async (
  items: PurchaseDocumentItem[],
  snapshot: Partial<PurchaseDocument>,
  config: PurchaseDocumentConfig,
) => {
  const taxes = await db.taxes.toArray();

  return calculateDocumentTotal({
    items,
    discountType: snapshot.discount_type,
    discountValue: snapshot.discount_value,
    discountAmount: snapshot.discount_amount,
    taxRate: snapshot.tax_rate,
    taxCalculationMode: snapshot.tax_calculation_mode,
    taxId: snapshot.tax_id,
    taxName: snapshot.tax_name,
    taxCode: snapshot.tax_code,
    taxes,
    config,
  });
};

export const createPurchaseDocument = async ({ document, items }: PurchaseDocumentUpsertInput) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');

  if (!document.type) {
    throw new Error('Tipe dokumen wajib diisi.');
  }

  const config = getPurchaseDocumentConfig(document.type);
  const now = new Date();
  const createdAt = now.toISOString();
  const documentId = crypto.randomUUID();
  const snapshot = applyConfigBehavior(await buildDocumentSnapshot(document), config);
  const documentNumber = document.document_number || await createPurchaseDocumentNumber(config.numberPrefix, now);
  const normalizedItems = normalizeDocumentItems(items, documentId, createdAt, snapshot as DocumentCurrencySnapshot);
  const { items: calculatedItems, ...total } = await calculatePurchaseTotal(normalizedItems, snapshot, config);
  const calculatedItemsWithFx = calculatedItems.map((item) => (
    applyForeignAmountsToLineItem(item, snapshot as DocumentCurrencySnapshot)
  ));
  const foreignTotal = getForeignDocumentTotals(total, snapshot as DocumentCurrencySnapshot);
  const nextDocument = withCreatedPurchaseDocumentSync(applyConfigBehavior({
    id: documentId,
    document_number: documentNumber,
    type: document.type,
    status: document.status ?? 'DRAFT',
    supplier_name: snapshot.supplier_name ?? '',
    document_date: snapshot.document_date || createdAt.slice(0, 10),
    created_at: createdAt,
    updated_at: createdAt,
    ...snapshot,
    ...total,
    ...foreignTotal,
  } satisfies PurchaseDocument, config), currentUser);
  const products = await db.products.toArray();
  validatePurchaseDocument({ document: nextDocument, items: calculatedItemsWithFx, config, products });

  await db.transaction('rw', purchaseDocumentTables, async () => {
    await db.purchaseDocuments.add(nextDocument);
    await db.purchaseDocumentItems.bulkAdd(calculatedItemsWithFx);
    await writeActivityLog({
      user: currentUser,
      action: 'PURCHASE_DOCUMENT_CREATED',
      entity: 'purchaseDocuments',
      entity_id: nextDocument.id,
      description: `${currentUser?.name ?? 'User'} membuat ${config.title} ${nextDocument.document_number}.`,
    });
  });

  await enqueuePurchaseDocumentBundleSync(nextDocument, calculatedItemsWithFx, 'create');

  return { document: nextDocument, items: calculatedItemsWithFx };
};

export const updatePurchaseDocument = async (id: string, { document, items }: PurchaseDocumentUpsertInput) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');
  const existing = await db.purchaseDocuments.get(id);
  if (!existing) throw new Error('Dokumen tidak ditemukan.');
  assertDraft(existing);

  const config = getPurchaseDocumentConfig(existing.type);
  const updatedAt = new Date().toISOString();
  const snapshot = applyConfigBehavior(
    await buildDocumentSnapshot({ ...existing, ...document, type: existing.type }),
    config,
  );
  const normalizedItems = normalizeDocumentItems(items, id, existing.created_at, snapshot as DocumentCurrencySnapshot);
  const { items: calculatedItems, ...total } = await calculatePurchaseTotal(normalizedItems, snapshot, config);
  const calculatedItemsWithFx = calculatedItems.map((item) => (
    applyForeignAmountsToLineItem(item, snapshot as DocumentCurrencySnapshot)
  ));
  const foreignTotal = getForeignDocumentTotals(total, snapshot as DocumentCurrencySnapshot);
  const nextDocument = withUpdatedPurchaseDocumentSync(applyConfigBehavior({
    ...existing,
    ...snapshot,
    ...total,
    ...foreignTotal,
    id,
    type: existing.type,
    status: existing.status,
    document_number: existing.document_number,
    updated_at: updatedAt,
  } satisfies PurchaseDocument, config), existing, currentUser);
  const products = await db.products.toArray();
  validatePurchaseDocument({ document: nextDocument, items: calculatedItemsWithFx, config, products });

  await db.transaction('rw', purchaseDocumentTables, async () => {
    await db.purchaseDocuments.put(nextDocument);
    await db.purchaseDocumentItems.where('document_id').equals(id).delete();
    await db.purchaseDocumentItems.bulkAdd(calculatedItemsWithFx);
    await writeActivityLog({
      user: currentUser,
      action: 'PURCHASE_DOCUMENT_UPDATED',
      entity: 'purchaseDocuments',
      entity_id: id,
      description: `${currentUser?.name ?? 'User'} mengubah ${config.title} ${nextDocument.document_number}.`,
    });
  });

  await enqueuePurchaseDocumentBundleSync(nextDocument, calculatedItemsWithFx, 'update');

  return { document: nextDocument, items: calculatedItemsWithFx };
};

export const issuePurchaseDocument = async (id: string) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');
  const document = await db.purchaseDocuments.get(id);
  if (!document) throw new Error('Dokumen tidak ditemukan.');
  assertDraft(document);

  const config = getPurchaseDocumentConfig(document.type);
  const items = await db.purchaseDocumentItems.where('document_id').equals(id).toArray();
  const products = await db.products.toArray();
  validatePurchaseDocument({ document, items, config, products, mode: 'issue' });
  const now = new Date().toISOString();
  let stockMutations: StockMutation[] = [];
  const issuedDocument = withUpdatedPurchaseDocumentSync({
    ...document,
    status: 'ISSUED',
    issued_at: now,
    updated_at: now,
    ...(document.type === 'PURCHASE_INVOICE'
      ? { payment_status: document.payment_status ?? 'UNPAID', paid_amount: document.paid_amount ?? 0 }
      : {}),
  }, document, currentUser);

  await db.transaction('rw', purchaseDocumentTables, async () => {
    if (config.behavior.affectsStock) {
      if (document.type === 'PURCHASE_RETURN') {
        stockMutations = await removePurchaseReturnStock(issuedDocument, items, currentUser, now);
      } else {
        stockMutations = await addReceiptStock(issuedDocument, items, currentUser, now);
      }
    }

    await db.purchaseDocuments.put(issuedDocument);
    await writeActivityLog({
      user: currentUser,
      action: 'PURCHASE_DOCUMENT_ISSUED',
      entity: 'purchaseDocuments',
      entity_id: id,
      description: `${currentUser?.name ?? 'User'} menerbitkan ${config.title} ${document.document_number}.`,
    });
  });

  await enqueueStockMutations(stockMutations);
  await enqueuePurchaseDocumentBundleSync(issuedDocument, items, 'update');

  if (document.type === 'PURCHASE_RETURN') {
    await recalculatePurchaseInvoicePaymentsForReturnSource(document.source_document_id);
  }
};

export const convertPurchaseDocument = async (sourceId: string, targetType: PurchaseDocumentType) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');
  const source = await db.purchaseDocuments.get(sourceId);
  if (!source) throw new Error('Dokumen sumber tidak ditemukan.');
  if (source.status !== 'ISSUED') {
    throw new Error('Hanya dokumen terbit yang bisa di-convert.');
  }
  if (!allowedConversions[source.type].includes(targetType)) {
    throw new Error('Alur convert dokumen purchase tidak valid.');
  }

  const targetConfig = getPurchaseDocumentConfig(targetType);
  const now = new Date();
  const createdAt = now.toISOString();
  const targetId = crypto.randomUUID();
  const sourceItems = await db.purchaseDocumentItems.where('document_id').equals(sourceId).toArray();
  const products = await db.products.toArray();
  const productById = new Map(products.map((product) => [product.id, product]));
  const documentNumber = await createPurchaseDocumentNumber(targetConfig.numberPrefix, now);
  const discountAccountSnapshot = await getDocumentDiscountAccountSnapshot('purchase', source.discount_account_id);
  const sourceCurrencySnapshot = snapshotFromDocumentInput(source, undefined, source.document_date);
  const targetItems = normalizeDocumentItems(sourceItems.map((item) => {
    const product = productById.get(item.product_id);

    return {
      ...item,
      id: crypto.randomUUID(),
      document_id: targetId,
      ordered_quantity: targetType === 'PURCHASE_RECEIPT' ? item.quantity : item.ordered_quantity,
      received_quantity: targetType === 'PURCHASE_RECEIPT' ? item.received_quantity ?? item.quantity : undefined,
      price: targetConfig.behavior.hasPricing
        ? item.price ?? (product ? getPurchasePrice(product, item.unit) : 0)
        : undefined,
    };
  }), targetId, createdAt, sourceCurrencySnapshot);
  const snapshot = applyConfigBehavior(source, targetConfig);
  const { items: calculatedItems, ...total } = await calculatePurchaseTotal(targetItems, snapshot, targetConfig);
  const calculatedItemsWithFx = calculatedItems.map((item) => applyForeignAmountsToLineItem(item, sourceCurrencySnapshot));
  const foreignTotal = getForeignDocumentTotals(total, sourceCurrencySnapshot);
  const targetDocument = withCreatedPurchaseDocumentSync(applyConfigBehavior({
    ...source,
    id: targetId,
    document_number: documentNumber,
    type: targetType,
    status: 'DRAFT',
    source_document_id: source.id,
    source_document_number: source.document_number,
    source_document_type: source.type,
    payment_status: targetConfig.behavior.hasPaymentStatus ? 'UNPAID' : undefined,
    paid_amount: targetConfig.behavior.hasPaymentStatus ? 0 : undefined,
    finance_transaction_id: undefined,
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
    ...foreignTotal,
  } satisfies PurchaseDocument, targetConfig), currentUser);
  const convertedSourceDocument = nonClosingConversionTargets.has(targetType)
    ? null
    : withUpdatedPurchaseDocumentSync({
      ...source,
      status: 'CONVERTED',
      updated_at: createdAt,
    }, source, currentUser);

  await db.transaction('rw', purchaseDocumentTables, async () => {
    await db.purchaseDocuments.add(targetDocument);
    await db.purchaseDocumentItems.bulkAdd(calculatedItemsWithFx);
    if (convertedSourceDocument) {
      await db.purchaseDocuments.put(convertedSourceDocument);
    }
    await writeActivityLog({
      user: currentUser,
      action: 'PURCHASE_DOCUMENT_CONVERTED',
      entity: 'purchaseDocuments',
      entity_id: targetDocument.id,
      description: `${currentUser?.name ?? 'User'} convert ${source.document_number} menjadi ${targetDocument.document_number}.`,
    });
  });

  if (convertedSourceDocument) {
    await enqueuePurchaseDocumentBundleSync(convertedSourceDocument, sourceItems, 'update');
  }
  await enqueuePurchaseDocumentBundleSync(targetDocument, calculatedItemsWithFx, 'create');

  return { document: targetDocument, items: calculatedItemsWithFx };
};

export const voidPurchaseDocument = async (id: string, reason: string) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');
  const document = await db.purchaseDocuments.get(id);
  if (!document) throw new Error('Dokumen tidak ditemukan.');
  if (document.status === 'VOIDED') return;
  if (document.status !== 'DRAFT' && document.status !== 'ISSUED') {
    throw new Error('Hanya dokumen draft atau posted yang bisa di-void.');
  }
  if (document.type === 'PURCHASE_INVOICE' && (document.finance_transaction_id || Number(document.paid_amount || 0) > 0)) {
    throw new Error('Invoice yang sudah memiliki pembayaran tidak bisa di-void dari fitur ini.');
  }
  const normalizedReason = reason.trim();
  if (!normalizedReason) {
    throw new Error('Alasan pembatalan wajib diisi.');
  }

  const items = await db.purchaseDocumentItems.where('document_id').equals(id).toArray();
  const now = new Date().toISOString();
  let stockMutations: StockMutation[] = [];
  const voidedDocument = withUpdatedPurchaseDocumentSync({
    ...document,
    status: 'VOIDED',
    voided_at: now,
    void_reason: normalizedReason,
    updated_at: now,
  }, document, currentUser);

  await db.transaction('rw', purchaseDocumentTables, async () => {
    if (document.type === 'PURCHASE_RECEIPT' && document.status === 'ISSUED') {
      stockMutations = await restoreReceiptStock(document, items, currentUser, now, normalizedReason);
    } else if (document.type === 'PURCHASE_RETURN' && document.status === 'ISSUED') {
      stockMutations = await restorePurchaseReturnStock(document, items, currentUser, now, normalizedReason);
    }

    await db.purchaseDocuments.put(voidedDocument);
    await writeActivityLog({
      user: currentUser,
      action: 'PURCHASE_DOCUMENT_VOIDED',
      entity: 'purchaseDocuments',
      entity_id: id,
      description: `${currentUser?.name ?? 'User'} membatalkan ${document.document_number}. Alasan: ${normalizedReason}`,
    });
  });

  await enqueueStockMutations(stockMutations);
  await enqueuePurchaseDocumentBundleSync(voidedDocument, items, 'update');

  if (document.type === 'PURCHASE_RETURN') {
    await recalculatePurchaseInvoicePaymentsForReturnSource(document.source_document_id);
  }
};
