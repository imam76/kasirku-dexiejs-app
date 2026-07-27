import {
  createAuthUser,
  resetAuthUserPin,
  setAuthUserActive,
  updateAuthUser,
} from '@/auth/authService';
import { db } from '@/lib/db';
import type { AuthUser, Role } from '@/types';

export interface EmployeeAccessSummary {
  employee_id: string;
  is_login_enabled: boolean;
  user?: AuthUser;
  role?: Role;
  is_legacy: boolean;
}

export interface CreateOrLinkEmployeeUserInput {
  employee_id: string;
  email: string;
  role_id: string;
  pin: string;
}

export const getEmployeeAccessSummary = async (
  employeeId: string,
): Promise<EmployeeAccessSummary> => {
  const employee = await db.employees.get(employeeId);
  if (!employee) throw new Error('Karyawan tidak ditemukan.');

  const user = await db.authUsers.where('employee_id').equals(employeeId).first();
  const role = user?.role_id ? await db.roles.get(user.role_id) : undefined;
  return {
    employee_id: employeeId,
    is_login_enabled: Boolean(user?.is_active),
    user,
    role,
    is_legacy: !user && Boolean(employee.pin_hash && employee.pin_salt),
  };
};

export const createOrLinkEmployeeUser = async (
  input: CreateOrLinkEmployeeUserInput,
): Promise<AuthUser> => {
  const employee = await db.employees.get(input.employee_id);
  if (!employee) throw new Error('Karyawan tidak ditemukan.');

  const linkedUser = await db.authUsers.where('employee_id').equals(employee.id).first();
  if (linkedUser) {
    throw new Error('Karyawan sudah terhubung dengan user aplikasi.');
  }

  return createAuthUser({
    name: employee.name,
    email: input.email,
    role_id: input.role_id,
    employee_id: employee.id,
    pin: input.pin,
  });
};

export const updateEmployeeAccess = async (input: {
  employee_id: string;
  email: string;
  role_id: string;
  pin?: string;
  is_active?: boolean;
}): Promise<AuthUser> => {
  const employee = await db.employees.get(input.employee_id);
  if (!employee) throw new Error('Karyawan tidak ditemukan.');
  const user = await db.authUsers.where('employee_id').equals(employee.id).first();
  if (!user) throw new Error('User aplikasi karyawan belum dibuat.');

  const updated = await updateAuthUser({
    userId: user.id,
    name: employee.name,
    email: input.email,
    role_id: input.role_id,
    employee_id: employee.id,
  });
  if (input.pin) {
    await resetAuthUserPin({ userId: user.id, pin: input.pin });
  }
  if (input.is_active !== undefined && input.is_active !== updated.is_active) {
    await setAuthUserActive(user.id, input.is_active);
  }
  return (await db.authUsers.get(user.id)) ?? updated;
};

export const disableEmployeeAccess = async (employeeId: string): Promise<void> => {
  const user = await db.authUsers.where('employee_id').equals(employeeId).first();
  if (!user || !user.is_active) return;
  await setAuthUserActive(user.id, false);
};
