import { db } from '@/lib/db';
import type {
  RestaurantTableRecord,
  RestaurantTableStatus,
  RestaurantTableType,
} from '@/types';

export interface RestaurantTableInput {
  name: string;
  capacity: number;
  type?: RestaurantTableType;
}

export type RestaurantTableFilterStatus = 'ALL' | RestaurantTableStatus;
export type RestaurantTableFilterType = 'ALL' | RestaurantTableType;

export const normalizeRestaurantTableName = (name: string) => name.trim().toLocaleLowerCase('id-ID');

export const hasDuplicateRestaurantTableName = (
  tables: Array<Pick<RestaurantTableRecord, 'id' | 'name' | 'normalized_name' | 'is_active'>>,
  name: string,
  excludeId?: string,
) => {
  const normalizedName = normalizeRestaurantTableName(name);
  return tables.some((table) => (
    table.is_active
    && table.id !== excludeId
    && (table.normalized_name || normalizeRestaurantTableName(table.name)) === normalizedName
  ));
};

export const validateRestaurantTableInput = (input: RestaurantTableInput) => {
  const name = input.name.trim();
  const capacity = Number(input.capacity);
  if (!name) throw new Error('Nama meja wajib diisi.');
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new Error('Jumlah kursi harus berupa bilangan bulat minimal 1.');
  }
  return {
    name,
    normalized_name: normalizeRestaurantTableName(name),
    capacity,
    type: input.type ?? ('REGULAR' as const),
  };
};

export const getNewRestaurantTableDefaults = (now = new Date().toISOString()) => ({
  type: 'REGULAR' as const,
  status: 'AVAILABLE' as const,
  is_active: true,
  created_at: now,
  updated_at: now,
});

export const occupyRestaurantTable = (
  table: RestaurantTableRecord,
  orderId: string,
  now = new Date().toISOString(),
) => {
  if (table.active_order_id && table.active_order_id !== orderId) {
    throw new Error(`${table.name} sudah memiliki pesanan aktif.`);
  }
  return {
    status: 'OCCUPIED' as const,
    active_order_id: orderId,
    occupied_since: table.occupied_since ?? now,
    updated_at: now,
  };
};

export const releaseRestaurantTable = (
  _table: RestaurantTableRecord,
  now = new Date().toISOString(),
) => ({
  status: 'AVAILABLE' as const,
  active_order_id: undefined,
  occupied_since: undefined,
  updated_at: now,
});

export const canDeleteRestaurantTable = (
  table: Pick<RestaurantTableRecord, 'status' | 'active_order_id'>,
) => table.status !== 'OCCUPIED' && !table.active_order_id;

const assertUniqueName = async (normalizedName: string, excludeId?: string) => {
  const matches = await db.restaurantTables
    .where('normalized_name')
    .equals(normalizedName)
    .toArray();
  if (hasDuplicateRestaurantTableName(matches, normalizedName, excludeId)) {
    throw new Error('Nama meja sudah digunakan.');
  }
};

export const createRestaurantTable = async (input: RestaurantTableInput) => {
  const values = validateRestaurantTableInput(input);
  await assertUniqueName(values.normalized_name);
  const now = new Date().toISOString();
  const table: RestaurantTableRecord = {
    id: crypto.randomUUID(),
    area_id: 'default',
    area_name: 'Utama',
    ...values,
    ...getNewRestaurantTableDefaults(now),
  };
  await db.restaurantTables.add(table);
  return table;
};

export const updateRestaurantTable = async (id: string, input: RestaurantTableInput) => {
  const current = await db.restaurantTables.get(id);
  if (!current || !current.is_active) throw new Error('Meja tidak ditemukan.');
  const values = validateRestaurantTableInput(input);
  await assertUniqueName(values.normalized_name, id);
  await db.restaurantTables.update(id, { ...values, updated_at: new Date().toISOString() });
};

export const deleteRestaurantTable = async (id: string) => {
  const table = await db.restaurantTables.get(id);
  if (!table || !table.is_active) throw new Error('Meja tidak ditemukan.');
  if (!canDeleteRestaurantTable(table)) throw new Error('Meja terisi tidak dapat dihapus.');
  const activeOrder = await db.restaurantOrders
    .where('table_id')
    .equals(id)
    .and((order) => order.status === 'DRAFT' || order.status === 'SENT_TO_KITCHEN')
    .first();
  if (activeOrder) throw new Error('Meja masih direferensikan oleh pesanan aktif.');
  await db.restaurantTables.update(id, { is_active: false, updated_at: new Date().toISOString() });
};
