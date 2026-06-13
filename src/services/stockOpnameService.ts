import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import { enqueueStockOpnameBundleSync } from '@/services/syncQueueService';
import { createStockMutation, enqueueStockMutations } from '@/services/stockMutationSyncService';
import type { AuthUser, Product, StockMutation, StockOpname, StockOpnameItem } from '@/types';
import { addInventoryLot } from '@/utils/inventory/addInventoryLot';
import { consumeFifoLots } from '@/utils/inventory/consumeFifoLots';
import {
  calculateStockOpnameSummary,
  calculateStockOpnameVariance,
} from '@/utils/stockOpname/calculateStockOpnameVariance';
import { createStockOpnameNumber } from '@/utils/stockOpname/createStockOpnameNumber';
import {
  assertStockOpnameDraft,
  assertStockOpnameReviewed,
  validateCountedQuantity,
  validateStockOpnameItemsForPost,
} from '@/utils/stockOpname/validateStockOpname';

export interface CreateStockOpnameDraftInput {
  countedAt?: string;
  notes?: string;
  warehouseId?: string;
  warehouseCode?: string;
  warehouseName?: string;
  productIds?: string[];
  searchText?: string;
  category?: string;
}

export interface UpdateStockOpnameDraftInput {
  opnameId: string;
  countedAt?: string;
  notes?: string;
  items: Array<{
    id: string;
    counted_quantity?: number | null;
    notes?: string;
  }>;
}

export interface PostStockOpnameInput {
  opnameId: string;
}

export interface ReviewStockOpnameInput {
  opnameId: string;
}

export interface ReopenStockOpnameReviewInput {
  opnameId: string;
}

export interface CancelStockOpnameDraftInput {
  opnameId: string;
  reason?: string;
}

export interface StockOpnameDetailResult {
  opname: StockOpname;
  items: StockOpnameItem[];
}

const toFiniteNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const normalizeCountedQuantity = (value: number | null | undefined) => {
  if (value === null || value === undefined) return undefined;
  validateCountedQuantity(value);
  return Number(value);
};

const getActorSnapshot = (actor: AuthUser | null) => ({
  id: actor?.id,
  name: actor?.name,
});

const withPendingStockOpnameSync = <T extends StockOpname>(opname: T): T => ({
  ...opname,
  sync_status: 'pending',
  sync_error: undefined,
});

const filterProductsForDraft = (products: Product[], input: CreateStockOpnameDraftInput) => {
  const selectedProductIds = input.productIds?.length ? new Set(input.productIds) : null;
  const query = input.searchText?.trim().toLowerCase();
  const category = input.category?.trim();

  return products.filter((product) => {
    const matchesProductIds = !selectedProductIds || selectedProductIds.has(product.id);
    const matchesCategory = !category || product.category === category;
    const matchesSearch = !query || [
      product.name,
      product.sku,
      product.category,
    ].some((value) => value?.toLowerCase().includes(query));

    return matchesProductIds && matchesCategory && matchesSearch;
  });
};

const buildOpnameItem = (opnameId: string, product: Product, now: string): StockOpnameItem => {
  const variance = calculateStockOpnameVariance({
    system_quantity: toFiniteNumber(product.stock),
    counted_quantity: undefined,
    cost_per_unit: toFiniteNumber(product.purchase_price),
  });

  return {
    id: crypto.randomUUID(),
    opname_id: opnameId,
    product_id: product.id,
    product_name: product.name,
    sku: product.sku,
    category: product.category,
    system_quantity: toFiniteNumber(product.stock),
    counted_quantity: undefined,
    quantity_delta: variance.quantity_delta,
    unit: product.purchase_unit,
    cost_per_unit: toFiniteNumber(product.purchase_price),
    variance_value: variance.variance_value,
    created_at: now,
    updated_at: now,
  };
};

const getOpnameWarehouseSnapshot = (opname: StockOpname) => ({
  id: opname.warehouse_id,
  code: opname.warehouse_code,
  name: opname.warehouse_name,
});

const getRequiredOpname = async (opnameId: string) => {
  const opname = await db.stockOpnames.get(opnameId);
  if (!opname) {
    throw new Error('Stock opname tidak ditemukan.');
  }

  return opname;
};

const assertStockOpnameOpenForCancel = (opname: Pick<StockOpname, 'status'>) => {
  if (opname.status !== 'DRAFT' && opname.status !== 'REVIEWED') {
    throw new Error('Hanya stock opname draft atau reviewed yang bisa dibatalkan.');
  }
};

const getOpnameItems = async (opnameId: string) => (
  db.stockOpnameItems.where('opname_id').equals(opnameId).toArray()
);

export const createStockOpnameDraft = async (
  input: CreateStockOpnameDraftInput = {},
): Promise<StockOpnameDetailResult> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'STOCK_OPNAME_MANAGE');

  const products = filterProductsForDraft(await db.products.toArray(), input);
  if (products.length === 0) {
    throw new Error('Tidak ada produk yang cocok untuk dibuatkan stock opname.');
  }

  const now = new Date().toISOString();
  const opnameId = crypto.randomUUID();
  const items = products.map((product) => buildOpnameItem(opnameId, product, now));
  const summary = calculateStockOpnameSummary(items);
  const opname: StockOpname = withPendingStockOpnameSync({
    id: opnameId,
    opname_number: createStockOpnameNumber(new Date(now)),
    status: 'DRAFT',
    counted_at: input.countedAt ?? now,
    warehouse_id: input.warehouseId,
    warehouse_code: input.warehouseCode,
    warehouse_name: input.warehouseName,
    notes: input.notes,
    created_by: currentUser?.id,
    created_by_name: currentUser?.name,
    total_items: summary.total_items,
    total_adjustment_in: summary.total_adjustment_in,
    total_adjustment_out: summary.total_adjustment_out,
    total_variance_value: summary.total_variance_value,
    created_at: now,
    updated_at: now,
  });

  await db.transaction('rw', [db.stockOpnames, db.stockOpnameItems], async () => {
    await db.stockOpnames.add(opname);
    await db.stockOpnameItems.bulkAdd(items);
  });

  await writeActivityLog({
    user: currentUser,
    action: 'STOCK_OPNAME_CREATED',
    entity: 'stockOpnames',
    entity_id: opname.id,
    description: `${currentUser?.name ?? 'User'} membuat draft stock opname ${opname.opname_number}.`,
  });

  await enqueueStockOpnameBundleSync(opname, items, 'create');

  return { opname, items };
};

export const updateStockOpnameDraft = async ({
  opnameId,
  countedAt,
  notes,
  items: itemInputs,
}: UpdateStockOpnameDraftInput): Promise<StockOpnameDetailResult> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'STOCK_OPNAME_MANAGE');
  const inputById = new Map(itemInputs.map((item) => [item.id, item]));
  let updatedOpname: StockOpname | undefined;
  let updatedItems: StockOpnameItem[] = [];

  await db.transaction('rw', [db.stockOpnames, db.stockOpnameItems], async () => {
    const opname = await getRequiredOpname(opnameId);
    assertStockOpnameDraft(opname);
    const existingItems = await getOpnameItems(opnameId);

    updatedItems = existingItems.map((item) => {
      const input = inputById.get(item.id);
      if (!input) return item;

      const countedQuantity = normalizeCountedQuantity(input.counted_quantity);
      const variance = calculateStockOpnameVariance({
        system_quantity: item.system_quantity,
        counted_quantity: countedQuantity,
        cost_per_unit: item.cost_per_unit,
      });

      return {
        ...item,
        counted_quantity: countedQuantity,
        quantity_delta: variance.quantity_delta,
        variance_value: variance.variance_value,
        notes: input.notes,
        updated_at: new Date().toISOString(),
      };
    });

    const summary = calculateStockOpnameSummary(updatedItems);
    updatedOpname = withPendingStockOpnameSync({
      ...opname,
      counted_at: countedAt ?? opname.counted_at,
      notes,
      total_items: summary.total_items,
      total_adjustment_in: summary.total_adjustment_in,
      total_adjustment_out: summary.total_adjustment_out,
      total_variance_value: summary.total_variance_value,
      updated_at: new Date().toISOString(),
    });

    await db.stockOpnameItems.bulkPut(updatedItems);
    await db.stockOpnames.put(updatedOpname);
  });

  if (!updatedOpname) {
    throw new Error('Stock opname gagal diperbarui.');
  }

  await writeActivityLog({
    user: currentUser,
    action: 'STOCK_OPNAME_UPDATED',
    entity: 'stockOpnames',
    entity_id: updatedOpname.id,
    description: `${currentUser?.name ?? 'User'} memperbarui draft stock opname ${updatedOpname.opname_number}.`,
  });

  await enqueueStockOpnameBundleSync(updatedOpname, updatedItems, 'update');

  return {
    opname: updatedOpname,
    items: updatedItems,
  };
};

export const reviewStockOpnameDraft = async ({
  opnameId,
}: ReviewStockOpnameInput): Promise<StockOpnameDetailResult> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'STOCK_OPNAME_MANAGE');
  const now = new Date().toISOString();
  let reviewedOpname: StockOpname | undefined;
  let reviewedItems: StockOpnameItem[] = [];

  await db.transaction('rw', [db.products, db.stockOpnames, db.stockOpnameItems], async () => {
    const opname = await getRequiredOpname(opnameId);
    assertStockOpnameDraft(opname);
    const items = await getOpnameItems(opnameId);
    const products = await db.products.bulkGet(items.map((item) => item.product_id));
    const productsById = new Map(
      products
        .filter((product): product is Product => Boolean(product))
        .map((product) => [product.id, product]),
    );

    if (productsById.size !== new Set(items.map((item) => item.product_id)).size) {
      throw new Error('Ada produk opname yang tidak ditemukan.');
    }

    validateStockOpnameItemsForPost(items, productsById);
    const summary = calculateStockOpnameSummary(items);
    reviewedItems = items;
    reviewedOpname = withPendingStockOpnameSync({
      ...opname,
      status: 'REVIEWED',
      reviewed_at: now,
      reviewed_by: currentUser?.id,
      reviewed_by_name: currentUser?.name,
      total_items: summary.total_items,
      total_adjustment_in: summary.total_adjustment_in,
      total_adjustment_out: summary.total_adjustment_out,
      total_variance_value: summary.total_variance_value,
      updated_at: now,
    });

    await db.stockOpnames.put(reviewedOpname);
  });

  if (!reviewedOpname) {
    throw new Error('Stock opname gagal direview.');
  }

  await writeActivityLog({
    user: currentUser,
    action: 'STOCK_OPNAME_REVIEWED',
    entity: 'stockOpnames',
    entity_id: reviewedOpname.id,
    description: `${currentUser?.name ?? 'User'} mereview stock opname ${reviewedOpname.opname_number}.`,
  });

  await enqueueStockOpnameBundleSync(reviewedOpname, reviewedItems, 'update');

  return {
    opname: reviewedOpname,
    items: reviewedItems,
  };
};

export const reopenStockOpnameReview = async ({
  opnameId,
}: ReopenStockOpnameReviewInput): Promise<StockOpnameDetailResult> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'STOCK_OPNAME_MANAGE');
  const now = new Date().toISOString();
  let reopenedOpname: StockOpname | undefined;
  let reopenedItems: StockOpnameItem[] = [];

  await db.transaction('rw', [db.stockOpnames, db.stockOpnameItems], async () => {
    const opname = await getRequiredOpname(opnameId);
    assertStockOpnameReviewed(opname);
    reopenedItems = await getOpnameItems(opnameId);
    reopenedOpname = withPendingStockOpnameSync({
      ...opname,
      status: 'DRAFT',
      reviewed_at: undefined,
      reviewed_by: undefined,
      reviewed_by_name: undefined,
      updated_at: now,
    });

    await db.stockOpnames.put(reopenedOpname);
  });

  if (!reopenedOpname) {
    throw new Error('Stock opname gagal dibuka ulang.');
  }

  await writeActivityLog({
    user: currentUser,
    action: 'STOCK_OPNAME_REOPENED',
    entity: 'stockOpnames',
    entity_id: reopenedOpname.id,
    description: `${currentUser?.name ?? 'User'} membuka ulang review stock opname ${reopenedOpname.opname_number}.`,
  });

  await enqueueStockOpnameBundleSync(reopenedOpname, reopenedItems, 'update');

  return {
    opname: reopenedOpname,
    items: reopenedItems,
  };
};

export const postStockOpname = async ({
  opnameId,
}: PostStockOpnameInput): Promise<StockOpnameDetailResult> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'STOCK_OPNAME_MANAGE');
  const now = new Date().toISOString();
  const stockMutations: StockMutation[] = [];
  let postedOpname: StockOpname | undefined;
  let postedItems: StockOpnameItem[] = [];

  await db.transaction('rw', [
    db.products,
    db.stockOpnames,
    db.stockOpnameItems,
    db.inventoryLots,
    db.inventoryLotConsumptions,
  ], async () => {
    const opname = await getRequiredOpname(opnameId);
    assertStockOpnameReviewed(opname);
    const items = await getOpnameItems(opnameId);
    const products = await db.products.bulkGet(items.map((item) => item.product_id));
    const productsById = new Map(
      products
        .filter((product): product is Product => Boolean(product))
        .map((product) => [product.id, product]),
    );

    if (productsById.size !== new Set(items.map((item) => item.product_id)).size) {
      throw new Error('Ada produk opname yang tidak ditemukan.');
    }

    validateStockOpnameItemsForPost(items, productsById);

    postedItems = [];
    for (const item of items) {
      const countedQuantity = item.counted_quantity;
      if (countedQuantity === undefined || countedQuantity === null) {
        postedItems.push(item);
        continue;
      }

      const product = productsById.get(item.product_id);
      if (!product) {
        throw new Error(`Produk ${item.product_name} tidak ditemukan.`);
      }

      if (toFiniteNumber(product.stock) !== toFiniteNumber(item.system_quantity)) {
        throw new Error(`Stok sistem ${product.name} sudah berubah sejak draft dibuat. Refresh opname sebelum posting.`);
      }

      const variance = calculateStockOpnameVariance({
        system_quantity: item.system_quantity,
        counted_quantity: countedQuantity,
        cost_per_unit: item.cost_per_unit,
      });
      const quantityDelta = variance.quantity_delta;
      const updatedItem: StockOpnameItem = {
        ...item,
        quantity_delta: quantityDelta,
        variance_value: variance.variance_value,
        updated_at: now,
      };

      postedItems.push(updatedItem);

      if (quantityDelta === 0) {
        continue;
      }

      await db.products.update(product.id, {
        stock: toFiniteNumber(product.stock) + quantityDelta,
        updated_at: now,
      });

      if (quantityDelta > 0) {
        await addInventoryLot({
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          sourceType: 'STOCK_OPNAME',
          sourceId: opname.id,
          sourceLineId: item.id,
          quantityReceived: quantityDelta,
          costPerUnit: item.cost_per_unit,
          costStatus: 'FINAL',
          receivedAt: now,
        });
      } else {
        await consumeFifoLots(product.id, Math.abs(quantityDelta), {
          sourceType: 'STOCK_OPNAME',
          sourceId: opname.id,
          sourceLineId: item.id,
          createdAt: now,
        });
      }

      stockMutations.push(createStockMutation({
        product,
        warehouse: getOpnameWarehouseSnapshot(opname),
        sourceType: 'STOCK_OPNAME',
        sourceId: opname.id,
        sourceNumber: opname.opname_number,
        sourceLineId: item.id,
        quantityDelta,
        sourceQuantity: countedQuantity,
        sourceUnit: item.unit,
        reason: item.notes ?? opname.notes,
        actor: getActorSnapshot(currentUser),
        occurredAt: now,
      }));
    }

    const summary = calculateStockOpnameSummary(postedItems);
    postedOpname = withPendingStockOpnameSync({
      ...opname,
      status: 'POSTED',
      posted_at: now,
      posted_by: currentUser?.id,
      posted_by_name: currentUser?.name,
      total_items: summary.total_items,
      total_adjustment_in: summary.total_adjustment_in,
      total_adjustment_out: summary.total_adjustment_out,
      total_variance_value: summary.total_variance_value,
      updated_at: now,
    });

    await db.stockOpnameItems.bulkPut(postedItems);
    await db.stockOpnames.put(postedOpname);
  });

  if (!postedOpname) {
    throw new Error('Stock opname gagal diposting.');
  }

  await enqueueStockMutations(stockMutations);
  await enqueueStockOpnameBundleSync(postedOpname, postedItems, 'update');
  await writeActivityLog({
    user: currentUser,
    action: 'STOCK_OPNAME_POSTED',
    entity: 'stockOpnames',
    entity_id: postedOpname.id,
    description: `${currentUser?.name ?? 'User'} posting stock opname ${postedOpname.opname_number}.`,
  });

  return {
    opname: postedOpname,
    items: postedItems,
  };
};

export const cancelStockOpnameDraft = async ({
  opnameId,
  reason,
}: CancelStockOpnameDraftInput): Promise<StockOpname> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'STOCK_OPNAME_MANAGE');
  const now = new Date().toISOString();
  let cancelledOpname: StockOpname | undefined;

  let cancelledItems: StockOpnameItem[] = [];

  await db.transaction('rw', [db.stockOpnames, db.stockOpnameItems], async () => {
    const opname = await getRequiredOpname(opnameId);
    assertStockOpnameOpenForCancel(opname);
    cancelledItems = await getOpnameItems(opnameId);

    cancelledOpname = withPendingStockOpnameSync({
      ...opname,
      status: 'CANCELLED',
      cancelled_at: now,
      cancelled_by: currentUser?.id,
      cancelled_by_name: currentUser?.name,
      cancel_reason: reason,
      updated_at: now,
    });

    await db.stockOpnames.put(cancelledOpname);
  });

  if (!cancelledOpname) {
    throw new Error('Stock opname gagal dibatalkan.');
  }

  await writeActivityLog({
    user: currentUser,
    action: 'STOCK_OPNAME_CANCELLED',
    entity: 'stockOpnames',
    entity_id: cancelledOpname.id,
    description: `${currentUser?.name ?? 'User'} membatalkan stock opname ${cancelledOpname.opname_number}.`,
  });

  await enqueueStockOpnameBundleSync(cancelledOpname, cancelledItems, 'update');

  return cancelledOpname;
};
