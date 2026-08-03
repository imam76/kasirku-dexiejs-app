import type { Permission, RestaurantTableRecord, RolePermission } from '@/types';
import type { KasirkuDB } from '../../KasirkuDB';

const INITIAL_TABLES = [
  ['table-01', 'indoor', 'Indoor', 'M01', 2],
  ['table-02', 'indoor', 'Indoor', 'M02', 4],
  ['table-03', 'indoor', 'Indoor', 'M03', 4],
  ['table-04', 'indoor', 'Indoor', 'M04', 6],
  ['table-05', 'indoor', 'Indoor', 'M05', 2],
  ['table-06', 'indoor', 'Indoor', 'M06', 4],
  ['table-07', 'terrace', 'Teras', 'T01', 2],
  ['table-08', 'terrace', 'Teras', 'T02', 4],
  ['table-09', 'terrace', 'Teras', 'T03', 4],
  ['table-10', 'terrace', 'Teras', 'T04', 6],
  ['table-11', 'vip', 'VIP', 'VIP 1', 8],
  ['table-12', 'vip', 'VIP', 'VIP 2', 10],
] as const;

const TABLE_PERMISSIONS: Permission[] = [
  'RESTAURANT_TABLE_VIEW',
  'RESTAURANT_TABLE_CREATE',
  'RESTAURANT_TABLE_UPDATE',
  'RESTAURANT_TABLE_DELETE',
];

export function registerMigrationV108(db: KasirkuDB) {
  db.version(108).stores({
    restaurantTables: 'id, area_id, normalized_name, name, type, status, is_active, active_order_id, updated_at',
  }).upgrade(async (transaction) => {
    const now = new Date().toISOString();
    const tableStore = transaction.table<RestaurantTableRecord>('restaurantTables');
    const existingTables = await tableStore.toArray();
    if (existingTables.length > 0) {
      await tableStore.bulkPut(existingTables.map((table) => ({
        ...table,
        normalized_name: table.name.trim().toLocaleLowerCase('id-ID'),
        type: table.type ?? 'REGULAR',
        is_active: table.is_active ?? true,
        updated_at: now,
      })));
    } else {
      await tableStore.bulkAdd(INITIAL_TABLES.map(([id, areaId, areaName, name, capacity]) => ({
        id,
        area_id: areaId,
        area_name: areaName,
        name,
        normalized_name: name.toLocaleLowerCase('id-ID'),
        capacity,
        type: areaId === 'vip' ? 'VIP' : 'REGULAR',
        status: 'AVAILABLE',
        is_active: true,
        created_at: now,
        updated_at: now,
      })));
    }

    const permissionStore = transaction.table<RolePermission>('rolePermissions');
    const currentPermissions = await permissionStore.toArray();
    const existingKeys = new Set(currentPermissions.map((item) => `${item.role_id}:${item.permission_code}`));
    const grants = currentPermissions
      .filter((item) => item.permission_code === 'AREA_MANAGE')
      .flatMap((source) => TABLE_PERMISSIONS.map((permission): RolePermission => ({
        id: `${source.role_id}:${permission}`,
        role_id: source.role_id,
        permission_code: permission,
        created_at: now,
        updated_at: now,
        sync_status: 'pending',
      })))
      .filter((item) => !existingKeys.has(`${item.role_id}:${item.permission_code}`));
    if (grants.length > 0) await permissionStore.bulkPut(grants);
  });
}
