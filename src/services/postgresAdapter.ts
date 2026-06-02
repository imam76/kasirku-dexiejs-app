import { invoke } from '@tauri-apps/api/core';

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

export const isTauriRuntime = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const postgresAdapter = {
  async healthCheck() {
    if (!isTauriRuntime()) return false;
    return invoke<boolean>('postgres_health_check');
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
