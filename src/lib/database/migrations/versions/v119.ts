import type { KasirkuDB } from '../../KasirkuDB';
import { buildSystemRolePermissions } from '@/auth/roleSeed';
import type { RolePermission } from '@/types';

export function registerMigrationV119(db: KasirkuDB) {
  db.version(119).stores({
    posStockDiscrepancies: 'id, transaction_id, transaction_item_id, cashier_session_id, restaurant_session_id, product_id, status, cashier_user_id, reviewed_by, created_at, updated_at, sync_status',
  }).upgrade(async (transaction) => {
    const now = new Date().toISOString();
    const permissionStore = transaction.table<RolePermission>('rolePermissions');
    const existingIds = new Set((await permissionStore.toArray()).map((row) => row.id));
    const grants = buildSystemRolePermissions(now).filter((row) => (
      row.permission_code === 'POS_STOCK_DISCREPANCY_REVIEW'
      && !existingIds.has(row.id)
    ));
    if (grants.length > 0) await permissionStore.bulkPut(grants);
  });
}
