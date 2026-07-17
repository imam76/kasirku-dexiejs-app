import { db } from '@/lib/db';
import { konversiSatuanProduk } from '@/utils/pricing';
import { getCurrentSessionUser, requireUserPermission } from '@/auth/authService';

export interface StockCardRow {
  id: string;
  date: string;
  sourceType: string;
  sourceNumber: string;
  qtyIn: number;
  qtyOut: number;
  unit: string;
  balance: number;
}

type StockCardMovement = Omit<StockCardRow, 'balance'>;

const numberOrFallback = (value: unknown, fallback: number) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

const toFiniteNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const roundQuantity = (value: number) => Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;

const getMovementTime = (movement: Pick<StockCardMovement, 'date'>) => {
  const timestamp = new Date(movement.date).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const getMovementDelta = (movement: Pick<StockCardMovement, 'qtyIn' | 'qtyOut'>) => movement.qtyIn - movement.qtyOut;

const isDefined = <T,>(value: T | null | undefined): value is T => value !== null && value !== undefined;

const uniqueIds = (ids: string[]) => Array.from(new Set(ids));

const toEntityMap = <T extends { id: string }>(records: Array<T | undefined>) => (
  new Map(records.filter(isDefined).map((record) => [record.id, record]))
);

const stockImpactPurchaseStatuses = new Set(['ISSUED', 'CONVERTED', 'VOIDED']);

const isPurchaseInvoiceBackedByReceipt = (document: { type: string; source_document_type?: string }) => (
  document.type === 'PURCHASE_INVOICE' && document.source_document_type === 'PURCHASE_RECEIPT'
);

const isPurchaseStockInDocument = (document: { type: string; source_document_type?: string }) => (
  document.type === 'PURCHASE_RECEIPT' ||
  (document.type === 'PURCHASE_INVOICE' && !isPurchaseInvoiceBackedByReceipt(document))
);

export const getStockCard = async (productId: string, startDate: Date, endDate: Date): Promise<{ openingBalance: number; rows: StockCardRow[] }> => {
  await requireUserPermission(await getCurrentSessionUser(), 'REPORT_STOCK_CARD_VIEW');
  const product = await db.products.get(productId);
  if (!product) {
    throw new Error('Produk tidak ditemukan');
  }

  const baseUnit = product.purchase_unit;
  const allMutations: StockCardMovement[] = [];

  // 1. Manual opening stock entries. Migration-generated opening lots do not
  // have source_id/source_line_id and are skipped to avoid double counting.
  const openingLots = await db.inventoryLots
    .where('product_id')
    .equals(productId)
    .filter((lot) => lot.source_type === 'OPENING' && Boolean(lot.source_id || lot.source_line_id))
    .toArray();

  for (const lot of openingLots) {
    const quantity = toFiniteNumber(lot.quantity_received);
    if (quantity <= 0) continue;

    allMutations.push({
      id: `opening_stock_${lot.id}`,
      date: lot.received_at,
      sourceType: 'OPENING_STOCK',
      sourceNumber: '-',
      qtyIn: quantity,
      qtyOut: 0,
      unit: baseUnit,
    });
  }

  // 2. Legacy quick stock purchases from Stock Management/import.
  // Read this ledger instead of FIFO lots to avoid double counting stock-in rows.
  const stockPurchases = await db.stockPurchases.where('product_id').equals(productId).toArray();
  for (const purchase of stockPurchases) {
    const quantity = toFiniteNumber(purchase.quantity);
    if (quantity <= 0) continue;

    allMutations.push({
      id: `stock_purchase_${purchase.id}`,
      date: purchase.created_at,
      sourceType: 'STOCK_PURCHASE',
      sourceNumber: purchase.id,
      qtyIn: quantity,
      qtyOut: 0,
      unit: baseUnit,
    });
  }

  // 3. POS Transactions
  const transactionItems = await db.transactionItems.where('product_id').equals(productId).toArray();
  const transactionMap = toEntityMap(await db.transactions.bulkGet(uniqueIds(transactionItems.map((item) => item.transaction_id))));
  for (const item of transactionItems) {
    const transaction = transactionMap.get(item.transaction_id);
    if (!transaction) continue;

    // Hitung qty dalam base unit
    let quantityInBaseUnit = 0;
    if (item.base_unit && item.conversion_value) {
      const q = item.quantity * numberOrFallback(item.conversion_value, 1);
      quantityInBaseUnit = konversiSatuanProduk(q, product, item.base_unit, baseUnit);
    } else {
      const unit = item.unit_id || item.unit || product.selling_unit;
      quantityInBaseUnit = konversiSatuanProduk(item.quantity, product, unit, baseUnit);
    }

    if (quantityInBaseUnit > 0) {
      allMutations.push({
        id: `pos_sale_${item.id}`,
        date: transaction.created_at,
        sourceType: 'POS_SALE',
        sourceNumber: transaction.transaction_number,
        qtyIn: 0,
        qtyOut: quantityInBaseUnit,
        unit: baseUnit,
      });

      if (transaction.status === 'VOIDED' && transaction.voided_at) {
        allMutations.push({
          id: `pos_void_${item.id}`,
          date: transaction.voided_at,
          sourceType: 'POS_VOID',
          sourceNumber: transaction.transaction_number,
          qtyIn: quantityInBaseUnit,
          qtyOut: 0,
          unit: baseUnit,
        });
      }
    }
  }

  // 4. Purchase Documents
  const purchaseItems = await db.purchaseDocumentItems.where('product_id').equals(productId).toArray();
  const purchaseDocumentMap = toEntityMap(await db.purchaseDocuments.bulkGet(uniqueIds(purchaseItems.map((item) => item.document_id))));
  for (const item of purchaseItems) {
    const doc = purchaseDocumentMap.get(item.document_id);
    if (!doc || !stockImpactPurchaseStatuses.has(doc.status)) continue;

    const quantity = isPurchaseStockInDocument(doc) ? (item.received_quantity ?? item.quantity) : item.quantity;
    const quantityInBaseUnit = konversiSatuanProduk(quantity, product, item.unit, baseUnit);

    if (quantityInBaseUnit > 0) {
      if (isPurchaseStockInDocument(doc)) {
        const sourceType = doc.type === 'PURCHASE_INVOICE' ? 'PURCHASE_INVOICE' : 'PURCHASE_RECEIPT';
        const voidSourceType = doc.type === 'PURCHASE_INVOICE' ? 'PURCHASE_INVOICE_VOID' : 'PURCHASE_RECEIPT_VOID';
        if (doc.issued_at) {
          allMutations.push({
            id: `${sourceType.toLowerCase()}_${item.id}`,
            date: doc.issued_at,
            sourceType,
            sourceNumber: doc.document_number,
            qtyIn: quantityInBaseUnit,
            qtyOut: 0,
            unit: baseUnit,
          });
        }
        if (doc.status === 'VOIDED' && doc.voided_at && doc.issued_at) {
          allMutations.push({
            id: `${voidSourceType.toLowerCase()}_${item.id}`,
            date: doc.voided_at,
            sourceType: voidSourceType,
            sourceNumber: doc.document_number,
            qtyIn: 0,
            qtyOut: quantityInBaseUnit,
            unit: baseUnit,
          });
        }
      } else if (doc.type === 'PURCHASE_RETURN') {
        if (doc.issued_at) {
          allMutations.push({
            id: `pur_ret_${item.id}`,
            date: doc.issued_at,
            sourceType: 'PURCHASE_RETURN',
            sourceNumber: doc.document_number,
            qtyIn: 0,
            qtyOut: quantityInBaseUnit,
            unit: baseUnit,
          });
        }
        if (doc.status === 'VOIDED' && doc.voided_at && doc.issued_at) {
          allMutations.push({
            id: `pur_ret_void_${item.id}`,
            date: doc.voided_at,
            sourceType: 'PURCHASE_RETURN_VOID',
            sourceNumber: doc.document_number,
            qtyIn: quantityInBaseUnit,
            qtyOut: 0,
            unit: baseUnit,
          });
        }
      }
    }
  }

  // 5. Sales Documents
  const salesItems = await db.salesDocumentItems.where('product_id').equals(productId).toArray();
  const salesDocumentMap = toEntityMap(await db.salesDocuments.bulkGet(uniqueIds(salesItems.map((item) => item.document_id))));
  for (const item of salesItems) {
    const doc = salesDocumentMap.get(item.document_id);
    if (!doc || (doc.status !== 'ISSUED' && doc.status !== 'VOIDED')) continue;

    const quantity = doc.type === 'SALES_DELIVERY' ? (item.delivered_quantity ?? item.quantity) : item.quantity;
    const quantityInBaseUnit = konversiSatuanProduk(quantity, product, item.unit, baseUnit);

    if (quantityInBaseUnit > 0) {
      if (doc.type === 'SALES_DELIVERY') {
        if (doc.issued_at) {
          allMutations.push({
            id: `sal_del_${item.id}`,
            date: doc.issued_at,
            sourceType: 'SALES_DELIVERY',
            sourceNumber: doc.document_number,
            qtyIn: 0,
            qtyOut: quantityInBaseUnit,
            unit: baseUnit,
          });
        }
        if (doc.status === 'VOIDED' && doc.voided_at) {
          allMutations.push({
            id: `sal_del_void_${item.id}`,
            date: doc.voided_at,
            sourceType: 'SALES_DELIVERY_VOID',
            sourceNumber: doc.document_number,
            qtyIn: quantityInBaseUnit,
            qtyOut: 0,
            unit: baseUnit,
          });
        }
      }
    }
  }

  // 6. Sales Returns
  if (db.salesReturnItems && db.salesReturns) {
    const returnItems = await db.salesReturnItems.where('product_id').equals(productId).toArray();
    const returnMap = toEntityMap(await db.salesReturns.bulkGet(uniqueIds(returnItems.map((item) => item.return_id))));
    for (const item of returnItems) {
      const doc = returnMap.get(item.return_id);
      if (!doc || (doc.status !== 'ISSUED' && doc.status !== 'VOIDED')) continue;
  
      const quantity = item.restock_quantity || 0;
      if (quantity <= 0) continue;
  
      const quantityInBaseUnit = konversiSatuanProduk(quantity, product, item.unit, baseUnit);
      if (quantityInBaseUnit > 0) {
        if (doc.issued_at) {
          allMutations.push({
            id: `sal_ret_${item.id}`,
            date: doc.issued_at,
            sourceType: 'SALES_RETURN',
            sourceNumber: doc.return_number,
            qtyIn: quantityInBaseUnit,
            qtyOut: 0,
            unit: baseUnit,
          });
        }
        if (doc.status === 'VOIDED' && doc.voided_at) {
          allMutations.push({
            id: `sal_ret_void_${item.id}`,
            date: doc.voided_at,
            sourceType: 'SALES_RETURN_VOID',
            sourceNumber: doc.return_number,
            qtyIn: 0,
            qtyOut: quantityInBaseUnit,
            unit: baseUnit,
          });
        }
      }
    }
  }

  // 7. Stock Opnames
  const stockOpnameItems = await db.stockOpnameItems.where('product_id').equals(productId).toArray();
  const stockOpnameMap = toEntityMap(await db.stockOpnames.bulkGet(uniqueIds(stockOpnameItems.map((item) => item.opname_id))));
  for (const item of stockOpnameItems) {
    const opname = stockOpnameMap.get(item.opname_id);
    if (!opname || opname.status !== 'POSTED') continue;

    const quantityDelta = toFiniteNumber(item.quantity_delta);
    if (quantityDelta === 0) continue;

    allMutations.push({
      id: `stock_opname_${item.id}`,
      date: opname.posted_at ?? opname.counted_at,
      sourceType: 'STOCK_OPNAME',
      sourceNumber: opname.opname_number,
      qtyIn: quantityDelta > 0 ? quantityDelta : 0,
      qtyOut: quantityDelta < 0 ? Math.abs(quantityDelta) : 0,
      unit: baseUnit,
    });
  }

  // 8. Production orders
  if (db.productionOrderItems && db.productionOrders) {
    const productionItems = await db.productionOrderItems.where('material_product_id').equals(productId).toArray();
    const productionOrderMap = toEntityMap(await db.productionOrders.bulkGet(uniqueIds(productionItems.map((item) => item.production_order_id))));
    for (const item of productionItems) {
      const order = productionOrderMap.get(item.production_order_id);
      if (!order || (order.status !== 'POSTED' && order.status !== 'VOIDED') || !order.posted_at) continue;

      const quantity = toFiniteNumber(item.stock_quantity_used);
      if (quantity <= 0) continue;

      allMutations.push({
        id: `production_consumption_${item.id}`,
        date: order.posted_at,
        sourceType: 'PRODUCTION_CONSUMPTION',
        sourceNumber: order.production_number,
        qtyIn: 0,
        qtyOut: quantity,
        unit: baseUnit,
      });

      if (order.status === 'VOIDED' && order.voided_at) {
        allMutations.push({
          id: `production_void_material_${item.id}`,
          date: order.voided_at,
          sourceType: 'PRODUCTION_VOID',
          sourceNumber: order.production_number,
          qtyIn: quantity,
          qtyOut: 0,
          unit: baseUnit,
        });
      }
    }

    const productionOutputs = await db.productionOrders.where('finished_product_id').equals(productId).toArray();
    for (const order of productionOutputs) {
      if ((order.status !== 'POSTED' && order.status !== 'VOIDED') || !order.posted_at) continue;

      const quantity = toFiniteNumber(order.quantity_produced);
      if (quantity <= 0) continue;

      allMutations.push({
        id: `production_output_${order.id}`,
        date: order.posted_at,
        sourceType: 'PRODUCTION_OUTPUT',
        sourceNumber: order.production_number,
        qtyIn: quantity,
        qtyOut: 0,
        unit: baseUnit,
      });

      if (order.status === 'VOIDED' && order.voided_at) {
        allMutations.push({
          id: `production_void_output_${order.id}`,
          date: order.voided_at,
          sourceType: 'PRODUCTION_VOID',
          sourceNumber: order.production_number,
          qtyIn: 0,
          qtyOut: quantity,
          unit: baseUnit,
        });
      }
    }
  }

  // 9. Sort by date ASC
  allMutations.sort((a, b) => {
    const dateDiff = getMovementTime(a) - getMovementTime(b);
    return dateDiff !== 0 ? dateDiff : a.id.localeCompare(b.id);
  });

  // 10. Calculate balances from the product stock snapshot.
  // FIFO opening lots are migration snapshots, not true transaction history.
  // Anchoring to products.stock prevents those snapshots from being counted
  // again together with POS/Purchase/Sales movements.
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  const finalRows: StockCardRow[] = [];
  const currentStock = toFiniteNumber(product.stock);
  const movementsInRange = allMutations.filter((movement) => {
    const movementMs = getMovementTime(movement);
    return movementMs >= startMs && movementMs <= endMs;
  });
  const netInRange = movementsInRange.reduce((sum, movement) => sum + getMovementDelta(movement), 0);
  const netAfterRange = allMutations.reduce((sum, movement) => (
    getMovementTime(movement) > endMs ? sum + getMovementDelta(movement) : sum
  ), 0);
  const openingBalance = roundQuantity(currentStock - netAfterRange - netInRange);
  let runningBalance = openingBalance;

  for (const mut of movementsInRange) {
    runningBalance = roundQuantity(runningBalance + getMovementDelta(mut));
    finalRows.push({
      ...mut,
      balance: runningBalance,
    });
  }

  // Add the initial opening balance row if there are rows or opening balance is > 0
  finalRows.unshift({
    id: 'calculated_opening',
    date: startDate.toISOString(),
    sourceType: 'SALDO_AWAL',
    sourceNumber: '-',
    qtyIn: openingBalance > 0 ? openingBalance : 0,
    qtyOut: openingBalance < 0 ? Math.abs(openingBalance) : 0,
    unit: baseUnit,
    balance: openingBalance,
  });

  // Reverse final rows so newest is at the top (optional, usually preferred in UI)
  finalRows.reverse();

  return {
    openingBalance,
    rows: finalRows,
  };
};
