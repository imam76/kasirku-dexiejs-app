import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import { departmentSchema } from '@/lib/validations/department';
import type { Department } from '@/types';

export interface DepartmentUpsertInput {
  name: string;
  code?: string;
  description?: string;
  is_active?: boolean;
}

type SanitizedDepartmentInput = Required<Pick<DepartmentUpsertInput, 'name' | 'is_active'>> & Omit<DepartmentUpsertInput, 'name' | 'is_active'>;

const sanitizeDepartmentInput = (input: DepartmentUpsertInput): SanitizedDepartmentInput => {
  const parsed = departmentSchema.parse(input);

  return {
    ...parsed,
    code: parsed.code?.toUpperCase(),
    is_active: parsed.is_active ?? true,
  };
};

const assertDepartmentCodeAvailable = async (code: string | undefined, excludeDepartmentId?: string) => {
  if (!code) return;

  const existingDepartment = await db.departments
    .where('code')
    .equals(code)
    .and((department) => department.id !== excludeDepartmentId && department.is_active)
    .first();

  if (existingDepartment) {
    throw new Error('Kode department sudah dipakai department aktif lain.');
  }
};

export const createDepartment = async (input: DepartmentUpsertInput): Promise<Department> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'SETTINGS_ACCESS');

  const sanitizedInput = sanitizeDepartmentInput(input);
  await assertDepartmentCodeAvailable(sanitizedInput.code);

  const now = new Date().toISOString();
  const department: Department = {
    id: crypto.randomUUID(),
    ...sanitizedInput,
    created_at: now,
    updated_at: now,
  };

  await db.departments.add(department);
  await writeActivityLog({
    user: currentUser,
    action: 'DEPARTMENT_CREATED',
    entity: 'departments',
    entity_id: department.id,
    description: `${currentUser?.name ?? 'User'} membuat department ${department.name}.`,
  });

  return department;
};

export const updateDepartment = async (id: string, input: DepartmentUpsertInput): Promise<Department> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'SETTINGS_ACCESS');

  const existingDepartment = await db.departments.get(id);
  if (!existingDepartment) {
    throw new Error('Department tidak ditemukan.');
  }

  const sanitizedInput = sanitizeDepartmentInput(input);
  await assertDepartmentCodeAvailable(sanitizedInput.code, id);

  const updatedDepartment: Department = {
    ...existingDepartment,
    ...sanitizedInput,
    updated_at: new Date().toISOString(),
  };

  await db.departments.put(updatedDepartment);
  await writeActivityLog({
    user: currentUser,
    action: 'DEPARTMENT_UPDATED',
    entity: 'departments',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} memperbarui department ${updatedDepartment.name}.`,
  });

  return updatedDepartment;
};

export const archiveDepartment = async (id: string): Promise<Department> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'SETTINGS_ACCESS');

  const department = await db.departments.get(id);
  if (!department) {
    throw new Error('Department tidak ditemukan.');
  }

  const archivedDepartment: Department = {
    ...department,
    is_active: false,
    updated_at: new Date().toISOString(),
  };

  await db.departments.put(archivedDepartment);
  await writeActivityLog({
    user: currentUser,
    action: 'DEPARTMENT_ARCHIVED',
    entity: 'departments',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} mengarsipkan department ${department.name}.`,
  });

  return archivedDepartment;
};

export const restoreDepartment = async (id: string): Promise<Department> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'SETTINGS_ACCESS');

  const department = await db.departments.get(id);
  if (!department) {
    throw new Error('Department tidak ditemukan.');
  }

  await assertDepartmentCodeAvailable(department.code, id);

  const restoredDepartment: Department = {
    ...department,
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  await db.departments.put(restoredDepartment);
  await writeActivityLog({
    user: currentUser,
    action: 'DEPARTMENT_RESTORED',
    entity: 'departments',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} memulihkan department ${department.name}.`,
  });

  return restoredDepartment;
};
