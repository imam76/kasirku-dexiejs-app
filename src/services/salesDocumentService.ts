import { FINANCE_CATEGORIES } from '@/constants/finance';
import { getSalesDocumentConfig, type SalesDocumentConfig } from '@/configs/sales-document';
import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import { getIssuedReturnSummaryForSource } from '@/services/salesReturnReadService';
import {
  postSalesInvoiceIssuedJournal,
  postSalesInvoicePaymentJournal,
  reverseSalesInvoiceJournal,
} from '@/services/generalLedgerService';
import type {
  SalesDocument,
  SalesDocumentItem,
  SalesDocumentStatus,
  SalesDocumentType,
} from '@/types';
import { getFinanceAccountSnapshotForCategory } from '@/utils/chartOfAccounts/getFinanceAccountSnapshotForCategory';
import { konversiSatuanProduk } from '@/utils/pricing';
import { calculateInvoicePaymentStatus } from '@/utils/salesDocuments/calculateInvoicePaymentStatus';
import { calculateDocumentTotal } from '@/utils/salesDocuments/calculateDocumentTotal';
import { createSalesDocumentNumber } from '@/utils/salesDocuments/createSalesDocumentNumber';
import {
  createContactSnapshot,
  createDepartmentSnapshot,
  createProjectSnapshot,
  createTaxSnapshot,
} from '@/utils/salesDocuments/createSalesDocumentSnapshots';
import { validateSalesDocument } from '@/utils/salesDocuments/validateSalesDocument';

export interface SalesDocumentUpsertInput {
  document: Partial<SalesDocument>;
  items: SalesDocumentItem[];
}

export interface SalesInvoicePaymentInput {
  paid_amount: number;
  paid_at?: string;
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
  db.journalEntries,
  db.journalEntryLines,
  db.activityLogs,
];

const buildDocumentSnapshot = async (input: Partial<SalesDocument>): Promise<Partial<SalesDocument>> => {
  const [contact, tax, department, project] = await Promise.all([
    input.contact_id ? db.contacts.get(input.contact_id) : undefined,
    input.tax_id ? db.taxes.get(input.tax_id) : undefined,
    input.department_id ? db.departments.get(input.department_id) : undefined,
    input.project_id ? db.projects.get(input.project_id) : undefined,
  ]);

  return {
    ...input,
    ...createContactSnapshot(contact),
    ...createTaxSnapshot(tax),
    ...createDepartmentSnapshot(department),
    ...createProjectSnapshot(project),
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

const reduceDeliveryStock = async (items: SalesDocumentItem[]) => {
  for (const item of items) {
    const product = await db.products.get(item.product_id);
    if (!product) continue;

    const quantity = item.delivered_quantity ?? item.quantity;
    const quantityInStockUnit = konversiSatuanProduk(quantity, product, item.unit, product.purchase_unit);
    await db.products.update(product.id, {
      stock: product.stock - quantityInStockUnit,
    });
  }
};

const restoreDeliveryStock = async (items: SalesDocumentItem[]) => {
  for (const item of items) {
    const product = await db.products.get(item.product_id);
    if (!product) continue;

    const quantity = item.delivered_quantity ?? item.quantity;
    const quantityInStockUnit = konversiSatuanProduk(quantity, product, item.unit, product.purchase_unit);
    await db.products.update(product.id, {
      stock: product.stock + quantityInStockUnit,
    });
  }
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
  delete nextDocument.finance_transaction_id;
  return nextDocument as T;
};

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
    discountAmount: snapshot.discount_amount,
    taxRate: snapshot.tax_rate,
    taxCalculationMode: snapshot.tax_calculation_mode,
    taxId: snapshot.tax_id,
    taxName: snapshot.tax_name,
    taxCode: snapshot.tax_code,
    config,
  });
  const nextDocument = applyPaymentStatusBehavior({
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
  } satisfies SalesDocument, config);
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
    discountAmount: snapshot.discount_amount,
    taxRate: snapshot.tax_rate,
    taxCalculationMode: snapshot.tax_calculation_mode,
    taxId: snapshot.tax_id,
    taxName: snapshot.tax_name,
    taxCode: snapshot.tax_code,
    config,
  });
  const nextDocument = applyPaymentStatusBehavior({
    ...existing,
    ...snapshot,
    ...total,
    id,
    type: existing.type,
    status: existing.status,
    document_number: existing.document_number,
    updated_at: updatedAt,
  } satisfies SalesDocument, config);
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

  await db.transaction('rw', salesDocumentTables, async () => {
    const issuedDocument: SalesDocument = {
      ...document,
      status: 'ISSUED',
      issued_at: now,
      updated_at: now,
    };

    if (config.behavior.affectsStock) {
      await reduceDeliveryStock(items);
    }

    await db.salesDocuments.update(id, {
      status: 'ISSUED' satisfies SalesDocumentStatus,
      issued_at: now,
      updated_at: now,
    });
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
  const targetItems = normalizeDocumentItems(sourceItems.map((item) => ({
    ...item,
    id: crypto.randomUUID(),
    document_id: targetId,
  })), targetId, createdAt);
  const { items: calculatedItems, ...total } = calculateDocumentTotal({
    items: targetItems,
    discountAmount: source.discount_amount,
    taxRate: source.tax_rate,
    taxCalculationMode: source.tax_calculation_mode,
    taxId: source.tax_id,
    taxName: source.tax_name,
    taxCode: source.tax_code,
    config: targetConfig,
  });
  const targetDocument = applyPaymentStatusBehavior({
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
    created_at: createdAt,
    updated_at: createdAt,
    ...total,
  } satisfies SalesDocument, targetConfig);

  await db.transaction('rw', salesDocumentTables, async () => {
    await db.salesDocuments.add(targetDocument);
    await db.salesDocumentItems.bulkAdd(calculatedItems);
    await db.salesDocuments.update(sourceId, {
      status: 'CONVERTED',
      updated_at: createdAt,
    });
    await writeActivityLog({
      user: currentUser,
      action: 'SALES_DOCUMENT_CONVERTED',
      entity: 'salesDocuments',
      entity_id: targetDocument.id,
      description: `${currentUser?.name ?? 'User'} convert ${source.document_number} menjadi ${targetDocument.document_number}.`,
    });
  });

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
  if (document.type === 'SALES_INVOICE' && document.finance_transaction_id) {
    throw new Error('Invoice yang sudah memiliki pembayaran tidak bisa di-void dari fitur ini.');
  }
  const normalizedReason = reason.trim();
  if (!normalizedReason) {
    throw new Error('Alasan pembatalan wajib diisi.');
  }

  const items = await db.salesDocumentItems.where('document_id').equals(id).toArray();
  const now = new Date().toISOString();

  await db.transaction('rw', salesDocumentTables, async () => {
    if (document.type === 'SALES_DELIVERY' && document.status === 'ISSUED') {
      await restoreDeliveryStock(items);
    }

    await db.salesDocuments.update(id, {
      status: 'VOIDED',
      voided_at: now,
      void_reason: normalizedReason,
      updated_at: now,
    });
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
};

export const recalculateSalesInvoicePaymentStatus = async (invoiceId: string) => {
  const document = await db.salesDocuments.get(invoiceId);
  if (!document || document.type !== 'SALES_INVOICE') return;

  const returnSummary = await getIssuedReturnSummaryForSource('SALES_INVOICE', invoiceId);
  const { paymentStatus } = calculateInvoicePaymentStatus({
    invoiceTotal: Number(document.total_amount || 0),
    paidAmount: Number(document.paid_amount || 0),
    issuedCreditAmount: Number(returnSummary.credit_amount || 0),
  });

  await db.salesDocuments.update(invoiceId, {
    payment_status: paymentStatus,
    updated_at: new Date().toISOString(),
  });
};

export const markSalesInvoicePaid = async (id: string, input: SalesInvoicePaymentInput) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');
  const document = await db.salesDocuments.get(id);
  if (!document) throw new Error('Dokumen tidak ditemukan.');
  if (document.type !== 'SALES_INVOICE') throw new Error('Hanya Sales Invoice yang bisa dibayar.');
  if (document.status === 'VOIDED') throw new Error('Invoice voided tidak bisa dibayar.');

  const total = Number(document.total_amount || 0);
  const returnSummary = await getIssuedReturnSummaryForSource('SALES_INVOICE', id);
  const requestedPaidAmount = Math.max(0, Number(input.paid_amount || 0));
  const { netInvoiceAmount, paymentStatus } = calculateInvoicePaymentStatus({
    invoiceTotal: total,
    paidAmount: requestedPaidAmount,
    issuedCreditAmount: Number(returnSummary.credit_amount || 0),
  });
  if (requestedPaidAmount > netInvoiceAmount + 0.01) {
    throw new Error(`Pembayaran melebihi nilai invoice setelah credit note. Maksimal pembayaran Rp ${netInvoiceAmount}.`);
  }

  const nextPaidAmount = requestedPaidAmount;
  const now = new Date().toISOString();
  const paidAt = input.paid_at || now;
  const previousPaidAmount = Number(document.paid_amount || 0);
  const delta = nextPaidAmount - previousPaidAmount;

  await db.transaction('rw', salesDocumentTables, async () => {
    let financeTransactionId = document.finance_transaction_id;

    if (delta !== 0) {
      const accountSnapshot = await getFinanceAccountSnapshotForCategory(FINANCE_CATEGORIES.SALES_INVOICE_PAYMENT);
      const currentBalance = await db.financeBalance.get('current');
      await db.financeBalance.put({
        id: 'current',
        amount: (currentBalance?.amount || 0) + delta,
        updated_at: now,
      });

      if (financeTransactionId) {
        const financeTransaction = await db.financeTransactions.get(financeTransactionId);
        if (financeTransaction) {
          await db.financeTransactions.update(financeTransactionId, {
            amount: nextPaidAmount,
            created_at: paidAt,
            description: `Pembayaran invoice ${document.document_number}`,
            ...accountSnapshot,
          });
        } else {
          financeTransactionId = undefined;
        }
      }

      if (!financeTransactionId && nextPaidAmount > 0) {
        financeTransactionId = crypto.randomUUID();
        await db.financeTransactions.add({
          id: financeTransactionId,
          type: 'INCOME',
          category: FINANCE_CATEGORIES.SALES_INVOICE_PAYMENT,
          amount: nextPaidAmount,
          description: `Pembayaran invoice ${document.document_number}`,
          created_at: paidAt,
          reference_id: document.id,
          ...accountSnapshot,
        });
      }
    }

    const updatedDocument: SalesDocument = {
      ...document,
      payment_status: paymentStatus,
      paid_amount: nextPaidAmount,
      paid_at: nextPaidAmount > 0 ? paidAt : undefined,
      finance_transaction_id: financeTransactionId,
      updated_at: now,
    };

    await db.salesDocuments.update(id, {
      payment_status: updatedDocument.payment_status,
      paid_amount: updatedDocument.paid_amount,
      paid_at: updatedDocument.paid_at,
      finance_transaction_id: updatedDocument.finance_transaction_id,
      updated_at: updatedDocument.updated_at,
    });
    await postSalesInvoicePaymentJournal(updatedDocument);
    await writeActivityLog({
      user: currentUser,
      action: 'SALES_INVOICE_PAYMENT_RECORDED',
      entity: 'salesDocuments',
      entity_id: id,
      description: `${currentUser?.name ?? 'User'} mencatat pembayaran invoice ${document.document_number} sebesar ${nextPaidAmount}.`,
    });
  });
};
