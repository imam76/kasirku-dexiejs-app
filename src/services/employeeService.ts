import {
  createAuthUser,
  getCurrentSessionUser,
  requireRolePermission,
  resetAuthUserPin,
  updateAuthUser,
  writeActivityLog,
} from '@/auth/authService';
import { db } from '@/lib/db';
import { employeeSchema } from '@/lib/validations/employee';
import type { CooperativeArea, Employee, EmployeeArea } from '@/types';

export interface EmployeeUpsertInput {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  position?: string;
  user_id?: string;
  create_login?: boolean;
  login_role_id?: string;
  login_pin?: string;
  reset_login_pin?: boolean;
  notes?: string;
  area_ids?: string[];
  is_active?: boolean;
}

type SanitizedEmployeeInput =
  Required<Pick<EmployeeUpsertInput, 'name' | 'area_ids' | 'is_active'>> &
  Omit<EmployeeUpsertInput, 'name' | 'area_ids' | 'is_active'>;

const sanitizeEmployeeInput = (input: EmployeeUpsertInput): SanitizedEmployeeInput => {
  const parsed = employeeSchema.parse(input);

  return {
    ...parsed,
    name: parsed.name.trim(),
    area_ids: Array.from(new Set(parsed.area_ids ?? [])),
    is_active: parsed.is_active ?? true,
  };
};

const requireEmployeeActor = async () => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'SETTINGS_ACCESS');
  return currentUser;
};

const assertUserAvailable = async (userId: string | undefined, excludeEmployeeId?: string) => {
  if (!userId) return;

  const user = await db.authUsers.get(userId);
  if (!user || !user.is_active) {
    throw new Error('User login tidak ditemukan atau sudah nonaktif.');
  }

  const existingEmployee = await db.employees
    .where('user_id')
    .equals(userId)
    .and((employee) => employee.id !== excludeEmployeeId && employee.is_active)
    .first();

  if (existingEmployee) {
    throw new Error('User login sudah terhubung ke karyawan aktif lain.');
  }
};

const getSelectedAreas = async (areaIds: string[]): Promise<CooperativeArea[]> => {
  if (areaIds.length === 0) return [];

  const areas = await db.cooperativeAreas.bulkGet(areaIds);
  const missingArea = areas.findIndex((area) => !area);
  if (missingArea >= 0) {
    throw new Error('Salah satu area tidak ditemukan.');
  }

  const selectedAreas = areas as CooperativeArea[];
  const inactiveArea = selectedAreas.find((area) => !area.is_active);
  if (inactiveArea) {
    throw new Error(`Area ${inactiveArea.name} sudah nonaktif.`);
  }

  return selectedAreas;
};

const buildEmployeeAreaAssignments = (
  employee: Employee,
  areas: CooperativeArea[],
  now: string,
): EmployeeArea[] => areas.map((area) => ({
  id: `${employee.id}:${area.id}`,
  employee_id: employee.id,
  area_id: area.id,
  area_name: area.name,
  area_code: area.code,
  created_at: now,
  updated_at: now,
}));

export const createEmployee = async (input: EmployeeUpsertInput): Promise<Employee> => {
  const currentUser = await requireEmployeeActor();
  const sanitizedInput = sanitizeEmployeeInput(input);
  if (sanitizedInput.create_login && sanitizedInput.user_id) {
    throw new Error('Pilih salah satu: tautkan user lama atau buat akses login baru.');
  }
  if (sanitizedInput.create_login && (!sanitizedInput.login_role_id || !sanitizedInput.login_pin)) {
    throw new Error('Role dan PIN login wajib diisi.');
  }
  if (sanitizedInput.reset_login_pin) {
    throw new Error('Reset PIN hanya tersedia saat mengubah karyawan yang sudah punya user login.');
  }
  await assertUserAvailable(sanitizedInput.user_id);
  const areas = await getSelectedAreas(sanitizedInput.area_ids);

  const now = new Date().toISOString();
  const employeeId = crypto.randomUUID();
  const createdUser = sanitizedInput.create_login
    ? await createAuthUser({
      name: sanitizedInput.name,
      role_id: sanitizedInput.login_role_id,
      pin: sanitizedInput.login_pin ?? '',
      employee_id: employeeId,
    })
    : undefined;
  const userId = createdUser?.id ?? sanitizedInput.user_id;
  const linkedUser = userId ? await db.authUsers.get(userId) : undefined;
  const employee: Employee = {
    id: employeeId,
    name: sanitizedInput.name,
    phone: sanitizedInput.phone,
    email: sanitizedInput.email,
    address: sanitizedInput.address,
    position: sanitizedInput.position,
    user_id: userId,
    user_name: linkedUser?.name,
    notes: sanitizedInput.notes,
    is_active: sanitizedInput.is_active,
    created_at: now,
    updated_at: now,
  };
  const assignments = buildEmployeeAreaAssignments(employee, areas, now);

  await db.transaction('rw', [db.employees, db.employeeAreas, db.authUsers, db.activityLogs], async () => {
    await db.employees.add(employee);
    if (userId && linkedUser?.employee_id !== employee.id) {
      await db.authUsers.update(userId, {
        employee_id: employee.id,
        updated_at: now,
        sync_status: 'pending',
        sync_error: undefined,
      });
    }
    if (assignments.length > 0) {
      await db.employeeAreas.bulkAdd(assignments);
    }
    await writeActivityLog({
      user: currentUser,
      action: 'EMPLOYEE_CREATED',
      entity: 'employees',
      entity_id: employee.id,
      description: `${currentUser?.name ?? 'User'} membuat karyawan ${employee.name}.`,
    });
  });

  return employee;
};

export const updateEmployee = async (id: string, input: EmployeeUpsertInput): Promise<Employee> => {
  const currentUser = await requireEmployeeActor();
  const existingEmployee = await db.employees.get(id);
  if (!existingEmployee) {
    throw new Error('Karyawan tidak ditemukan.');
  }

  const sanitizedInput = sanitizeEmployeeInput(input);
  if (sanitizedInput.create_login && sanitizedInput.user_id) {
    throw new Error('Pilih salah satu: tautkan user lama atau buat akses login baru.');
  }
  if (sanitizedInput.create_login && existingEmployee.user_id) {
    throw new Error('Karyawan sudah punya user login tertaut.');
  }
  if (sanitizedInput.create_login && (!sanitizedInput.login_role_id || !sanitizedInput.login_pin)) {
    throw new Error('Role dan PIN login wajib diisi.');
  }
  if (sanitizedInput.reset_login_pin && !sanitizedInput.login_pin) {
    throw new Error('PIN login baru wajib diisi.');
  }
  await assertUserAvailable(sanitizedInput.user_id, id);
  const areas = await getSelectedAreas(sanitizedInput.area_ids);
  const createdUser = sanitizedInput.create_login
    ? await createAuthUser({
      name: sanitizedInput.name,
      role_id: sanitizedInput.login_role_id,
      pin: sanitizedInput.login_pin ?? '',
      employee_id: id,
    })
    : undefined;
  const userId = createdUser?.id ?? sanitizedInput.user_id;
  const linkedUser = userId ? await db.authUsers.get(userId) : undefined;
  if (userId && !linkedUser) {
    throw new Error('User login tidak ditemukan.');
  }
  if (userId && sanitizedInput.login_role_id) {
    await updateAuthUser({
      userId,
      name: sanitizedInput.name,
      role_id: sanitizedInput.login_role_id,
      employee_id: id,
    });
  }
  if (userId && sanitizedInput.reset_login_pin && sanitizedInput.login_pin) {
    await resetAuthUserPin({
      userId,
      pin: sanitizedInput.login_pin,
    });
  }

  const updatedAt = new Date().toISOString();
  const nextLinkedUser = userId ? await db.authUsers.get(userId) : undefined;
  const updatedEmployee: Employee = {
    ...existingEmployee,
    name: sanitizedInput.name,
    phone: sanitizedInput.phone,
    email: sanitizedInput.email,
    address: sanitizedInput.address,
    position: sanitizedInput.position,
    user_id: userId,
    user_name: nextLinkedUser?.name ?? linkedUser?.name,
    notes: sanitizedInput.notes,
    is_active: sanitizedInput.is_active,
    updated_at: updatedAt,
  };
  const assignments = buildEmployeeAreaAssignments(updatedEmployee, areas, updatedAt);

  await db.transaction('rw', [db.employees, db.employeeAreas, db.authUsers, db.activityLogs], async () => {
    await db.employees.put(updatedEmployee);
    if (existingEmployee.user_id && existingEmployee.user_id !== userId) {
      await db.authUsers.update(existingEmployee.user_id, {
        employee_id: undefined,
        updated_at: updatedAt,
        sync_status: 'pending',
        sync_error: undefined,
      });
    }
    if (userId && linkedUser?.employee_id !== id) {
      await db.authUsers.update(userId, {
        employee_id: id,
        updated_at: updatedAt,
        sync_status: 'pending',
        sync_error: undefined,
      });
    }
    await db.employeeAreas.where('employee_id').equals(id).delete();
    if (assignments.length > 0) {
      await db.employeeAreas.bulkAdd(assignments);
    }
    await writeActivityLog({
      user: currentUser,
      action: 'EMPLOYEE_UPDATED',
      entity: 'employees',
      entity_id: id,
      description: `${currentUser?.name ?? 'User'} memperbarui karyawan ${updatedEmployee.name}.`,
    });
  });

  return updatedEmployee;
};

export const archiveEmployee = async (id: string): Promise<Employee> => {
  const currentUser = await requireEmployeeActor();
  const employee = await db.employees.get(id);
  if (!employee) {
    throw new Error('Karyawan tidak ditemukan.');
  }

  const archivedEmployee: Employee = {
    ...employee,
    is_active: false,
    updated_at: new Date().toISOString(),
  };

  await db.employees.put(archivedEmployee);
  await writeActivityLog({
    user: currentUser,
    action: 'EMPLOYEE_ARCHIVED',
    entity: 'employees',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} mengarsipkan karyawan ${employee.name}.`,
  });

  return archivedEmployee;
};

export const restoreEmployee = async (id: string): Promise<Employee> => {
  const currentUser = await requireEmployeeActor();
  const employee = await db.employees.get(id);
  if (!employee) {
    throw new Error('Karyawan tidak ditemukan.');
  }

  await assertUserAvailable(employee.user_id, id);

  const restoredEmployee: Employee = {
    ...employee,
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  await db.employees.put(restoredEmployee);
  await writeActivityLog({
    user: currentUser,
    action: 'EMPLOYEE_RESTORED',
    entity: 'employees',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} memulihkan karyawan ${employee.name}.`,
  });

  return restoredEmployee;
};
