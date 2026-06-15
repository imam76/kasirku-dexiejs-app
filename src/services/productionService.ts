import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import {
  enqueueProductSync,
  enqueueProductionOrderBundleSync,
} from '@/services/syncQueueService';
import { createStockMutation, enqueueStockMutations } from '@/services/stockMutationSyncService';
import type {
  AuthUser,
  Product,
  ProductUnit,
  ProductionOrder,
  ProductionOrderCost,
  ProductionOrderItem,
  StockMutation,
} from '@/types';
import { addInventoryLot } from '@/utils/inventory/addInventoryLot';
import { consumeFifoLots } from '@/utils/inventory/consumeFifoLots';
import { createProductionNumber } from '@/utils/production/createProductionNumber';
import {
  assertProductionOrderDraft,
  assertProductionOrderPosted,
  validateProductionCosts,
  validateProductionItems,
  validateProductionQuantity,
} from '@/utils/production/validateProductionOrder';
import { hasConversionRatioForProduct, konversiSatuanProduk } from '@/utils/pricing';
import {
  postProductionOrderJournal,
  reverseProductionOrderJournal,
} from '@/services/generalLedgerService';

export interface ProductionMaterialInput {
  productId: string;
  quantity: number;
  unit: ProductUnit;
}

export interface ProductionAdditionalCostInput {
  name: string;
  amount: number;
  account_id?: string;
  account_code?: string;
  account_name?: string;
}

export interface CreateDraftProductionOrderInput {
  finishedProductId: string;
  quantityProduced: number;
  producedAt?: string;
  notes?: string;
  materials: ProductionMaterialInput[];
  additionalCosts?: ProductionAdditionalCostInput[];
}

export interface PostProductionOrderInput {
  productionOrderId: string;
}

export interface VoidProductionOrderInput {
  productionOrderId: string;
  reason?: string;
}

export interface ProductionOrderDetailResult {
  order: ProductionOrder;
  items: ProductionOrderItem[];
  costs: ProductionOrderCost[];
}

export interface ProductionCostCalculationResult {
  materialCost: number;
  additionalCost: number;
  totalCost: number;
  unitCost: number;
  items: ProductionOrderItem[];
  costs: ProductionOrderCost[];
}

const productionTables = [
  db.products,
  db.inventoryLots,
  db.inventoryLotConsumptions,
  db.productionOrders,
  db.productionOrderItems,
  db.productionOrderCosts,
  db.chartOfAccounts,
  db.enabledModules,
  db.generalLedgerSetting,
  db.journalEntries,
  db.journalEntryLines,
];

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const toFiniteNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const normalizeCosts = (costs: ProductionAdditionalCostInput[] = []) => (
  costs
    .map((cost) => ({
      ...cost,
      name: cost.name.trim(),
      amount: toFiniteNumber(cost.amount),
    }))
    .filter((cost) => cost.name || cost.amount > 0)
);

const getActorSnapshot = (actor: AuthUser | null) => ({
  id: actor?.id,
  name: actor?.name,
});

const withPendingProductionOrderSync = <T extends ProductionOrder>(order: T): T => ({
  ...order,
  sync_status: 'pending',
  sync_error: undefined,
});

const getRequiredProductionOrder = async (productionOrderId: string) => {
  const order = await db.productionOrders.get(productionOrderId);
  if (!order) {
    throw new Error('Produksi tidak ditemukan.');
  }

  return order;
};

const getProductionOrderItems = async (productionOrderId: string) => (
  db.productionOrderItems.where('production_order_id').equals(productionOrderId).toArray()
);

const getProductionOrderCosts = async (productionOrderId: string) => (
  db.productionOrderCosts.where('production_order_id').equals(productionOrderId).toArray()
);

const getRequiredProduct = async (productId: string, label: string) => {
  const product = await db.products.get(productId);
  if (!product) {
    throw new Error(`${label} tidak ditemukan.`);
  }

  return product;
};

const getEstimatedFifoCost = async (product: Product, quantityNeeded: number) => {
  if (quantityNeeded <= 0) {
    return { totalCost: 0, weightedAvgCostPerUnit: 0 };
  }

  const lots = await db.inventoryLots
    .where('product_id')
    .equals(product.id)
    .filter((lot) => lot.quantity_remaining > 0)
    .toArray();
  lots.sort((left, right) => left.received_at.localeCompare(right.received_at));

  let remaining = quantityNeeded;
  let totalCost = 0;

  for (const lot of lots) {
    if (remaining <= 0) break;

    const costStatus = lot.cost_status ?? 'FINAL';
    if (costStatus === 'PENDING') {
      throw new Error(`Stok ${lot.product_name} belum memiliki harga beli final.`);
    }

    const consumed = Math.min(lot.quantity_remaining, remaining);
    totalCost += consumed * lot.cost_per_unit;
    remaining -= consumed;
  }

  if (remaining > 0) {
    const fallbackCost = lots.length > 0
      ? lots[lots.length - 1].cost_per_unit
      : toFiniteNumber(product.purchase_price);
    totalCost += remaining * fallbackCost;
  }

  const totalCostRounded = roundCurrency(totalCost);
  return {
    totalCost: totalCostRounded,
    weightedAvgCostPerUnit: roundCurrency(totalCostRounded / quantityNeeded),
  };
};

const buildCostRows = (
  productionOrderId: string,
  costs: ProductionAdditionalCostInput[],
  now: string,
): ProductionOrderCost[] => (
  normalizeCosts(costs).map((cost) => ({
    id: crypto.randomUUID(),
    production_order_id: productionOrderId,
    name: cost.name,
    amount: cost.amount,
    account_id: cost.account_id,
    account_code: cost.account_code,
    account_name: cost.account_name,
    created_at: now,
    updated_at: now,
  }))
);

const validateFinishedProductInput = async (finishedProductId: string, quantityProduced: number) => {
  if (!finishedProductId) {
    throw new Error('Produk barang jadi wajib dipilih.');
  }

  const finishedProduct = await getRequiredProduct(finishedProductId, 'Produk barang jadi');
  const normalizedQuantity = validateProductionQuantity(quantityProduced);

  return { finishedProduct, quantityProduced: normalizedQuantity };
};

const buildMaterialItems = async (
  productionOrderId: string,
  materials: ProductionMaterialInput[],
  now: string,
  finishedProductId?: string,
): Promise<ProductionOrderItem[]> => {
  const draftItems: ProductionOrderItem[] = [];

  for (const material of materials) {
    if (finishedProductId && material.productId === finishedProductId) {
      throw new Error('Produk bahan baku tidak boleh sama dengan barang jadi.');
    }

    const product = await getRequiredProduct(material.productId, 'Produk bahan baku');
    const quantityUsed = validateProductionQuantity(material.quantity);
    if (!hasConversionRatioForProduct(product, material.unit, product.purchase_unit)) {
      throw new Error(`Unit ${material.unit} tidak bisa dikonversi ke ${product.purchase_unit} untuk ${product.name}.`);
    }

    const stockQuantityUsed = konversiSatuanProduk(
      quantityUsed,
      product,
      material.unit,
      product.purchase_unit,
    );

    if (toFiniteNumber(product.stock) < stockQuantityUsed) {
      throw new Error(`Stok ${product.name} tidak cukup.`);
    }

    const fifo = await getEstimatedFifoCost(product, stockQuantityUsed);
    draftItems.push({
      id: crypto.randomUUID(),
      production_order_id: productionOrderId,
      material_product_id: product.id,
      material_product_name: product.name,
      sku: product.sku,
      quantity_used: quantityUsed,
      unit: material.unit,
      stock_quantity_used: stockQuantityUsed,
      stock_unit: product.purchase_unit,
      cost_per_unit: fifo.weightedAvgCostPerUnit,
      total_cost: fifo.totalCost,
      created_at: now,
      updated_at: now,
    });
  }

  validateProductionItems(draftItems);

  return draftItems;
};

const calculateSummary = (
  quantityProduced: number,
  items: ProductionOrderItem[],
  costs: ProductionOrderCost[],
) => {
  const materialCost = roundCurrency(items.reduce((sum, item) => sum + toFiniteNumber(item.total_cost), 0));
  const additionalCost = roundCurrency(costs.reduce((sum, cost) => sum + toFiniteNumber(cost.amount), 0));
  const totalCost = roundCurrency(materialCost + additionalCost);
  const unitCost = quantityProduced > 0 ? roundCurrency(totalCost / quantityProduced) : 0;

  if (totalCost <= 0) {
    throw new Error('Total biaya produksi harus lebih dari 0.');
  }

  return {
    materialCost,
    additionalCost,
    totalCost,
    unitCost,
  };
};

export const buildProductionNumber = createProductionNumber;

export const calculateProductionCost = async (
  input: CreateDraftProductionOrderInput,
): Promise<ProductionCostCalculationResult> => {
  const { quantityProduced } = await validateFinishedProductInput(input.finishedProductId, input.quantityProduced);
  const now = new Date().toISOString();
  const productionOrderId = crypto.randomUUID();
  const items = await buildMaterialItems(productionOrderId, input.materials, now, input.finishedProductId);
  const costs = buildCostRows(productionOrderId, input.additionalCosts ?? [], now);
  validateProductionCosts(costs);
  const summary = calculateSummary(quantityProduced, items, costs);

  return {
    ...summary,
    items,
    costs,
  };
};

export const createDraftProductionOrder = async (
  input: CreateDraftProductionOrderInput,
): Promise<ProductionOrderDetailResult> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'PRODUCTION_MANAGE');

  const { finishedProduct, quantityProduced } = await validateFinishedProductInput(
    input.finishedProductId,
    input.quantityProduced,
  );
  const now = new Date().toISOString();
  const productionOrderId = crypto.randomUUID();
  const items = await buildMaterialItems(productionOrderId, input.materials, now, finishedProduct.id);
  const costs = buildCostRows(productionOrderId, input.additionalCosts ?? [], now);
  validateProductionCosts(costs);
  const summary = calculateSummary(quantityProduced, items, costs);
  const order = withPendingProductionOrderSync({
    id: productionOrderId,
    production_number: createProductionNumber(new Date(now)),
    status: 'DRAFT',
    finished_product_id: finishedProduct.id,
    finished_product_name: finishedProduct.name,
    quantity_produced: quantityProduced,
    unit: finishedProduct.purchase_unit,
    material_cost: summary.materialCost,
    additional_cost: summary.additionalCost,
    total_cost: summary.totalCost,
    unit_cost: summary.unitCost,
    produced_at: input.producedAt ?? now,
    notes: input.notes?.trim() || undefined,
    created_by: currentUser?.id,
    created_by_name: currentUser?.name,
    created_at: now,
    updated_at: now,
  });

  await db.transaction('rw', [db.productionOrders, db.productionOrderItems, db.productionOrderCosts], async () => {
    await db.productionOrders.add(order);
    await db.productionOrderItems.bulkAdd(items);
    if (costs.length > 0) {
      await db.productionOrderCosts.bulkAdd(costs);
    }
  });

  await enqueueProductionOrderBundleSync(order, items, costs, 'create');
  await writeActivityLog({
    user: currentUser,
    action: 'PRODUCTION_ORDER_CREATED',
    entity: 'productionOrders',
    entity_id: order.id,
    description: `${currentUser?.name ?? 'User'} membuat draft produksi ${order.production_number}.`,
  });

  return { order, items, costs };
};

export const postProductionOrder = async ({
  productionOrderId,
}: PostProductionOrderInput): Promise<ProductionOrderDetailResult> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'PRODUCTION_MANAGE');
  const now = new Date().toISOString();
  const stockMutations: StockMutation[] = [];
  let finishedProductForSync: Product | undefined;
  let postedOrder: ProductionOrder | undefined;
  let postedItems: ProductionOrderItem[] = [];
  let postedCosts: ProductionOrderCost[] = [];

  await db.transaction('rw', productionTables, async () => {
    const order = await getRequiredProductionOrder(productionOrderId);
    assertProductionOrderDraft(order);
    const finishedProduct = await getRequiredProduct(order.finished_product_id, 'Produk barang jadi');
    const quantityProduced = validateProductionQuantity(order.quantity_produced);
    const items = await getProductionOrderItems(order.id);
    const costs = await getProductionOrderCosts(order.id);

    validateProductionItems(items);
    validateProductionCosts(costs);

    postedItems = [];
    for (const item of items) {
      const product = await getRequiredProduct(item.material_product_id, `Produk bahan baku ${item.material_product_name}`);
      if (product.id === finishedProduct.id) {
        throw new Error('Produk bahan baku tidak boleh sama dengan barang jadi.');
      }
      if (!hasConversionRatioForProduct(product, item.unit, product.purchase_unit)) {
        throw new Error(`Unit ${item.unit} tidak bisa dikonversi ke ${product.purchase_unit} untuk ${product.name}.`);
      }

      const stockQuantityUsed = konversiSatuanProduk(
        item.quantity_used,
        product,
        item.unit,
        product.purchase_unit,
      );

      if (toFiniteNumber(product.stock) < stockQuantityUsed) {
        throw new Error(`Stok ${product.name} tidak cukup.`);
      }

      const fifo = await consumeFifoLots(product.id, stockQuantityUsed, {
        sourceType: 'PRODUCTION_CONSUMPTION',
        sourceId: order.id,
        sourceLineId: item.id,
        createdAt: now,
      });
      const updatedItem: ProductionOrderItem = {
        ...item,
        sku: product.sku,
        stock_quantity_used: stockQuantityUsed,
        stock_unit: product.purchase_unit,
        cost_per_unit: fifo.weightedAvgCostPerUnit,
        total_cost: fifo.totalCost,
        updated_at: now,
      };

      await db.products.update(product.id, {
        stock: toFiniteNumber(product.stock) - stockQuantityUsed,
        updated_at: now,
      });

      stockMutations.push(createStockMutation({
        product,
        sourceType: 'PRODUCTION_CONSUMPTION',
        sourceId: order.id,
        sourceNumber: order.production_number,
        sourceLineId: item.id,
        quantityDelta: -stockQuantityUsed,
        sourceQuantity: item.quantity_used,
        sourceUnit: item.unit,
        actor: getActorSnapshot(currentUser),
        occurredAt: now,
      }));
      postedItems.push(updatedItem);
    }

    postedCosts = costs.map((cost) => ({
      ...cost,
      amount: toFiniteNumber(cost.amount),
      name: cost.name.trim(),
      updated_at: now,
    }));

    const summary = calculateSummary(quantityProduced, postedItems, postedCosts);
    finishedProductForSync = {
      ...finishedProduct,
      stock: toFiniteNumber(finishedProduct.stock) + quantityProduced,
      purchase_price: summary.unitCost,
      updated_at: now,
      sync_status: 'pending',
      sync_error: undefined,
    };

    await db.products.put(finishedProductForSync);
    await addInventoryLot({
      productId: finishedProduct.id,
      productName: finishedProduct.name,
      sku: finishedProduct.sku,
      sourceType: 'PRODUCTION_OUTPUT',
      sourceId: order.id,
      sourceLineId: order.id,
      quantityReceived: quantityProduced,
      costPerUnit: summary.unitCost,
      costStatus: 'FINAL',
      receivedAt: now,
    });

    stockMutations.push(createStockMutation({
      product: finishedProduct,
      sourceType: 'PRODUCTION_OUTPUT',
      sourceId: order.id,
      sourceNumber: order.production_number,
      sourceLineId: order.id,
      quantityDelta: quantityProduced,
      sourceQuantity: quantityProduced,
      sourceUnit: finishedProduct.purchase_unit,
      actor: getActorSnapshot(currentUser),
      occurredAt: now,
    }));

    postedOrder = withPendingProductionOrderSync({
      ...order,
      status: 'POSTED',
      material_cost: summary.materialCost,
      additional_cost: summary.additionalCost,
      total_cost: summary.totalCost,
      unit_cost: summary.unitCost,
      posted_at: now,
      updated_at: now,
    });

    await db.productionOrderItems.bulkPut(postedItems);
    await db.productionOrderCosts.bulkPut(postedCosts);
    await db.productionOrders.put(postedOrder);
    await postProductionOrderJournal(postedOrder, postedItems, postedCosts, currentUser);
  });

  if (!postedOrder || !finishedProductForSync) {
    throw new Error('Produksi gagal diposting.');
  }

  await enqueueStockMutations(stockMutations);
  await enqueueProductSync(finishedProductForSync, 'update');
  await enqueueProductionOrderBundleSync(postedOrder, postedItems, postedCosts, 'update');
  await writeActivityLog({
    user: currentUser,
    action: 'PRODUCTION_ORDER_POSTED',
    entity: 'productionOrders',
    entity_id: postedOrder.id,
    description: `${currentUser?.name ?? 'User'} posting produksi ${postedOrder.production_number}.`,
  });

  return { order: postedOrder, items: postedItems, costs: postedCosts };
};

export const voidProductionOrder = async ({
  productionOrderId,
  reason,
}: VoidProductionOrderInput): Promise<ProductionOrderDetailResult> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'PRODUCTION_MANAGE');
  const now = new Date().toISOString();
  const normalizedReason = reason?.trim() || 'Void produksi';
  const stockMutations: StockMutation[] = [];
  let voidedOrder: ProductionOrder | undefined;
  let items: ProductionOrderItem[] = [];
  let costs: ProductionOrderCost[] = [];

  await db.transaction('rw', productionTables, async () => {
    const order = await getRequiredProductionOrder(productionOrderId);
    items = await getProductionOrderItems(order.id);
    costs = await getProductionOrderCosts(order.id);

    if (order.status === 'DRAFT') {
      voidedOrder = withPendingProductionOrderSync({
        ...order,
        status: 'VOIDED',
        voided_at: now,
        void_reason: normalizedReason,
        updated_at: now,
      });
      await db.productionOrders.put(voidedOrder);
      return;
    }

    assertProductionOrderPosted(order);
    const finishedProduct = await getRequiredProduct(order.finished_product_id, 'Produk barang jadi');
    if (toFiniteNumber(finishedProduct.stock) < order.quantity_produced) {
      throw new Error(`Stok ${finishedProduct.name} tidak cukup untuk void produksi.`);
    }

    await consumeFifoLots(finishedProduct.id, order.quantity_produced, {
      sourceType: 'PRODUCTION_VOID',
      sourceId: order.id,
      sourceLineId: order.id,
      createdAt: now,
    });
    await db.products.update(finishedProduct.id, {
      stock: toFiniteNumber(finishedProduct.stock) - order.quantity_produced,
      updated_at: now,
    });
    stockMutations.push(createStockMutation({
      product: finishedProduct,
      sourceType: 'PRODUCTION_VOID',
      sourceId: order.id,
      sourceNumber: order.production_number,
      sourceLineId: `${order.id}:output`,
      quantityDelta: -order.quantity_produced,
      sourceQuantity: order.quantity_produced,
      sourceUnit: order.unit,
      reason: normalizedReason,
      actor: getActorSnapshot(currentUser),
      occurredAt: now,
    }));

    for (const item of items) {
      const materialProduct = await getRequiredProduct(item.material_product_id, `Produk bahan baku ${item.material_product_name}`);
      await db.products.update(materialProduct.id, {
        stock: toFiniteNumber(materialProduct.stock) + item.stock_quantity_used,
        updated_at: now,
      });
      await addInventoryLot({
        productId: materialProduct.id,
        productName: materialProduct.name,
        sku: materialProduct.sku,
        sourceType: 'PRODUCTION_VOID',
        sourceId: order.id,
        sourceLineId: item.id,
        quantityReceived: item.stock_quantity_used,
        costPerUnit: item.cost_per_unit,
        costStatus: 'FINAL',
        receivedAt: now,
      });
      stockMutations.push(createStockMutation({
        product: materialProduct,
        sourceType: 'PRODUCTION_VOID',
        sourceId: order.id,
        sourceNumber: order.production_number,
        sourceLineId: `${item.id}:material`,
        quantityDelta: item.stock_quantity_used,
        sourceQuantity: item.quantity_used,
        sourceUnit: item.unit,
        reason: normalizedReason,
        actor: getActorSnapshot(currentUser),
        occurredAt: now,
      }));
    }

    voidedOrder = withPendingProductionOrderSync({
      ...order,
      status: 'VOIDED',
      voided_at: now,
      void_reason: normalizedReason,
      updated_at: now,
    });

    await db.productionOrders.put(voidedOrder);
    await reverseProductionOrderJournal(voidedOrder, normalizedReason, currentUser);
  });

  if (!voidedOrder) {
    throw new Error('Produksi gagal divoid.');
  }

  await enqueueStockMutations(stockMutations);
  await enqueueProductionOrderBundleSync(voidedOrder, items, costs, 'update');
  await writeActivityLog({
    user: currentUser,
    action: 'PRODUCTION_ORDER_VOIDED',
    entity: 'productionOrders',
    entity_id: voidedOrder.id,
    description: `${currentUser?.name ?? 'User'} void produksi ${voidedOrder.production_number}. Alasan: ${normalizedReason}`,
  });

  return { order: voidedOrder, items, costs };
};
