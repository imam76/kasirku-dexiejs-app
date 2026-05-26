import { FINANCE_CATEGORIES } from '@/constants/finance';
import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import type {
  SalesDocument,
  SalesDocumentItem,
  SalesReturn,
  SalesReturnItem,
  SalesReturnItemCondition,
  SalesReturnResolution,
  SalesReturnSourceItem,
  SalesReturnSourceType,
  SalesReturnStatus,
  SalesReturnableSource,
} from '@/types';
import { getFinanceAccountSnapshotForCategory } from '@/utils/chartOfAccounts/getFinanceAccountSnapshotForCategory';
import { konversiSatuanProduk } from '@/utils/pricing';
import { isTransactionActive } from '@/utils/transactions';
import { getIssuedReturnSummaryForSource, loadSalesReturnSourceChain } from '@/services/salesReturnReadService';
import { recalculateSalesInvoicePaymentStatus } from '@/services/salesDocumentService';
import { calculateSalesReturnLimits } from '@/utils/salesReturns/calculateSalesReturnLimits';
import { calculateSalesReturnTotal } from '@/utils/salesReturns/calculateSalesReturnTotal';
import { createSalesReturnNumber } from '@/utils/salesReturns/createSalesReturnNumber';
import { getSalesReturnStockPolicy, type SalesReturnStockPolicy } from '@/utils/salesReturns/getSalesReturnStockPolicy';
import { mapSalesReturnSourceItem } from '@/utils/salesReturns/mapSalesReturnSourceItem';
import { validateSalesReturn } from '@/utils/salesReturns/validateSalesReturn';
import type { SalesReturnSourceChain } from '@/utils/salesReturns/resolveSalesReturnSourceChain';

export interface SalesReturnItemInput {
  source_item_id: string;
  quantity: number;
  condition: SalesReturnItemCondition;
  restock_quantity?: number;
}

export interface SalesReturnUpsertInput {
  salesReturn: Partial<SalesReturn> & {
    source_type: SalesReturnSourceType;
    source_id: string;
    resolution?: SalesReturnResolution;
    document_date?: string;
  };
  items: SalesReturnItemInput[];
}

const salesReturnTables = [
  db.salesReturns,
  db.salesReturnItems,
  db.salesDocuments,
  db.salesDocumentItems,
  db.transactions,
  db.transactionItems,
  db.products,
  db.financeTransactions,
  db.financeBalance,
  db.chartOfAccounts,
  db.financeAccountMappings,
  db.profitLogs,
  db.profitBalance,
  db.activityLogs,
];

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const assertDraft = (salesReturn: SalesReturn) => {
  if (salesReturn.status !== 'DRAFT') {
    throw new Error('Hanya retur draft yang bisa diubah.');
  }
};

const getSalesDocumentSourceType = (document: SalesDocument): SalesReturnSourceType => {
  if (document.type !== 'SALES_DELIVERY' && document.type !== 'SALES_INVOICE') {
    throw new Error('Hanya Sales Delivery dan Sales Invoice yang bisa diretur pada fase ini.');
  }

  return document.type;
};

const getSourceQuantity = (document: SalesDocument, item: SalesDocumentItem) => (
  document.type === 'SALES_DELIVERY'
    ? Number(item.delivered_quantity ?? item.quantity ?? 0)
    : Number(item.quantity || 0)
);

const mapSalesDocumentSourceItems = (
  document: SalesDocument,
  items: SalesDocumentItem[],
  summary: Awaited<ReturnType<typeof getIssuedReturnSummaryForSource>>,
  sourceChain: SalesReturnSourceChain,
  stockPolicy: SalesReturnStockPolicy,
): SalesReturnSourceItem[] => items.map((item) => {
  const sourceQuantity = getSourceQuantity(document, item);
  const returnedQuantity = summary.items[item.id]?.quantity || 0;
  const sourceStockItemId = sourceChain.source_stock_item_id_by_current_item_id[item.id] ??
    (stockPolicy.source_stock_document_id === document.id ? item.id : undefined);

  return {
    source_item_id: item.id,
    product_id: item.product_id,
    product_name: item.product_name,
    sku: item.sku,
    unit: item.unit,
    source_quantity: sourceQuantity,
    remaining_quantity: Math.max(0, sourceQuantity - returnedQuantity),
    price: Number(item.price || 0),
    discount_amount: Number(item.discount_amount || 0),
    tax_amount: Number(item.tax_amount || 0),
    subtotal: Number(item.subtotal || 0),
    total_amount: Number(item.total_amount ?? item.subtotal ?? 0),
    purchase_price: item.purchase_price,
    can_restock: stockPolicy.can_restock,
    source_stock_item_id: sourceStockItemId,
    source_stock_document_id: stockPolicy.source_stock_document_id,
    source_stock_document_type: stockPolicy.source_stock_document_type,
    source_stock_document_number: stockPolicy.source_stock_document_number,
  };
});

interface GetReturnableSourceOptions {
  excludeReturnId?: string;
}

export const getReturnableSource = async (
  sourceType: SalesReturnSourceType,
  sourceId: string,
  options: GetReturnableSourceOptions = {},
): Promise<SalesReturnableSource> => {
  if (sourceType === 'SALES_DELIVERY' || sourceType === 'SALES_INVOICE') {
    const sourceChain = await loadSalesReturnSourceChain(sourceType, sourceId);
    if (!sourceChain) throw new Error('Source dokumen tidak ditemukan.');
    const { source: document, sourceItems: items, chain } = sourceChain;
    if (getSalesDocumentSourceType(document) !== sourceType) {
      throw new Error('Tipe source retur tidak sesuai.');
    }

    if (!chain.can_return_from_source) {
      throw new Error(chain.return_from_source_block_reason || 'Source ini harus diretur dari dokumen chain yang aktif.');
    }

    const stockPolicy = getSalesReturnStockPolicy({
      source_type: sourceType,
      source_id: document.id,
      source_number: document.document_number,
      source_stock_document_id: chain.source_stock_document_id,
      source_stock_document_type: chain.source_stock_document_type,
      source_stock_document_number: chain.source_stock_document_number,
    });
    const summary = await getIssuedReturnSummaryForSource(sourceType, sourceId, options);
    const sourceItems = mapSalesDocumentSourceItems(document, items, summary, chain, stockPolicy);
    const limits = calculateSalesReturnLimits({
      sourceItems,
      issuedSummary: summary,
      invoice: document.type === 'SALES_INVOICE' ? document : undefined,
      stockPolicy,
    });

    return {
      source_type: sourceType,
      source_id: document.id,
      source_number: document.document_number,
      source_document_type: document.type,
      status: document.status,
      contact_id: document.contact_id,
      customer_name: document.customer_name,
      customer_phone: document.customer_phone,
      customer_email: document.customer_email,
      customer_address: document.customer_address,
      document_date: document.document_date,
      source_chain_label: chain.source_chain_label,
      source_chain_notice: chain.return_from_source_block_reason,
      source_stock_document_id: stockPolicy.source_stock_document_id,
      source_stock_document_type: stockPolicy.source_stock_document_type,
      source_stock_document_number: stockPolicy.source_stock_document_number,
      can_restock: stockPolicy.can_restock,
      limits,
      items: sourceItems,
    };
  }

  const transaction = await db.transactions.get(sourceId);
  if (!transaction) throw new Error('Transaksi POS tidak ditemukan.');

  if (!isTransactionActive(transaction)) {
    throw new Error('Transaksi POS yang sudah void tidak bisa diretur.');
  }

  throw new Error('Retur POS belum aktif pada fase ini.');
};

const getSourceStatus = async (
  sourceType: SalesReturnSourceType,
  sourceId: string,
) => {
  if (sourceType === 'SALES_DELIVERY' || sourceType === 'SALES_INVOICE') {
    return (await db.salesDocuments.get(sourceId))?.status;
  }

  return (await db.transactions.get(sourceId))?.status ?? 'COMPLETED';
};

const getDefaultResolution = (
  source: SalesReturnableSource,
  totalAmount: number,
): SalesReturnResolution => {
  if (source.source_type === 'SALES_DELIVERY' || totalAmount <= 0) {
    return 'NO_FINANCE';
  }

  if (source.limits && source.limits.credit_note_limit >= totalAmount) {
    return 'CREDIT_NOTE';
  }

  if (source.limits && source.limits.refund_limit >= totalAmount) {
    return 'REFUND';
  }

  return 'CREDIT_NOTE';
};

const buildSalesReturnDraft = async (
  input: SalesReturnUpsertInput,
  existing?: SalesReturn,
) => {
  const source = await getReturnableSource(input.salesReturn.source_type, input.salesReturn.source_id, {
    excludeReturnId: existing?.id,
  });
  const sourceItemsById = new Map(source.items.map((item) => [item.source_item_id, item]));
  const now = new Date();
  const updatedAt = now.toISOString();
  const createdAt = existing?.created_at || updatedAt;
  const returnId = existing?.id || crypto.randomUUID();
  const normalizedInputItems = input.items.filter((item) => Number(item.quantity || 0) > 0);
  const items = normalizedInputItems.map((item) => {
    const sourceItem = sourceItemsById.get(item.source_item_id);
    if (!sourceItem) {
      throw new Error('Item source retur tidak ditemukan.');
    }

    return mapSalesReturnSourceItem({
      sourceItem,
      returnId,
      quantity: item.quantity,
      condition: item.condition,
      restockQuantity: item.restock_quantity,
      createdAt,
    });
  });
  const total = calculateSalesReturnTotal(items);
  const resolution = input.salesReturn.resolution ?? getDefaultResolution(source, total.total_amount);
  const refundAmount = resolution === 'REFUND'
    ? roundCurrency(Math.min(Number(input.salesReturn.refund_amount ?? total.total_amount), total.total_amount))
    : 0;
  const creditAmount = resolution === 'CREDIT_NOTE'
    ? roundCurrency(Math.min(Number(input.salesReturn.credit_amount ?? total.total_amount), total.total_amount))
    : 0;
  const salesReturn: SalesReturn = {
    id: returnId,
    return_number: existing?.return_number || input.salesReturn.return_number || await createSalesReturnNumber(now),
    status: existing?.status || 'DRAFT',
    source_type: source.source_type,
    source_id: source.source_id,
    source_number: source.source_number,
    source_document_type: source.source_document_type,
    contact_id: source.contact_id,
    customer_name: source.customer_name,
    customer_phone: source.customer_phone,
    customer_email: source.customer_email,
    customer_address: source.customer_address,
    document_date: input.salesReturn.document_date || updatedAt.slice(0, 10),
    resolution,
    reason: input.salesReturn.reason?.trim() || undefined,
    subtotal_amount: total.subtotal_amount,
    discount_amount: total.discount_amount,
    tax_amount: total.tax_amount,
    total_amount: total.total_amount,
    refund_amount: refundAmount,
    credit_amount: creditAmount,
    finance_transaction_id: existing?.finance_transaction_id,
    reversal_finance_transaction_id: existing?.reversal_finance_transaction_id,
    source_stock_document_id: source.source_stock_document_id,
    source_stock_document_type: source.source_stock_document_type,
    source_stock_document_number: source.source_stock_document_number,
    issued_at: existing?.issued_at,
    voided_at: existing?.voided_at,
    void_reason: existing?.void_reason,
    created_at: createdAt,
    updated_at: updatedAt,
  };

  const sourceStatus = await getSourceStatus(source.source_type, source.source_id);
  const remainingQuantityBySourceItemId = source.items.reduce((acc, item) => {
    acc[item.source_item_id] = item.remaining_quantity;
    return acc;
  }, {} as Record<string, number>);

  validateSalesReturn({
    salesReturn,
    items: total.items,
    sourceStatus,
    remainingQuantityBySourceItemId,
    limits: source.limits,
  });

  return { salesReturn, items: total.items };
};

const normalizeItemsForSourcePolicy = (
  items: SalesReturnItem[],
  source: SalesReturnableSource,
) => {
  const sourceItemsById = new Map(source.items.map((item) => [item.source_item_id, item]));

  return calculateSalesReturnTotal(items.map((item) => {
    const sourceItem = sourceItemsById.get(item.source_item_id);
    if (!sourceItem) return item;

    const canRestock = sourceItem.can_restock !== false;
    return {
      ...item,
      restock_quantity: canRestock ? Math.min(Number(item.restock_quantity ?? item.quantity ?? 0), Number(item.quantity || 0)) : 0,
      source_stock_item_id: sourceItem.source_stock_item_id,
      source_stock_document_id: sourceItem.source_stock_document_id,
      source_stock_document_type: sourceItem.source_stock_document_type,
    };
  })).items;
};

const applyRestockEffect = async (
  items: SalesReturnItem[],
  direction: 1 | -1,
) => {
  for (const item of items) {
    const restockQuantity = Number(item.restock_quantity || 0);
    if (restockQuantity <= 0) continue;

    const product = await db.products.get(item.product_id);
    if (!product) {
      throw new Error(`Produk ${item.product_name} tidak ditemukan.`);
    }

    const stockQuantity = konversiSatuanProduk(restockQuantity, product, item.unit, product.purchase_unit);
    const nextStock = product.stock + (direction * stockQuantity);
    if (nextStock < 0) {
      throw new Error(`Stok ${product.name} tidak cukup untuk membatalkan retur.`);
    }

    await db.products.update(product.id, { stock: nextStock });
  }
};

const createRefundFinanceTransaction = async (
  salesReturn: SalesReturn,
  now: string,
) => {
  const refundAmount = Number(salesReturn.refund_amount || 0);
  if (salesReturn.resolution !== 'REFUND' || refundAmount <= 0) {
    return undefined;
  }

  const currentBalance = await db.financeBalance.get('current');
  await db.financeBalance.put({
    id: 'current',
    amount: (currentBalance?.amount || 0) - refundAmount,
    updated_at: now,
  });

  const financeTransactionId = crypto.randomUUID();
  await db.financeTransactions.add({
    id: financeTransactionId,
    type: 'EXPENSE',
    category: FINANCE_CATEGORIES.SALES_REFUND,
    amount: refundAmount,
    description: `Refund retur ${salesReturn.return_number} dari ${salesReturn.source_number}`,
    created_at: now,
    reference_id: salesReturn.id,
    ...await getFinanceAccountSnapshotForCategory(FINANCE_CATEGORIES.SALES_REFUND),
  });

  return financeTransactionId;
};

const reverseRefundFinanceTransaction = async (
  salesReturn: SalesReturn,
  now: string,
) => {
  if (salesReturn.resolution !== 'REFUND') return undefined;

  const financeTransaction = salesReturn.finance_transaction_id
    ? await db.financeTransactions.get(salesReturn.finance_transaction_id)
    : undefined;
  const amount = Number(financeTransaction?.amount ?? salesReturn.refund_amount ?? 0);
  if (amount <= 0) return undefined;

  const currentBalance = await db.financeBalance.get('current');
  await db.financeBalance.put({
    id: 'current',
    amount: (currentBalance?.amount || 0) + amount,
    updated_at: now,
  });

  const reversalFinanceTransactionId = crypto.randomUUID();
  await db.financeTransactions.add({
    id: reversalFinanceTransactionId,
    type: 'INCOME',
    category: FINANCE_CATEGORIES.SALES_REFUND,
    amount,
    description: `Pembalikan refund retur ${salesReturn.return_number}`,
    created_at: now,
    reference_id: salesReturn.id,
    ...await getFinanceAccountSnapshotForCategory(FINANCE_CATEGORIES.SALES_REFUND),
  });

  return reversalFinanceTransactionId;
};

const applyPosProfitReversal = async (
  salesReturn: SalesReturn,
  items: SalesReturnItem[],
  now: string,
  direction: 1 | -1,
) => {
  if (salesReturn.source_type !== 'POS_TRANSACTION') return;

  const profitReversal = roundCurrency(items.reduce((sum, item) => sum + Number(item.profit_reversal || 0), 0));
  if (profitReversal === 0) return;

  const currentProfitBalance = await db.profitBalance.get('current');
  const nextProfitBalance = (currentProfitBalance?.amount || 0) + (direction * -profitReversal);

  await db.profitBalance.put({
    id: 'current',
    amount: nextProfitBalance,
    updated_at: now,
  });

  await db.profitLogs.add({
    id: crypto.randomUUID(),
    transaction_id: salesReturn.source_id,
    amount: profitReversal,
    type: direction === 1 ? 'OUT' : 'IN',
    category: 'SALES_RETURN',
    description: `${direction === 1 ? 'Koreksi' : 'Pembalikan koreksi'} profit retur ${salesReturn.return_number}`,
    created_at: now,
    balance_after: nextProfitBalance,
  });
};

export const createSalesReturn = async (input: SalesReturnUpsertInput) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'SALES_RETURN_MANAGE');
  const { salesReturn, items } = await buildSalesReturnDraft(input);

  await db.transaction('rw', salesReturnTables, async () => {
    await db.salesReturns.add(salesReturn);
    await db.salesReturnItems.bulkAdd(items);
    await writeActivityLog({
      user: currentUser,
      action: 'SALES_RETURN_CREATED',
      entity: 'salesReturns',
      entity_id: salesReturn.id,
      description: `${currentUser?.name ?? 'User'} membuat retur ${salesReturn.return_number} untuk ${salesReturn.source_number}.`,
    });
  });

  return { salesReturn, items };
};

export const updateSalesReturn = async (id: string, input: SalesReturnUpsertInput) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'SALES_RETURN_MANAGE');
  const existing = await db.salesReturns.get(id);
  if (!existing) throw new Error('Retur tidak ditemukan.');
  assertDraft(existing);

  const { salesReturn, items } = await buildSalesReturnDraft(input, existing);

  await db.transaction('rw', salesReturnTables, async () => {
    await db.salesReturns.put(salesReturn);
    await db.salesReturnItems.where('return_id').equals(id).delete();
    await db.salesReturnItems.bulkAdd(items);
    await writeActivityLog({
      user: currentUser,
      action: 'SALES_RETURN_UPDATED',
      entity: 'salesReturns',
      entity_id: salesReturn.id,
      description: `${currentUser?.name ?? 'User'} mengubah retur ${salesReturn.return_number} untuk ${salesReturn.source_number}.`,
    });
  });

  return { salesReturn, items };
};

export const issueSalesReturn = async (id: string) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'SALES_RETURN_MANAGE');
  const salesReturn = await db.salesReturns.get(id);
  if (!salesReturn) throw new Error('Retur tidak ditemukan.');
  assertDraft(salesReturn);

  const storedItems = await db.salesReturnItems.where('return_id').equals(id).toArray();
  const source = await getReturnableSource(salesReturn.source_type, salesReturn.source_id, { excludeReturnId: id });
  const items = normalizeItemsForSourcePolicy(storedItems, source);
  const sourceStatus = await getSourceStatus(salesReturn.source_type, salesReturn.source_id);
  const remainingQuantityBySourceItemId = source.items.reduce((acc, item) => {
    acc[item.source_item_id] = item.remaining_quantity;
    return acc;
  }, {} as Record<string, number>);

  validateSalesReturn({
    salesReturn,
    items,
    sourceStatus,
    remainingQuantityBySourceItemId,
    limits: source.limits,
  });

  const now = new Date().toISOString();

  await db.transaction('rw', salesReturnTables, async () => {
    await applyRestockEffect(items, 1);
    const financeTransactionId = await createRefundFinanceTransaction(salesReturn, now);
    await applyPosProfitReversal(salesReturn, items, now, 1);
    await db.salesReturnItems.bulkPut(items);
    await db.salesReturns.update(id, {
      status: 'ISSUED' satisfies SalesReturnStatus,
      issued_at: now,
      finance_transaction_id: financeTransactionId,
      source_stock_document_id: source.source_stock_document_id,
      source_stock_document_type: source.source_stock_document_type,
      source_stock_document_number: source.source_stock_document_number,
      updated_at: now,
    });
    if (salesReturn.source_type === 'SALES_INVOICE') {
      await recalculateSalesInvoicePaymentStatus(salesReturn.source_id);
    }
    await writeActivityLog({
      user: currentUser,
      action: 'SALES_RETURN_ISSUED',
      entity: 'salesReturns',
      entity_id: id,
      description: `${currentUser?.name ?? 'User'} menerbitkan retur ${salesReturn.return_number} untuk ${salesReturn.source_number}.`,
    });
  });
};

export const voidSalesReturn = async (id: string, reason: string) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'SALES_RETURN_MANAGE');
  const salesReturn = await db.salesReturns.get(id);
  if (!salesReturn) throw new Error('Retur tidak ditemukan.');
  if (salesReturn.status === 'VOIDED') return;

  const normalizedReason = reason.trim();
  if (!normalizedReason) {
    throw new Error('Alasan void retur wajib diisi.');
  }

  const items = await db.salesReturnItems.where('return_id').equals(id).toArray();
  const now = new Date().toISOString();

  await db.transaction('rw', salesReturnTables, async () => {
    let reversalFinanceTransactionId = salesReturn.reversal_finance_transaction_id;
    if (salesReturn.status === 'ISSUED') {
      await applyRestockEffect(items, -1);
      reversalFinanceTransactionId = await reverseRefundFinanceTransaction(salesReturn, now);
      await applyPosProfitReversal(salesReturn, items, now, -1);
    }

    await db.salesReturns.update(id, {
      status: 'VOIDED' satisfies SalesReturnStatus,
      voided_at: now,
      void_reason: normalizedReason,
      reversal_finance_transaction_id: reversalFinanceTransactionId,
      updated_at: now,
    });
    if (salesReturn.source_type === 'SALES_INVOICE') {
      await recalculateSalesInvoicePaymentStatus(salesReturn.source_id);
    }
    await writeActivityLog({
      user: currentUser,
      action: 'SALES_RETURN_VOIDED',
      entity: 'salesReturns',
      entity_id: id,
      description: `${currentUser?.name ?? 'User'} membatalkan retur ${salesReturn.return_number}. Source ${salesReturn.source_number}. Alasan: ${normalizedReason}`,
    });
  });
};

export const listReturnableSalesDocumentSources = async () => {
  const documents = await db.salesDocuments
    .where('status')
    .equals('ISSUED')
    .filter((document) => document.type === 'SALES_DELIVERY' || document.type === 'SALES_INVOICE')
    .toArray();

  const documentsWithPolicy = await Promise.all(documents.map(async (document) => {
    if (document.type !== 'SALES_DELIVERY') return document;

    const sourceChain = await loadSalesReturnSourceChain('SALES_DELIVERY', document.id);
    return sourceChain?.chain.can_return_from_source ? document : undefined;
  }));

  return documentsWithPolicy.filter((document): document is SalesDocument => Boolean(document));
};
