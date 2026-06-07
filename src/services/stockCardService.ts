import { db } from '@/lib/db';
import type { Product } from '@/types';
import { konversiSatuanProduk } from '@/utils/pricing';

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

const numberOrFallback = (value: unknown, fallback: number) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

export const getStockCard = async (productId: string, startDate: Date, endDate: Date): Promise<{ openingBalance: number; rows: StockCardRow[] }> => {
  const product = await db.products.get(productId);
  if (!product) {
    throw new Error('Produk tidak ditemukan');
  }

  const baseUnit = product.purchase_unit;
  const allMutations: Omit<StockCardRow, 'balance'>[] = [];

  // 1. OPENING Balances from inventoryLots (from migration 37)
  const openingLots = await db.inventoryLots
    .where('product_id')
    .equals(productId)
    .filter((lot) => lot.source_type === 'OPENING')
    .toArray();

  for (const lot of openingLots) {
    allMutations.push({
      id: lot.id,
      date: lot.received_at,
      sourceType: 'OPENING_BALANCE',
      sourceNumber: '-',
      qtyIn: lot.quantity_received,
      qtyOut: 0,
      unit: baseUnit,
    });
  }

  // 2. SHOPPING_NOTE from inventoryLots
  const shoppingLots = await db.inventoryLots
    .where('product_id')
    .equals(productId)
    .filter((lot) => lot.source_type === 'SHOPPING_NOTE')
    .toArray();

  for (const lot of shoppingLots) {
    allMutations.push({
      id: lot.id,
      date: lot.received_at,
      sourceType: 'SHOPPING_NOTE',
      sourceNumber: lot.source_id || '-',
      qtyIn: lot.quantity_received,
      qtyOut: 0,
      unit: baseUnit,
    });
  }

  // 3. POS Transactions
  const transactionItems = await db.transactionItems.where('product_id').equals(productId).toArray();
  for (const item of transactionItems) {
    const transaction = await db.transactions.get(item.transaction_id);
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
  for (const item of purchaseItems) {
    const doc = await db.purchaseDocuments.get(item.document_id);
    if (!doc || (doc.status !== 'ISSUED' && doc.status !== 'VOIDED')) continue;

    const quantity = doc.type === 'PURCHASE_RECEIPT' ? (item.received_quantity ?? item.quantity) : item.quantity;
    const quantityInBaseUnit = konversiSatuanProduk(quantity, product, item.unit, baseUnit);

    if (quantityInBaseUnit > 0) {
      if (doc.type === 'PURCHASE_RECEIPT') {
        if (doc.issued_at) {
          allMutations.push({
            id: `pur_rec_${item.id}`,
            date: doc.issued_at,
            sourceType: 'PURCHASE_RECEIPT',
            sourceNumber: doc.document_number,
            qtyIn: quantityInBaseUnit,
            qtyOut: 0,
            unit: baseUnit,
          });
        }
        if (doc.status === 'VOIDED' && doc.voided_at) {
          allMutations.push({
            id: `pur_rec_void_${item.id}`,
            date: doc.voided_at,
            sourceType: 'PURCHASE_RECEIPT_VOID',
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
        if (doc.status === 'VOIDED' && doc.voided_at) {
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
  for (const item of salesItems) {
    const doc = await db.salesDocuments.get(item.document_id);
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
    for (const item of returnItems) {
      const doc = await db.salesReturns.get(item.return_id);
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

  // 7. Sort by date ASC
  allMutations.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // 8. Calculate running balance & opening balance
  let runningBalance = 0;
  let openingBalance = 0;
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  const finalRows: StockCardRow[] = [];

  for (const mut of allMutations) {
    runningBalance += mut.qtyIn - mut.qtyOut;
    
    const mutMs = new Date(mut.date).getTime();
    if (mutMs < startMs) {
      openingBalance = runningBalance;
    } else if (mutMs <= endMs) {
      finalRows.push({
        ...mut,
        balance: runningBalance,
      });
    }
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
