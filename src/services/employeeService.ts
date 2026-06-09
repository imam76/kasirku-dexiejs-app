import {
  createPinHash,
  getCurrentSessionUser,
  requireRolePermission,
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
  login_role_id?: string;
  login_pin?: string;
  confirm_login_pin?: string;
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
  
  if (sanitizedInput.login_pin && !sanitizedInput.login_role_id) {
    throw new Error('Role login wajib dipilih jika PIN diisi.');
  }

  const areas = await getSelectedAreas(sanitizedInput.area_ids);
  const now = new Date().toISOString();
  const employeeId = crypto.randomUUID();

  let pinHash: string | undefined;
  let pinSalt: string | undefined;

  if (sanitizedInput.login_pin) {
    const { hash, salt } = await createPinHash(sanitizedInput.login_pin);
    pinHash = hash;
    pinSalt = salt;
  }

  const employee: Employee = {
    id: employeeId,
    name: sanitizedInput.name,
    phone: sanitizedInput.phone,
    email: sanitizedInput.email,
    address: sanitizedInput.address,
    position: sanitizedInput.position,
    login_role_id: sanitizedInput.login_role_id,
    pin_hash: pinHash,
    pin_salt: pinSalt,
    notes: sanitizedInput.notes,
    is_active: sanitizedInput.is_active,
    created_at: now,
    updated_at: now,
  };
  const assignments = buildEmployeeAreaAssignments(employee, areas, now);

  await db.transaction('rw', [db.employees, db.employeeAreas, db.activityLogs], async () => {
    await db.employees.add(employee);
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
  
  if (sanitizedInput.login_pin && !sanitizedInput.login_role_id) {
    throw new Error('Role login wajib dipilih jika PIN diisi.');
  }

  const areas = await getSelectedAreas(sanitizedInput.area_ids);

  let pinHash = existingEmployee.pin_hash;
  let pinSalt = existingEmployee.pin_salt;
  let loginRoleId = existingEmployee.login_role_id;

  if (sanitizedInput.login_pin) {
    const { hash, salt } = await createPinHash(sanitizedInput.login_pin);
    pinHash = hash;
    pinSalt = salt;
    loginRoleId = sanitizedInput.login_role_id;
  } else if (sanitizedInput.login_role_id) {
    loginRoleId = sanitizedInput.login_role_id;
  }

  const updatedAt = new Date().toISOString();
  const updatedEmployee: Employee = {
    ...existingEmployee,
    name: sanitizedInput.name,
    phone: sanitizedInput.phone,
    email: sanitizedInput.email,
    address: sanitizedInput.address,
    position: sanitizedInput.position,
    login_role_id: loginRoleId,
    pin_hash: pinHash,
    pin_salt: pinSalt,
    notes: sanitizedInput.notes,
    is_active: sanitizedInput.is_active,
    updated_at: updatedAt,
  };
  const assignments = buildEmployeeAreaAssignments(updatedEmployee, areas, updatedAt);

  await db.transaction('rw', [db.employees, db.employeeAreas, db.activityLogs], async () => {
    await db.employees.put(updatedEmployee);
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
