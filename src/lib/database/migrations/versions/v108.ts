import type { Product, RestaurantOrderRecord } from '@/types';
import type { KasirkuDB } from '../../KasirkuDB';

export function registerMigrationV108(db: KasirkuDB) {
  db.version(108).stores({}).upgrade(async (transaction) => {
    await transaction.table<Product>('products').toCollection().modify((product) => {
      product.product_type = product.product_type ?? 'FINISHED_GOOD';
      product.is_visible_in_pos = product.is_visible_in_pos ?? true;
    });
    await transaction.table<RestaurantOrderRecord>('restaurantOrders').toCollection().modify((order) => {
      order.customer_name = order.customer_name?.trim() || order.order_number;
    });
    await transaction.table('restaurantKitchenTickets').toCollection().modify((ticket) => {
      ticket.customer_name = ticket.customer_name?.trim() || ticket.order_number;
      ticket.order_type = ticket.order_type ?? 'DINE_IN';
    });
    await transaction.table('syncQueue').toCollection().modify((queueItem) => {
      if (queueItem.entity !== 'products' || !queueItem.payload || typeof queueItem.payload !== 'object') return;
      queueItem.payload.product_type = queueItem.payload.product_type ?? 'FINISHED_GOOD';
      queueItem.payload.is_visible_in_pos = queueItem.payload.is_visible_in_pos ?? true;
    });
  });
}
