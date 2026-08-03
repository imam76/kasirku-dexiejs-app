import { db } from '@/lib/db';
import { checkout, recordPosExpense, type CheckoutResult } from '@/services/checkoutService';
import type { CheckoutPaymentInput } from '@/services/posTransactionPaymentService';
import type {
  CartItem,
  Product,
  Promo,
  RestaurantKitchenTicketRecord,
  RestaurantKitchenTicketStatus,
  RestaurantOrderLineFulfillmentType,
  RestaurantOrderLineRecord,
  RestaurantOrderRecord,
  RestaurantOrderType,
  RestaurantServiceMode,
  RestaurantSession,
  RestaurantTableRecord,
  RestaurantTableStatus,
} from '@/types';
import { evaluatePromos } from '@/services/promoService';
import { getPrice, konversiSatuanProduk } from '@/utils/pricing';
import { isProductVisibleInPos } from '@/utils/productAvailability';
import {
  occupyRestaurantTable,
  releaseRestaurantTable,
} from '@/services/restaurantTableService';

const OPEN_ORDER_STATUSES = new Set<RestaurantOrderRecord['status']>(['DRAFT', 'SENT_TO_KITCHEN']);

export type RestaurantProductKind = 'FOOD' | 'DRINK';
export type RestaurantPaymentMode = 'FULL' | 'SPLIT';

const RESTAURANT_DRINK_CATEGORIES = new Set([
  'minuman',
  'minuman_dingin',
  'minuman_panas',
  'kopi',
  'teh',
  'jus_smoothie',
]);

export const getRestaurantProductKind = (product: Pick<Product, 'category'>): RestaurantProductKind => (
  RESTAURANT_DRINK_CATEGORIES.has(product.category?.toLocaleLowerCase('id-ID') ?? '') ? 'DRINK' : 'FOOD'
);

export const hasRestaurantProductDiscount = (product: Product, promos: Promo[]) => evaluatePromos({
  cart: [{ product, quantity: 1, unit: product.selling_unit }],
  promos,
}).discount_amount > 0;

export const isRestaurantPaymentModeEnabled = (mode: RestaurantPaymentMode) => mode === 'FULL';

export const getRestaurantCheckoutSessionContext = (sessionId: string) => ({
  kind: 'RESTAURANT' as const,
  sessionId,
});

export const getNextRestaurantKitchenTicketStatus = (
  status: RestaurantKitchenTicketStatus,
): RestaurantKitchenTicketStatus => {
  if (status === 'NEW') return 'PREPARING';
  if (status === 'PREPARING') return 'READY';
  return 'COMPLETED';
};

export const runCounterServicePaymentThenKitchen = async <T>(
  checkoutAction: () => Promise<T>,
  finalizePaidOrder: (result: T) => Promise<void>,
) => {
  const result = await checkoutAction();
  await finalizePaidOrder(result);
  return result;
};

export const getPendingKitchenQuantity = (
  line: Pick<RestaurantOrderLineRecord, 'quantity' | 'sent_quantity'>,
) => Math.max(0, Number(line.quantity) - Number(line.sent_quantity));

export const getRestaurantOrderLineFulfillmentType = (
  line: Pick<RestaurantOrderLineRecord, 'fulfillment_type'>,
  orderType: RestaurantOrderType,
): RestaurantOrderLineFulfillmentType => (
  line.fulfillment_type ?? (orderType === 'DINE_IN' ? 'DINE_IN' : 'TAKEAWAY')
);

export const filterRestaurantTables = (
  tables: RestaurantTableRecord[],
  status: 'ALL' | RestaurantTableStatus,
) => status === 'ALL' ? tables : tables.filter((table) => table.status === status);

const createOrderNumber = (mode: RestaurantServiceMode) => {
  const prefix = mode === 'TABLE_SERVICE' ? 'D' : 'A';
  return `${prefix}-${Date.now().toString().slice(-6)}${crypto.randomUUID().slice(0, 2).toUpperCase()}`;
};

export const normalizeRestaurantOrderInput = (input: {
  customerName: string;
  guestCount?: number;
  orderType: RestaurantOrderType;
  mode: RestaurantServiceMode;
  tableId?: string;
}) => {
  const customerName = input.customerName.trim().slice(0, 100);
  if (!customerName) throw new Error('Pesanan atas nama wajib diisi.');
  const guestCount = input.guestCount === undefined
    ? undefined
    : Math.floor(Number(input.guestCount));
  if (guestCount !== undefined && (!Number.isFinite(guestCount) || guestCount < 1)) {
    throw new Error('Jumlah tamu minimal 1.');
  }
  const orderType: RestaurantOrderType = input.mode === 'TABLE_SERVICE'
    ? 'DINE_IN'
    : input.orderType === 'DELIVERY' ? 'DELIVERY' : 'TAKEAWAY';
  if (input.mode === 'TABLE_SERVICE' && !input.tableId) {
    throw new Error('Pilih meja sebelum menambahkan menu.');
  }
  return { ...input, customerName, guestCount, orderType };
};

const getOpenOrderForTable = async (
  sessionId: string,
  tableId: string,
) => db.restaurantOrders
  .where('restaurant_session_id')
  .equals(sessionId)
  .and((order) => (
    OPEN_ORDER_STATUSES.has(order.status)
    && order.table_id === tableId
  ))
  .first();

export const createRestaurantOrder = async ({
  session,
  mode,
  table,
  customerName,
  guestCount,
  orderType,
}: {
  session: RestaurantSession;
  mode: RestaurantServiceMode;
  table?: RestaurantTableRecord;
  customerName: string;
  guestCount?: number;
  orderType: RestaurantOrderType;
}) => {
  const normalized = normalizeRestaurantOrderInput({ customerName, guestCount, orderType, mode, tableId: table?.id });
  const normalizedCustomerName = normalized.customerName;
  const normalizedGuestCount = normalized.guestCount;
  const normalizedOrderType = normalized.orderType;

  const existing = table && normalizedOrderType === 'DINE_IN' ? await getOpenOrderForTable(session.id, table.id) : undefined;
  if (existing) return existing;

  if (table?.active_order_id && normalizedOrderType === 'DINE_IN') {
    const activeOrder = await db.restaurantOrders.get(table.active_order_id);
    if (activeOrder && OPEN_ORDER_STATUSES.has(activeOrder.status)) {
      if (activeOrder.restaurant_session_id !== session.id) {
        throw new Error(`${table.name} sedang digunakan pada sesi Resto lain.`);
      }
      return activeOrder;
    }
  }
  if (table?.status === 'OCCUPIED' && normalizedOrderType === 'DINE_IN') {
    throw new Error(`${table.name} masih berstatus terisi. Selesaikan pesanan aktifnya terlebih dahulu.`);
  }

  const now = new Date().toISOString();
  const order: RestaurantOrderRecord = {
    id: crypto.randomUUID(),
    order_number: createOrderNumber(mode),
    restaurant_session_id: session.id,
    operator_user_id: session.operator_user_id,
    operator_user_name: session.operator_user_name,
    mode,
    order_type: normalizedOrderType,
    customer_name: normalizedCustomerName,
    table_id: normalizedOrderType === 'DINE_IN' ? table?.id : undefined,
    table_name: normalizedOrderType === 'DINE_IN' ? table?.name : undefined,
    ...(normalizedGuestCount === undefined ? {} : { guest_count: normalizedGuestCount }),
    status: 'DRAFT',
    opened_at: now,
    created_at: now,
    updated_at: now,
    lines: [],
  };
  await db.transaction('rw', [db.restaurantOrders, db.restaurantTables], async () => {
    if (table && normalizedOrderType === 'DINE_IN') {
      const latestTable = await db.restaurantTables.get(table.id);
      if (!latestTable || !latestTable.is_active) throw new Error('Meja tidak tersedia.');
      if (latestTable.active_order_id) {
        const activeOrder = await db.restaurantOrders.get(latestTable.active_order_id);
        if (activeOrder && OPEN_ORDER_STATUSES.has(activeOrder.status)) {
          throw new Error(`${latestTable.name} sudah memiliki pesanan aktif.`);
        }
      }
      if (latestTable.status === 'OCCUPIED') {
        throw new Error(`${latestTable.name} masih berstatus terisi.`);
      }
      await db.restaurantTables.update(latestTable.id, occupyRestaurantTable(latestTable, order.id, now));
    }
    await db.restaurantOrders.add(order);
  });
  return order;
};

export const addProductToRestaurantOrder = async ({
  session,
  mode,
  tableId,
  orderId,
  customerName,
  guestCount,
  orderType,
  product,
}: {
  session: RestaurantSession;
  mode: RestaurantServiceMode;
  tableId?: string;
  orderId?: string;
  customerName?: string;
  guestCount?: number;
  orderType?: RestaurantOrderType;
  product: Product;
}) => {
  if (!isProductVisibleInPos(product)) throw new Error(`${product.name} tidak ditampilkan di POS.`);
  if (product.stock <= 0) throw new Error(`Stok ${product.name} tidak tersedia.`);
  const table = tableId ? await db.restaurantTables.get(tableId) : undefined;
  const existingOrder = orderId ? await db.restaurantOrders.get(orderId) : undefined;
  if (orderId && (!existingOrder || !OPEN_ORDER_STATUSES.has(existingOrder.status))) {
    throw new Error('Pesanan aktif tidak ditemukan.');
  }
  if (existingOrder && (existingOrder.restaurant_session_id !== session.id || existingOrder.mode !== mode)) {
    throw new Error('Pesanan aktif tidak sesuai dengan sesi atau mode yang dipilih.');
  }
  const order = existingOrder ?? await createRestaurantOrder({
    session,
    mode,
    table,
    customerName: customerName ?? '',
    guestCount,
    orderType: orderType ?? 'DINE_IN',
  });
  const defaultFulfillmentType = getRestaurantOrderLineFulfillmentType({}, order.order_type);
  const existingLine = order.lines.find((line) => (
    line.product_id === product.id
    && line.unit === product.selling_unit
    && line.sent_quantity === 0
    && getRestaurantOrderLineFulfillmentType(line, order.order_type) === defaultFulfillmentType
  ));
  const nextQuantity = (existingLine?.quantity ?? 0) + 1;
  const nextQuantityInStockUnit = order.lines.reduce((total, line) => (
    line.product_id === product.id
      ? total + konversiSatuanProduk(line.quantity, product, line.unit, product.purchase_unit)
      : total
  ), konversiSatuanProduk(1, product, product.selling_unit, product.purchase_unit));
  if (nextQuantityInStockUnit > product.stock) {
    throw new Error(`Stok ${product.name} hanya ${product.stock} ${product.purchase_unit}.`);
  }

  const lines = existingLine
    ? order.lines.map((line) => line.id === existingLine.id ? { ...line, quantity: nextQuantity } : line)
    : [...order.lines, {
        id: crypto.randomUUID(),
        product_id: product.id,
        product_name: product.name,
        product_sku: product.sku,
        product_category: product.category,
        unit: product.selling_unit,
        price: getPrice(product, 1),
        quantity: 1,
        sent_quantity: 0,
        fulfillment_type: defaultFulfillmentType,
        note: '',
      }];
  const now = new Date().toISOString();

  await db.transaction('rw', [db.restaurantOrders, db.restaurantTables], async () => {
    await db.restaurantOrders.update(order.id, { lines, updated_at: now });
    if (table && table.active_order_id !== order.id) {
      await db.restaurantTables.update(table.id, occupyRestaurantTable(table, order.id, now));
    }
  });
  return order.id;
};

export const updateRestaurantOrderInfo = async (
  orderId: string,
  input: { customerName: string; guestCount?: number; orderType: RestaurantOrderType; tableId?: string },
) => {
  const order = await db.restaurantOrders.get(orderId);
  if (!order || !OPEN_ORDER_STATUSES.has(order.status)) throw new Error('Pesanan aktif tidak ditemukan.');
  const normalized = normalizeRestaurantOrderInput({
    customerName: input.customerName,
    guestCount: input.guestCount,
    orderType: input.orderType,
    mode: order.mode,
    tableId: input.tableId,
  });
  const customerName = normalized.customerName;
  const guestCount = normalized.guestCount;
  const orderType = normalized.orderType;
  const lines = order.mode === 'COUNTER_SERVICE' && orderType !== order.order_type
    ? order.lines.map((line) => ({
        ...line,
        fulfillment_type: getRestaurantOrderLineFulfillmentType({}, orderType),
      }))
    : order.lines;
  const nextTable = input.tableId ? await db.restaurantTables.get(input.tableId) : undefined;
  if (order.mode === 'TABLE_SERVICE' && !nextTable) {
    throw new Error('Pilih meja untuk pesanan Dine In.');
  }

  const now = new Date().toISOString();
  await db.transaction('rw', [db.restaurantOrders, db.restaurantTables], async () => {
    if (order.table_id && order.table_id !== nextTable?.id) {
      const oldTable = await db.restaurantTables.get(order.table_id);
      if (oldTable?.active_order_id === order.id) {
        await db.restaurantTables.update(oldTable.id, releaseRestaurantTable(oldTable, now));
      }
    }
    if (orderType === 'DINE_IN' && nextTable && nextTable.active_order_id !== order.id) {
      if (nextTable.active_order_id || nextTable.status === 'OCCUPIED') throw new Error(`${nextTable.name} sedang terisi.`);
      await db.restaurantTables.update(nextTable.id, occupyRestaurantTable(nextTable, order.id, now));
    }
    await db.restaurantOrders.update(order.id, {
      customer_name: customerName,
      guest_count: guestCount,
      order_type: orderType,
      lines,
      table_id: orderType === 'DINE_IN' ? nextTable?.id : undefined,
      table_name: orderType === 'DINE_IN' ? nextTable?.name : undefined,
      updated_at: now,
    });
  });
};

export const updateRestaurantOrderLineQuantity = async (
  orderId: string,
  lineId: string,
  requestedQuantity: number,
) => {
  const order = await db.restaurantOrders.get(orderId);
  if (!order || !OPEN_ORDER_STATUSES.has(order.status)) throw new Error('Pesanan aktif tidak ditemukan.');
  const line = order.lines.find((item) => item.id === lineId);
  if (!line) throw new Error('Item pesanan tidak ditemukan.');
  if (requestedQuantity < line.sent_quantity) {
    throw new Error('Item yang sudah dikirim ke dapur tidak dapat dikurangi.');
  }
  const product = await db.products.get(line.product_id);
  if (!product) throw new Error(`Produk ${line.product_name} tidak ditemukan.`);
  const requestedInStockUnit = order.lines.reduce((total, item) => (
    item.product_id === product.id
      ? total + konversiSatuanProduk(
          item.id === lineId ? requestedQuantity : item.quantity,
          product,
          item.unit,
          product.purchase_unit,
        )
      : total
  ), 0);
  if (requestedInStockUnit > product.stock) {
    throw new Error(`Stok ${product.name} hanya ${product.stock} ${product.purchase_unit}.`);
  }

  if (line.sent_quantity > 0 && requestedQuantity > line.quantity) {
    const pendingLine: RestaurantOrderLineRecord = {
      ...line,
      id: crypto.randomUUID(),
      quantity: requestedQuantity - line.quantity,
      sent_quantity: 0,
      fulfillment_type: getRestaurantOrderLineFulfillmentType(line, order.order_type),
    };
    await db.restaurantOrders.update(order.id, {
      lines: [...order.lines, pendingLine],
      updated_at: new Date().toISOString(),
    });
    return;
  }

  const quantity = Math.max(0, requestedQuantity);
  const lines = order.lines
    .map((item) => item.id === lineId ? { ...item, quantity } : item)
    .filter((item) => item.quantity > 0 || item.sent_quantity > 0);
  await db.restaurantOrders.update(order.id, { lines, updated_at: new Date().toISOString() });
};

export const updateRestaurantOrderLineFulfillmentType = async (
  orderId: string,
  lineId: string,
  fulfillmentType: RestaurantOrderLineFulfillmentType,
) => {
  const order = await db.restaurantOrders.get(orderId);
  if (!order || !OPEN_ORDER_STATUSES.has(order.status)) throw new Error('Pesanan aktif tidak ditemukan.');
  const line = order.lines.find((item) => item.id === lineId);
  if (!line) throw new Error('Item pesanan tidak ditemukan.');
  if (line.sent_quantity > 0) {
    throw new Error('Fulfillment item yang sudah dikirim ke dapur tidak dapat diubah.');
  }
  if (fulfillmentType !== 'DINE_IN' && fulfillmentType !== 'TAKEAWAY') {
    throw new Error('Fulfillment item tidak valid.');
  }
  const lines = order.lines.map((item) => item.id === lineId
    ? { ...item, fulfillment_type: fulfillmentType }
    : item);
  await db.restaurantOrders.update(order.id, { lines, updated_at: new Date().toISOString() });
};

export const updateRestaurantOrderLineNote = async (
  orderId: string,
  lineId: string,
  note: string,
) => {
  const order = await db.restaurantOrders.get(orderId);
  if (!order || !OPEN_ORDER_STATUSES.has(order.status)) throw new Error('Pesanan aktif tidak ditemukan.');
  const lines = order.lines.map((line) => line.id === lineId ? { ...line, note: note.slice(0, 160) } : line);
  await db.restaurantOrders.update(order.id, { lines, updated_at: new Date().toISOString() });
};

const buildPendingKitchenTicket = (
  order: RestaurantOrderRecord,
): RestaurantKitchenTicketRecord | null => {
  const lines = order.lines.flatMap((line) => {
    const pendingQuantity = getPendingKitchenQuantity(line);
    return pendingQuantity > 0 ? [{
      order_line_id: line.id,
      product_id: line.product_id,
      name: line.product_name,
      quantity: pendingQuantity,
      fulfillment_type: getRestaurantOrderLineFulfillmentType(line, order.order_type),
      note: line.note,
    }] : [];
  });
  if (lines.length === 0) return null;
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    restaurant_session_id: order.restaurant_session_id,
    order_id: order.id,
    order_number: order.order_number,
    customer_name: order.customer_name || order.order_number,
    order_type: order.order_type,
    table_name: order.table_name,
    destination_label: order.mode === 'TABLE_SERVICE'
      ? order.table_name ?? 'Meja'
      : order.order_type === 'DINE_IN' ? 'Dine-in · counter' : 'Ambil di counter',
    status: 'NEW',
    created_at: now,
    updated_at: now,
    lines,
  };
};

export const sendRestaurantOrderToKitchen = async (orderId: string) => {
  const order = await db.restaurantOrders.get(orderId);
  if (!order || !OPEN_ORDER_STATUSES.has(order.status)) throw new Error('Pesanan aktif tidak ditemukan.');
  const ticket = buildPendingKitchenTicket(order);
  if (!ticket) return null;
  const now = new Date().toISOString();
  const lines = order.lines.map((line) => ({ ...line, sent_quantity: line.quantity }));

  await db.transaction('rw', [db.restaurantOrders, db.restaurantKitchenTickets], async () => {
    await db.restaurantKitchenTickets.add(ticket);
    await db.restaurantOrders.update(order.id, {
      lines,
      status: 'SENT_TO_KITCHEN',
      updated_at: now,
    });
  });
  return ticket;
};

export const advanceRestaurantKitchenTicket = async (ticketId: string) => {
  const ticket = await db.restaurantKitchenTickets.get(ticketId);
  if (!ticket) throw new Error('Tiket dapur tidak ditemukan.');
  const nextStatus = getNextRestaurantKitchenTicketStatus(ticket.status);
  const now = new Date().toISOString();
  await db.restaurantKitchenTickets.update(ticket.id, {
    status: nextStatus,
    updated_at: now,
    completed_at: nextStatus === 'COMPLETED' ? now : undefined,
  });
  return nextStatus;
};

export const buildRestaurantCart = async (order: RestaurantOrderRecord): Promise<CartItem[]> => {
  const products = await db.products.bulkGet(order.lines.map((line) => line.product_id));
  return order.lines.map((line, index) => {
    const product = products[index];
    if (!product) throw new Error(`Produk ${line.product_name} tidak ditemukan.`);
    return { product, quantity: line.quantity, unit: line.unit };
  });
};

export const evaluateRestaurantOrderPromos = (
  order: RestaurantOrderRecord | undefined,
  products: Product[],
  promos: Promo[],
  voucherCode?: string,
) => {
  if (!order) return evaluatePromos({ cart: [], promos, voucherCode });
  const productById = new Map(products.map((product) => [product.id, product]));
  const cart = order.lines.flatMap((line): CartItem[] => {
    const product = productById.get(line.product_id);
    return product ? [{ product, quantity: line.quantity, unit: line.unit }] : [];
  });
  return evaluatePromos({ cart, promos, voucherCode });
};

export const settleRestaurantOrder = async ({
  orderId,
  payments,
  voucherCode,
}: {
  orderId: string;
  payments: CheckoutPaymentInput[];
  voucherCode?: string;
}): Promise<CheckoutResult> => {
  const order = await db.restaurantOrders.get(orderId);
  if (!order) throw new Error('Pesanan aktif tidak ditemukan.');
  if (order.transaction_id) throw new Error('Pesanan ini sudah dibayar.');
  if (!OPEN_ORDER_STATUSES.has(order.status) || order.lines.length === 0) {
    throw new Error('Pesanan belum siap dibayar.');
  }

  const resolveCheckoutResult = async () => {
    const existingTransaction = await db.transactions
      .where('restaurant_order_id')
      .equals(order.id)
      .first();
    return existingTransaction
      ? {
          transaction: existingTransaction,
          items: await db.transactionItems.where('transaction_id').equals(existingTransaction.id).toArray(),
          payments: await db.posTransactionPayments.where('transaction_id').equals(existingTransaction.id).toArray(),
        }
      : checkout({
          cart: await buildRestaurantCart(order),
          payments,
          voucherCode,
          sessionContext: getRestaurantCheckoutSessionContext(order.restaurant_session_id),
          restaurantOrderId: order.id,
        });
  };

  const finalizePaidOrder = async (result: CheckoutResult) => {
    const pendingTicket = buildPendingKitchenTicket(order);
    const now = new Date().toISOString();
    await db.transaction(
      'rw',
      [db.restaurantOrders, db.restaurantTables, db.restaurantKitchenTickets],
      async () => {
        const latest = await db.restaurantOrders.get(order.id);
        if (latest?.transaction_id) return;
        if (pendingTicket) await db.restaurantKitchenTickets.add(pendingTicket);
        await db.restaurantOrders.update(order.id, {
          status: 'PAID',
          transaction_id: result.transaction.id,
          paid_at: now,
          updated_at: now,
          lines: order.lines.map((line) => ({ ...line, sent_quantity: line.quantity })),
        });
        if (order.table_id) {
          const table = await db.restaurantTables.get(order.table_id);
          if (table?.active_order_id === order.id) {
            await db.restaurantTables.update(table.id, releaseRestaurantTable(table, now));
          }
        }
      },
    );
  };

  if (order.mode === 'COUNTER_SERVICE') {
    return runCounterServicePaymentThenKitchen(resolveCheckoutResult, finalizePaidOrder);
  }

  const result = await resolveCheckoutResult();
  await finalizePaidOrder(result);
  return result;
};

export const settleRestaurantOrderAsExpense = async (orderId: string): Promise<CheckoutResult> => {
  const order = await db.restaurantOrders.get(orderId);
  if (!order) throw new Error('Pesanan aktif tidak ditemukan.');
  if (order.transaction_id) throw new Error('Pesanan ini sudah diselesaikan.');
  if (!OPEN_ORDER_STATUSES.has(order.status) || order.lines.length === 0) {
    throw new Error('Pesanan belum siap dicatat sebagai pengeluaran.');
  }

  const resolveExpenseResult = async () => {
    const existingTransaction = await db.transactions
      .where('restaurant_order_id')
      .equals(order.id)
      .first();
    return existingTransaction
      ? {
          transaction: existingTransaction,
          items: await db.transactionItems.where('transaction_id').equals(existingTransaction.id).toArray(),
          payments: await db.posTransactionPayments.where('transaction_id').equals(existingTransaction.id).toArray(),
        }
      : recordPosExpense({
          cart: await buildRestaurantCart(order),
          sessionContext: getRestaurantCheckoutSessionContext(order.restaurant_session_id),
          restaurantOrderId: order.id,
        });
  };

  const finalizeExpenseOrder = async (result: CheckoutResult) => {
    const pendingTicket = buildPendingKitchenTicket(order);
    const now = new Date().toISOString();
    await db.transaction(
      'rw',
      [db.restaurantOrders, db.restaurantTables, db.restaurantKitchenTickets],
      async () => {
        const latest = await db.restaurantOrders.get(order.id);
        if (latest?.transaction_id) return;
        if (pendingTicket) await db.restaurantKitchenTickets.add(pendingTicket);
        await db.restaurantOrders.update(order.id, {
          status: 'PAID',
          transaction_id: result.transaction.id,
          paid_at: now,
          updated_at: now,
          lines: order.lines.map((line) => ({ ...line, sent_quantity: line.quantity })),
        });
        if (order.table_id) {
          const table = await db.restaurantTables.get(order.table_id);
          if (table?.active_order_id === order.id) {
            await db.restaurantTables.update(table.id, releaseRestaurantTable(table, now));
          }
        }
      },
    );
  };

  if (order.mode === 'COUNTER_SERVICE') {
    return runCounterServicePaymentThenKitchen(resolveExpenseResult, finalizeExpenseOrder);
  }

  const result = await resolveExpenseResult();
  await finalizeExpenseOrder(result);
  return result;
};

export const cancelRestaurantOrder = async (orderId: string) => {
  const order = await db.restaurantOrders.get(orderId);
  if (!order || !OPEN_ORDER_STATUSES.has(order.status)) {
    throw new Error('Pesanan aktif tidak ditemukan.');
  }
  if (order.transaction_id) throw new Error('Pesanan yang sudah dibayar tidak dapat dibatalkan dari POS Resto.');
  if (order.lines.some((line) => line.sent_quantity > 0)) {
    throw new Error('Pesanan yang sudah dikirim ke dapur tidak dapat dibatalkan dari POS Resto.');
  }

  const now = new Date().toISOString();
  await db.transaction('rw', [db.restaurantOrders, db.restaurantTables], async () => {
    await db.restaurantOrders.update(order.id, { status: 'CANCELLED', updated_at: now });
    if (!order.table_id) return;
    const table = await db.restaurantTables.get(order.table_id);
    if (table?.active_order_id === order.id) {
      await db.restaurantTables.update(table.id, releaseRestaurantTable(table, now));
    }
  });
};
