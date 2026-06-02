import { invoke } from '@tauri-apps/api/core';
import type { ProductUnit, ProductUnitMapping, StockMutationSourceType, UserRole, WholesalePrice } from '@/types';

export interface RemoteAuthUserDto {
  id: string;
  name: string;
  role: UserRole;
  pin_hash: string;
  pin_salt: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemoteActivityLogDto {
  id: string;
  user_id?: string | null;
  user_name?: string | null;
  role?: UserRole | null;
  action: string;
  entity: string;
  entity_id?: string | null;
  description: string;
  created_at: string;
}

export interface RemoteDepartmentDto {
  id: string;
  code?: string | null;
  name: string;
  description?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemoteProjectDto {
  id: string;
  code?: string | null;
  name: string;
  status: string;
  contact_id?: string | null;
  contact_name?: string | null;
  department_id?: string | null;
  department_code?: string | null;
  department_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  budget_amount?: number | null;
  description?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemoteTaxDto {
  id: string;
  code?: string | null;
  name: string;
  rate: number;
  rate_type: string;
  calculation_mode: string;
  description?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemoteContactDto {
  id: string;
  name: string;
  contact_type: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  company_name?: string | null;
  tax_number?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemoteWarehouseDto {
  id: string;
  code?: string | null;
  name: string;
  address?: string | null;
  phone?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemoteProductDto {
  id: string;
  name: string;
  category?: string | null;
  purchase_unit: ProductUnit;
  selling_unit: ProductUnit;
  purchase_price: number;
  selling_price: number;
  stock: number;
  sku?: string | null;
  wholesale_prices?: WholesalePrice[] | null;
  sellable_units?: ProductUnit[] | null;
  unit_mappings?: ProductUnitMapping[] | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface RemoteStockMutationDto {
  id: string;
  product_id: string;
  product_name: string;
  sku?: string | null;
  warehouse_id?: string | null;
  warehouse_code?: string | null;
  warehouse_name?: string | null;
  source_type: StockMutationSourceType;
  source_id: string;
  source_number?: string | null;
  source_line_id: string;
  quantity_delta: number;
  unit: ProductUnit;
  stock_unit: ProductUnit;
  source_quantity?: number | null;
  source_unit?: ProductUnit | null;
  reason?: string | null;
  actor_user_id?: string | null;
  actor_user_name?: string | null;
  occurred_at: string;
  created_at: string;
}

export const isTauriRuntime = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const postgresAdapter = {
  async healthCheck() {
    if (!isTauriRuntime()) return false;
    return invoke<boolean>('postgres_health_check');
  },
};

export const authUserPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteAuthUserDto[]>('postgres_list_auth_users');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteAuthUserDto | null>('postgres_get_auth_user', { id });
  },

  async upsert(input: RemoteAuthUserDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteAuthUserDto>('postgres_upsert_auth_user', { input });
  },
};

export const activityLogPostgresAdapter = {
  async list(limit = 200) {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteActivityLogDto[]>('postgres_list_activity_logs', { limit });
  },

  async upsert(input: RemoteActivityLogDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteActivityLogDto>('postgres_upsert_activity_log', { input });
  },
};

export const departmentPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteDepartmentDto[]>('postgres_list_departments');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteDepartmentDto | null>('postgres_get_department', { id });
  },

  async upsert(input: RemoteDepartmentDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteDepartmentDto>('postgres_upsert_department', { input });
  },

  async delete(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteDepartmentDto | null>('postgres_delete_department', { id });
  },
};

export const projectPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteProjectDto[]>('postgres_list_projects');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteProjectDto | null>('postgres_get_project', { id });
  },

  async upsert(input: RemoteProjectDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteProjectDto>('postgres_upsert_project', { input });
  },

  async delete(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteProjectDto | null>('postgres_delete_project', { id });
  },
};

export const taxPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteTaxDto[]>('postgres_list_taxes');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteTaxDto | null>('postgres_get_tax', { id });
  },

  async upsert(input: RemoteTaxDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteTaxDto>('postgres_upsert_tax', { input });
  },

  async delete(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteTaxDto | null>('postgres_delete_tax', { id });
  },
};

export const contactPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteContactDto[]>('postgres_list_contacts');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteContactDto | null>('postgres_get_contact', { id });
  },

  async upsert(input: RemoteContactDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteContactDto>('postgres_upsert_contact', { input });
  },

  async delete(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteContactDto | null>('postgres_delete_contact', { id });
  },
};

export const warehousePostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteWarehouseDto[]>('postgres_list_warehouses');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteWarehouseDto | null>('postgres_get_warehouse', { id });
  },

  async upsert(input: RemoteWarehouseDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteWarehouseDto>('postgres_upsert_warehouse', { input });
  },

  async delete(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteWarehouseDto | null>('postgres_delete_warehouse', { id });
  },
};

export const productPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteProductDto[]>('postgres_list_products');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteProductDto | null>('postgres_get_product', { id });
  },

  async upsert(input: RemoteProductDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteProductDto>('postgres_upsert_product', { input });
  },

  async delete(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteProductDto | null>('postgres_delete_product', { id });
  },
};

export const stockMutationPostgresAdapter = {
  async list() {
    if (!isTauriRuntime()) return [];
    return invoke<RemoteStockMutationDto[]>('postgres_list_stock_mutations');
  },

  async get(id: string) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteStockMutationDto | null>('postgres_get_stock_mutation', { id });
  },

  async upsert(input: RemoteStockMutationDto) {
    if (!isTauriRuntime()) return null;
    return invoke<RemoteStockMutationDto>('postgres_upsert_stock_mutation', { input });
  },
};
