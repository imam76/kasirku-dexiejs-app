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

export const RESTAURANT_TABLE_TYPES: RestaurantTableType[] = ['REGULAR', 'VIP', 'VVIP'];

export const RESTAURANT_TABLE_TYPE_PRESETS: Record<RestaurantTableType, { prefix: string; capacity: number }> = {
  REGULAR: { prefix: 'M', capacity: 4 },
  VIP: { prefix: 'VIP ', capacity: 6 },
  VVIP: { prefix: 'VVIP ', capacity: 8 },
};

export const RESTAURANT_TABLE_NAME_MAX_LENGTH = 80;
export const RESTAURANT_TABLE_SEED_MAX_COUNT = 200;
export const RESTAURANT_TABLE_SEED_MAX_DIGITS = 6;

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

const validateRestaurantTableType = (type?: RestaurantTableType) => {
  const value = type ?? 'REGULAR';
  if (!RESTAURANT_TABLE_TYPES.includes(value)) throw new Error('Tipe meja tidak dikenal.');
  return value;
};

export const validateRestaurantTableInput = (input: RestaurantTableInput) => {
  const name = input.name.trim();
  const capacity = Number(input.capacity);
  if (!name) throw new Error('Nama meja wajib diisi.');
  if (name.length > RESTAURANT_TABLE_NAME_MAX_LENGTH) {
    throw new Error(`Nama meja maksimal ${RESTAURANT_TABLE_NAME_MAX_LENGTH} karakter.`);
  }
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new Error('Jumlah kursi harus berupa bilangan bulat minimal 1.');
  }
  return {
    name,
    normalized_name: normalizeRestaurantTableName(name),
    capacity,
    type: validateRestaurantTableType(input.type),
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

export interface RestaurantTableSeedInput {
  type?: RestaurantTableType;
  prefix: string;
  startNumber: number;
  count: number;
  digits: number;
  capacity: number;
  skipExisting?: boolean;
}

export const validateRestaurantTableSeedInput = (input: RestaurantTableSeedInput) => {
  const type = validateRestaurantTableType(input.type);
  const prefix = (input.prefix ?? '').trimStart();
  const count = Number(input.count);
  const startNumber = Number(input.startNumber);
  const digits = Number(input.digits);
  const capacity = Number(input.capacity);

  if (!Number.isInteger(count) || count < 1) {
    throw new Error('Jumlah meja harus berupa bilangan bulat minimal 1.');
  }
  if (count > RESTAURANT_TABLE_SEED_MAX_COUNT) {
    throw new Error(`Jumlah meja maksimal ${RESTAURANT_TABLE_SEED_MAX_COUNT} untuk sekali pembuatan.`);
  }
  if (!Number.isInteger(startNumber) || startNumber < 0) {
    throw new Error('Nomor awal harus berupa bilangan bulat minimal 0.');
  }
  if (!Number.isInteger(digits) || digits < 1 || digits > RESTAURANT_TABLE_SEED_MAX_DIGITS) {
    throw new Error(`Jumlah digit nomor harus antara 1 sampai ${RESTAURANT_TABLE_SEED_MAX_DIGITS}.`);
  }
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new Error('Jumlah kursi harus berupa bilangan bulat minimal 1.');
  }

  const names = Array.from({ length: count }, (_, index) => (
    `${prefix}${String(startNumber + index).padStart(digits, '0')}`.trim()
  ));
  const invalidName = names.find((name) => !name || name.length > RESTAURANT_TABLE_NAME_MAX_LENGTH);
  if (invalidName !== undefined) {
    throw new Error(`Pola penamaan menghasilkan nama tidak valid (maksimal ${RESTAURANT_TABLE_NAME_MAX_LENGTH} karakter).`);
  }

  return { names, capacity, type };
};

export const previewRestaurantTableSeed = (
  input: RestaurantTableSeedInput,
  existingTables: Array<Pick<RestaurantTableRecord, 'name' | 'normalized_name' | 'is_active'>>,
) => {
  const values = validateRestaurantTableSeedInput(input);
  const takenNames = new Set(
    existingTables
      .filter((table) => table.is_active)
      .map((table) => table.normalized_name || normalizeRestaurantTableName(table.name)),
  );
  const duplicates = values.names.filter((name) => takenNames.has(normalizeRestaurantTableName(name)));
  const creatable = values.names.filter((name) => !takenNames.has(normalizeRestaurantTableName(name)));
  return { ...values, duplicates, creatable };
};

export const seedRestaurantTables = async (input: RestaurantTableSeedInput) => {
  const existingTables = await db.restaurantTables.toArray();
  const { creatable, duplicates, capacity, type } = previewRestaurantTableSeed(input, existingTables);

  if (duplicates.length > 0 && input.skipExisting === false) {
    const preview = duplicates.slice(0, 5).join(', ');
    const rest = duplicates.length > 5 ? ` (+${duplicates.length - 5} lainnya)` : '';
    throw new Error(`Nama meja berikut sudah digunakan: ${preview}${rest}.`);
  }
  if (creatable.length === 0) {
    throw new Error('Tidak ada meja baru yang dapat dibuat karena semua nama sudah digunakan.');
  }

  const now = new Date().toISOString();
  const records: RestaurantTableRecord[] = creatable.map((name) => ({
    id: crypto.randomUUID(),
    area_id: 'default',
    area_name: 'Utama',
    name,
    normalized_name: normalizeRestaurantTableName(name),
    capacity,
    ...getNewRestaurantTableDefaults(now),
    type,
  }));
  await db.restaurantTables.bulkAdd(records);
  return { created: records.length, skipped: duplicates };
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
