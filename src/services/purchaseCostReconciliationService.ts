import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import { postPurchaseCostReconciliationJournal } from '@/services/generalLedgerService';
import { enqueuePurchaseDocumentBundleSync } from '@/services/syncQueueService';
import type {
  InventoryLot,
  Product,
  PurchaseAdditionalCostTreatment,
  PurchaseCostReconciliation,
  PurchaseCostReconciliationItem,
  PurchaseDocument,
  PurchaseDocumentItem,
  TransactionItem,
} from '@/types';
import { konversiSatuanProduk, normalisasiHargaProduk } from '@/utils/pricing';

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const sameQuantity = (a: number, b: number) => Math.abs(a - b) < 0.000001;

export interface PendingPurchaseCostRow {
  document: PurchaseDocument;
  item: PurchaseDocumentItem;
  received_quantity: number;
  remaining_quantity: number;
  sold_quantity: number;
  estimated_price: number;
  age_days: number;
}

export interface ReconcilePurchaseReceiptCostInput {
  purchaseDocumentId: string;
  supplierInvoiceNumber?: string;
  supplierInvoiceDate?: string;
  additionalCostTreatment: PurchaseAdditionalCostTreatment;
  additionalCostAmount?: number;
  supplierDiscountAmount?: number;
  supplierTaxAmount?: number;
  notes?: string;
  items: Array<{
    purchaseDocumentItemId: string;
    invoicedQuantity: number;
    finalPrice: number;
    additionalCostAllocation?: number;
    supplierDiscountAllocation?: number;
    supplierTaxAllocation?: number;
  }>;
}

const getItemReceivedQuantity = (item: PurchaseDocumentItem) => Number(item.received_quantity ?? item.quantity ?? 0);

const getLotQuantitiesForItem = async (item: PurchaseDocumentItem, product?: Product) => {
  const lots = await db.inventoryLots
    .where('source_line_id')
    .equals(item.id)
    .filter((lot) => lot.source_type === 'PURCHASE_RECEIPT')
    .toArray();
  const consumptions = lots.length > 0
    ? await db.inventoryLotConsumptions
      .where('lot_id')
      .anyOf(lots.map((lot) => lot.id))
      .filter((consumption) => consumption.source_type === 'POS_TRANSACTION')
      .toArray()
    : [];
  const soldStockQuantity = consumptions.reduce((sum, consumption) => sum + Number(consumption.quantity || 0), 0);
  const remainingStockQuantity = lots.reduce((sum, lot) => sum + Number(lot.quantity_remaining || 0), 0);

  if (!product) {
    return {
      lots,
      consumptions,
      sold_quantity: soldStockQuantity,
      remaining_quantity: remainingStockQuantity,
    };
  }

  return {
    lots,
    consumptions,
    sold_quantity: konversiSatuanProduk(soldStockQuantity, product, product.purchase_unit, item.unit),
    remaining_quantity: konversiSatuanProduk(remainingStockQuantity, product, product.purchase_unit, item.unit),
  };
};

export const listPendingPurchaseCosts = async (): Promise<PendingPurchaseCostRow[]> => {
  const documents = await db.purchaseDocuments
    .where('type')
    .equals('PURCHASE_RECEIPT')
    .filter((document) => document.status !== 'VOIDED' && (document.cost_status ?? 'FINAL') !== 'FINAL')
    .toArray();
  const products = await db.products.toArray();
  const productById = new Map(products.map((product) => [product.id, product]));
  const rows: PendingPurchaseCostRow[] = [];
  const now = Date.now();

  for (const document of documents) {
    const items = await db.purchaseDocumentItems
      .where('document_id')
      .equals(document.id)
      .filter((item) => (item.cost_status ?? document.cost_status ?? 'FINAL') !== 'FINAL')
      .toArray();

    for (const item of items) {
      const product = productById.get(item.product_id);
      const quantities = await getLotQuantitiesForItem(item, product);
      const documentTime = new Date(document.document_date || document.created_at).getTime();

      rows.push({
        document,
        item,
        received_quantity: getItemReceivedQuantity(item),
        remaining_quantity: quantities.remaining_quantity,
        sold_quantity: quantities.sold_quantity,
        estimated_price: Number(item.estimated_price ?? item.price ?? 0),
        age_days: Number.isFinite(documentTime)
          ? Math.max(0, Math.floor((now - documentTime) / 86_400_000))
          : 0,
      });
    }
  }

  return rows.sort((a, b) => b.document.document_date.localeCompare(a.document.document_date));
};

const allocateAmountByValue = (
  totalAmount: number,
  itemValues: Array<{ id: string; value: number }>,
) => {
  const totalValue = itemValues.reduce((sum, item) => sum + item.value, 0);

  return new Map(itemValues.map((item) => [
    item.id,
    totalValue > 0 ? roundCurrency(totalAmount * (item.value / totalValue)) : 0,
  ]));
};

const rebuildTransactionItemCosts = async (
  transactionItemIds: Set<string>,
  finalCostByLotId: Map<string, number>,
  reconciledAt: string,
) => {
  let totalProfitDelta = 0;

  for (const transactionItemId of transactionItemIds) {
    const item = await db.transactionItems.get(transactionItemId);
    if (!item) continue;

    const product = await db.products.get(item.product_id);
    if (!product) continue;

    const consumptions = await db.inventoryLotConsumptions
      .where('source_line_id')
      .equals(transactionItemId)
      .filter((consumption) => consumption.source_type === 'POS_TRANSACTION')
      .toArray();

    if (consumptions.length === 0) continue;

    let finalTotalCost = 0;
    let hasReconciledLot = false;

    for (const consumption of consumptions) {
      const finalCost = finalCostByLotId.get(consumption.lot_id);
      const costPerUnit = finalCost ?? consumption.cost_per_unit_at_consumption;
      finalTotalCost += Number(consumption.quantity || 0) * costPerUnit;
      if (finalCost !== undefined) hasReconciledLot = true;
    }

    if (!hasReconciledLot) continue;

    const consumedQuantity = consumptions.reduce((sum, consumption) => sum + Number(consumption.quantity || 0), 0);
    const oldTotalCost = roundCurrency(Number(item.subtotal || 0) - Number(item.profit || 0));
    const finalTotalCostRounded = roundCurrency(finalTotalCost);
    const weightedFinalCostPerStockUnit = consumedQuantity > 0
      ? roundCurrency(finalTotalCostRounded / consumedQuantity)
      : 0;
    const finalPurchasePrice = normalisasiHargaProduk(
      weightedFinalCostPerStockUnit,
      product,
      product.purchase_unit,
      item.unit,
    );
    const nextProfit = roundCurrency(Number(item.subtotal || 0) - finalTotalCostRounded);
    const profitDelta = roundCurrency(nextProfit - Number(item.profit || 0));
    totalProfitDelta += profitDelta;

    await db.transactionItems.update(item.id, {
      purchase_price: finalPurchasePrice,
      profit: nextProfit,
      hpp_status: 'FINAL',
      profit_status: 'RECONCILED',
      hpp_variance_amount: roundCurrency(finalTotalCostRounded - oldTotalCost),
      hpp_reconciled_at: reconciledAt,
    } satisfies Partial<TransactionItem>);
  }

  return roundCurrency(totalProfitDelta);
};

export const reconcilePurchaseReceiptCost = async (input: ReconcilePurchaseReceiptCostInput) => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'PURCHASE_RECEIPT_MANAGE');

  if (input.items.length < 1) {
    throw new Error('Minimal ada 1 item untuk rekonsiliasi harga.');
  }

  const now = new Date().toISOString();
  const additionalCostTreatment = input.additionalCostTreatment ?? 'IGNORE_FOR_MVP';
  const additionalCostAmount = Number(input.additionalCostAmount || 0);
  const supplierDiscountAmount = Number(input.supplierDiscountAmount || 0);
  const supplierTaxAmount = Number(input.supplierTaxAmount || 0);
  let updatedDocument: PurchaseDocument | undefined;
  let updatedItems: PurchaseDocumentItem[] = [];

  const result = await db.transaction(
    'rw',
    [
      db.purchaseDocuments,
      db.purchaseDocumentItems,
      db.inventoryLots,
      db.inventoryLotConsumptions,
      db.purchaseCostReconciliations,
      db.purchaseCostReconciliationItems,
      db.transactionItems,
      db.transactions,
      db.products,
      db.profitLogs,
      db.profitBalance,
      db.chartOfAccounts,
      db.enabledModules,
      db.generalLedgerSetting,
      db.accountingPeriods,
      db.journalEntries,
      db.journalEntryLines,
      db.activityLogs,
    ],
    async () => {
      const document = await db.purchaseDocuments.get(input.purchaseDocumentId);
      if (!document || document.type !== 'PURCHASE_RECEIPT') {
        throw new Error('Purchase Receipt tidak ditemukan.');
      }

      if (document.status !== 'ISSUED') {
        throw new Error('Rekonsiliasi hanya bisa dilakukan untuk Purchase Receipt yang sudah issued.');
      }

      const existingItems = await db.purchaseDocumentItems
        .where('document_id')
        .equals(document.id)
        .toArray();
      const itemById = new Map(existingItems.map((item) => [item.id, item]));
      const products = await db.products.toArray();
      const productById = new Map(products.map((product) => [product.id, product]));

      const inputItems = input.items.map((itemInput) => {
        const item = itemById.get(itemInput.purchaseDocumentItemId);
        if (!item) {
          throw new Error('Item rekonsiliasi tidak ditemukan di Purchase Receipt.');
        }

        const receivedQuantity = getItemReceivedQuantity(item);
        const invoicedQuantity = Number(itemInput.invoicedQuantity || 0);
        const finalPrice = Number(itemInput.finalPrice || 0);

        if (!sameQuantity(receivedQuantity, invoicedQuantity)) {
          throw new Error(`Qty invoice ${item.product_name} harus sama dengan qty terima untuk MVP.`);
        }

        if (!Number.isFinite(finalPrice) || finalPrice < 0) {
          throw new Error(`Harga final ${item.product_name} tidak valid.`);
        }

        return {
          item,
          receivedQuantity,
          invoicedQuantity,
          finalPrice,
          itemValue: roundCurrency(receivedQuantity * finalPrice),
          additionalCostAllocation: itemInput.additionalCostAllocation,
          supplierDiscountAllocation: itemInput.supplierDiscountAllocation,
          supplierTaxAllocation: itemInput.supplierTaxAllocation,
        };
      });

      const itemValues = inputItems.map(({ item, itemValue }) => ({ id: item.id, value: itemValue }));
      const additionalCostAllocation = allocateAmountByValue(
        additionalCostTreatment === 'INVENTORY_COST' ? additionalCostAmount : 0,
        itemValues,
      );
      const discountAllocation = allocateAmountByValue(
        additionalCostTreatment === 'INVENTORY_COST' ? supplierDiscountAmount : 0,
        itemValues,
      );
      const taxAllocation = allocateAmountByValue(
        additionalCostTreatment === 'INVENTORY_COST' ? supplierTaxAmount : 0,
        itemValues,
      );

      const reconciliationId = crypto.randomUUID();
      const reconciliationItems: PurchaseCostReconciliationItem[] = [];
      const finalCostByLotId = new Map<string, number>();
      const impactedTransactionItemIds = new Set<string>();
      let totalEstimatedCost = 0;
      let totalFinalCost = 0;
      let soldCostVarianceAmount = 0;
      let remainingStockVarianceAmount = 0;

      for (const inputItem of inputItems) {
        const { item, receivedQuantity, invoicedQuantity, finalPrice } = inputItem;
        const product = productById.get(item.product_id);
        if (!product) {
          throw new Error(`Produk ${item.product_name} tidak ditemukan.`);
        }

        const addAllocation = Number(inputItem.additionalCostAllocation ?? additionalCostAllocation.get(item.id) ?? 0);
        const discountAllocationValue = Number(inputItem.supplierDiscountAllocation ?? discountAllocation.get(item.id) ?? 0);
        const taxAllocationValue = Number(inputItem.supplierTaxAllocation ?? taxAllocation.get(item.id) ?? 0);
        const landedAdjustment = additionalCostTreatment === 'INVENTORY_COST'
          ? addAllocation - discountAllocationValue + taxAllocationValue
          : 0;
        const finalLandedCostPerUnit = receivedQuantity > 0
          ? roundCurrency(finalPrice + landedAdjustment / receivedQuantity)
          : finalPrice;
        const estimatedPrice = Number(item.estimated_price ?? item.price ?? 0);
        const finalCostPerStockUnit = normalisasiHargaProduk(
          finalLandedCostPerUnit,
          product,
          item.unit,
          product.purchase_unit,
        );
        const lots = await db.inventoryLots
          .where('source_line_id')
          .equals(item.id)
          .filter((lot) => lot.source_type === 'PURCHASE_RECEIPT')
          .toArray();
        const lotIds = lots.map((lot) => lot.id);
        const consumptions = lotIds.length > 0
          ? await db.inventoryLotConsumptions
            .where('lot_id')
            .anyOf(lotIds)
            .filter((consumption) => consumption.source_type === 'POS_TRANSACTION')
            .toArray()
          : [];
        const soldQuantityStock = consumptions.reduce((sum, consumption) => sum + Number(consumption.quantity || 0), 0);
        const remainingQuantityStock = lots.reduce((sum, lot) => sum + Number(lot.quantity_remaining || 0), 0);
        const totalLotQuantity = lots.reduce((sum, lot) => sum + Number(lot.quantity_received || 0), 0);
        const oldAverageLotCost = lots.length > 0 && totalLotQuantity > 0
          ? lots.reduce((sum, lot) => sum + Number(lot.cost_per_unit || 0) * Number(lot.quantity_received || 0), 0) / totalLotQuantity
          : normalisasiHargaProduk(estimatedPrice, product, item.unit, product.purchase_unit);
        const variancePerStockUnit = roundCurrency(finalCostPerStockUnit - oldAverageLotCost);
        const itemSoldVariance = roundCurrency(soldQuantityStock * variancePerStockUnit);
        const itemRemainingVariance = roundCurrency(remainingQuantityStock * variancePerStockUnit);

        soldCostVarianceAmount += itemSoldVariance;
        remainingStockVarianceAmount += itemRemainingVariance;
        totalEstimatedCost += roundCurrency(receivedQuantity * estimatedPrice);
        totalFinalCost += roundCurrency(receivedQuantity * finalLandedCostPerUnit);

        for (const lot of lots) {
          finalCostByLotId.set(lot.id, finalCostPerStockUnit);
          await db.inventoryLots.update(lot.id, {
            cost_status: 'FINAL',
            final_cost_per_unit: finalCostPerStockUnit,
            cost_per_unit: finalCostPerStockUnit,
            cost_finalized_at: now,
            cost_reconciliation_id: reconciliationId,
            updated_at: now,
          } satisfies Partial<InventoryLot>);
        }

        for (const consumption of consumptions) {
          impactedTransactionItemIds.add(consumption.source_line_id);
        }

        await db.purchaseDocumentItems.update(item.id, {
          final_price: finalPrice,
          invoiced_quantity: invoicedQuantity,
          quantity_variance: roundCurrency(invoicedQuantity - receivedQuantity),
          additional_cost_allocation: addAllocation,
          supplier_discount_allocation: discountAllocationValue,
          supplier_tax_allocation: taxAllocationValue,
          final_landed_cost_per_unit: finalLandedCostPerUnit,
          cost_status: 'FINAL',
          cost_finalized_at: now,
          cost_variance_amount: roundCurrency(finalLandedCostPerUnit - estimatedPrice),
        } satisfies Partial<PurchaseDocumentItem>);

        reconciliationItems.push({
          id: crypto.randomUUID(),
          reconciliation_id: reconciliationId,
          purchase_document_item_id: item.id,
          product_id: item.product_id,
          product_name: item.product_name,
          received_quantity: receivedQuantity,
          invoiced_quantity: invoicedQuantity,
          quantity_variance: roundCurrency(invoicedQuantity - receivedQuantity),
          sold_quantity_at_reconciliation: konversiSatuanProduk(soldQuantityStock, product, product.purchase_unit, item.unit),
          remaining_quantity_at_reconciliation: konversiSatuanProduk(remainingQuantityStock, product, product.purchase_unit, item.unit),
          estimated_price: estimatedPrice,
          final_price: finalPrice,
          additional_cost_allocation: addAllocation,
          supplier_discount_allocation: discountAllocationValue,
          supplier_tax_allocation: taxAllocationValue,
          final_landed_cost_per_unit: finalLandedCostPerUnit,
          variance_per_unit: roundCurrency(finalLandedCostPerUnit - estimatedPrice),
          sold_cost_variance_amount: itemSoldVariance,
          remaining_stock_variance_amount: itemRemainingVariance,
          created_at: now,
        });
      }

      const totalProfitDelta = await rebuildTransactionItemCosts(impactedTransactionItemIds, finalCostByLotId, now);
      if (totalProfitDelta !== 0) {
        const currentProfitBalance = await db.profitBalance.get('current');
        const nextProfitBalance = roundCurrency((currentProfitBalance?.amount || 0) + totalProfitDelta);

        await db.profitBalance.put({
          id: 'current',
          amount: nextProfitBalance,
          updated_at: now,
        });

        await db.profitLogs.add({
          id: crypto.randomUUID(),
          amount: Math.abs(totalProfitDelta),
          type: totalProfitDelta > 0 ? 'IN' : 'OUT',
          category: 'HPP_RECONCILIATION',
          description: `Koreksi HPP dari rekonsiliasi ${document.document_number}`,
          created_at: now,
          balance_after: nextProfitBalance,
        });
      }

      const refreshedItems = await db.purchaseDocumentItems
        .where('document_id')
        .equals(document.id)
        .toArray();
      const allItemsFinal = refreshedItems.every((item) => (item.cost_status ?? 'FINAL') === 'FINAL');
      const nextDocument = {
        ...document,
        supplier_invoice_number: input.supplierInvoiceNumber?.trim() || undefined,
        supplier_invoice_date: input.supplierInvoiceDate,
        additional_cost_treatment: additionalCostTreatment,
        additional_cost_amount: additionalCostAmount,
        supplier_discount_amount: supplierDiscountAmount,
        supplier_tax_amount: supplierTaxAmount,
        cost_status: allItemsFinal ? 'FINAL' as const : 'ESTIMATED' as const,
        cost_finalized_at: allItemsFinal ? now : document.cost_finalized_at,
        cost_finalized_by: currentUser?.id,
        cost_finalized_by_name: currentUser?.name,
        updated_at: now,
        version: Math.max(1, Number(document.version ?? 1)) + 1,
        updated_by: currentUser?.id,
        updated_by_name: currentUser?.name,
        sync_status: 'pending' as const,
        sync_error: undefined,
      };

      const reconciliation: PurchaseCostReconciliation = {
        id: reconciliationId,
        purchase_document_id: document.id,
        purchase_document_number: document.document_number,
        supplier_invoice_number: input.supplierInvoiceNumber?.trim() || undefined,
        supplier_invoice_date: input.supplierInvoiceDate,
        additional_cost_treatment: additionalCostTreatment,
        additional_cost_amount: additionalCostAmount,
        supplier_discount_amount: supplierDiscountAmount,
        supplier_tax_amount: supplierTaxAmount,
        total_estimated_cost: roundCurrency(totalEstimatedCost),
        total_final_cost: roundCurrency(totalFinalCost),
        total_variance_amount: roundCurrency(totalFinalCost - totalEstimatedCost),
        sold_cost_variance_amount: roundCurrency(soldCostVarianceAmount),
        remaining_stock_variance_amount: roundCurrency(remainingStockVarianceAmount),
        notes: input.notes?.trim() || undefined,
        created_by: currentUser?.id,
        created_by_name: currentUser?.name,
        created_at: now,
      };

      await db.purchaseDocuments.put(nextDocument);
      await db.purchaseCostReconciliations.add(reconciliation);
      if (reconciliationItems.length > 0) {
        await db.purchaseCostReconciliationItems.bulkAdd(reconciliationItems);
      }
      await postPurchaseCostReconciliationJournal(reconciliation, currentUser);

      await writeActivityLog({
        user: currentUser,
        action: 'PURCHASE_COST_RECONCILED',
        entity: 'purchaseDocuments',
        entity_id: document.id,
        description: `${currentUser?.name ?? 'User'} merekonsiliasi HPP ${document.document_number}. Variance: ${roundCurrency(totalFinalCost - totalEstimatedCost)}.`,
      });

      updatedDocument = nextDocument;
      updatedItems = refreshedItems.map((item) => (
        inputItems.some((inputItem) => inputItem.item.id === item.id)
          ? { ...item, cost_status: 'FINAL' as const }
          : item
      ));

      return { reconciliation, items: reconciliationItems };
    },
  );

  if (updatedDocument) {
    await enqueuePurchaseDocumentBundleSync(updatedDocument, updatedItems, 'update');
  }

  return result;
};
