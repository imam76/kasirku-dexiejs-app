import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import { warehouseSchema } from '@/lib/validations/warehouse';
import type { Warehouse } from '@/types';

export interface WarehouseUpsertInput {
  name: string;
  code?: string;
  address?: string;
  phone?: string;
  notes?: string;
  is_active?: boolean;
}

const sanitizeWarehouseInput = (
  input: WarehouseUpsertInput,
): Required<Pick<WarehouseUpsertInput, 'name' | 'is_active'>> & Omit<WarehouseUpsertInput, 'name' | 'is_active'> => {
  const parsed = warehouseSchema.parse(input);

  return {
    ...parsed,
    is_active: parsed.is_active ?? true,
  };
};

export const createWarehouse = async (input: WarehouseUpsertInput): Promise<Warehouse> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'SETTINGS_ACCESS');

  const now = new Date().toISOString();
  const warehouse: Warehouse = {
    id: crypto.randomUUID(),
    ...sanitizeWarehouseInput(input),
    created_at: now,
    updated_at: now,
  };

  await db.warehouses.add(warehouse);
  await writeActivityLog({
    user: currentUser,
    action: 'WAREHOUSE_CREATED',
    entity: 'warehouses',
    entity_id: warehouse.id,
    description: `${currentUser?.name ?? 'User'} membuat gudang ${warehouse.name}.`,
  });

  return warehouse;
};

export const updateWarehouse = async (id: string, input: WarehouseUpsertInput): Promise<Warehouse> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'SETTINGS_ACCESS');

  const existingWarehouse = await db.warehouses.get(id);
  if (!existingWarehouse) {
    throw new Error('Gudang tidak ditemukan.');
  }

  const updatedWarehouse: Warehouse = {
    ...existingWarehouse,
    ...sanitizeWarehouseInput(input),
    updated_at: new Date().toISOString(),
  };

  await db.warehouses.put(updatedWarehouse);
  await writeActivityLog({
    user: currentUser,
    action: 'WAREHOUSE_UPDATED',
    entity: 'warehouses',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} memperbarui gudang ${updatedWarehouse.name}.`,
  });

  return updatedWarehouse;
};

export const archiveWarehouse = async (id: string): Promise<Warehouse> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'SETTINGS_ACCESS');

  const warehouse = await db.warehouses.get(id);
  if (!warehouse) {
    throw new Error('Gudang tidak ditemukan.');
  }

  const archivedWarehouse = {
    ...warehouse,
    is_active: false,
    updated_at: new Date().toISOString(),
  };

  await db.warehouses.put(archivedWarehouse);
  await writeActivityLog({
    user: currentUser,
    action: 'WAREHOUSE_ARCHIVED',
    entity: 'warehouses',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} mengarsipkan gudang ${warehouse.name}.`,
  });

  return archivedWarehouse;
};

export const restoreWarehouse = async (id: string): Promise<Warehouse> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'SETTINGS_ACCESS');

  const warehouse = await db.warehouses.get(id);
  if (!warehouse) {
    throw new Error('Gudang tidak ditemukan.');
  }

  const restoredWarehouse = {
    ...warehouse,
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  await db.warehouses.put(restoredWarehouse);
  await writeActivityLog({
    user: currentUser,
    action: 'WAREHOUSE_RESTORED',
    entity: 'warehouses',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} memulihkan gudang ${warehouse.name}.`,
  });

  return restoredWarehouse;
};
