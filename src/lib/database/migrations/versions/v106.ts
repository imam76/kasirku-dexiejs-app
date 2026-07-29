import type { KasirkuDB } from '../../KasirkuDB';

export function registerMigrationV106(db: KasirkuDB) {
  db.version(106).stores({
    transactions: 'id, transaction_number, payment_method, payment_method_id, payment_method_code, cashier_session_id, restaurant_session_id, &restaurant_order_id, cashier_user_id, member_contact_id, member_number, created_at',
    restaurantSessions: 'id, &session_number, status, operator_user_id, opened_at, closed_at, balance_status, created_at, updated_at',
    restaurantTables: 'id, area_id, status, active_order_id, name, updated_at',
    restaurantOrders: 'id, &order_number, restaurant_session_id, operator_user_id, mode, table_id, status, transaction_id, opened_at, updated_at, [restaurant_session_id+status], [restaurant_session_id+table_id]',
    restaurantKitchenTickets: 'id, restaurant_session_id, order_id, status, created_at, updated_at, [restaurant_session_id+status]',
  });
}
