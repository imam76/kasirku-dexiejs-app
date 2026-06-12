import {
  createPinHash,
  getCurrentSessionUser,
  normalizeAuthEmail,
  requireRolePermission,
  writeActivityLog,
} from '@/auth/authService';
import { db } from '@/lib/db';
import { employeeSchema } from '@/lib/validations/employee';
import { getAccountNormalBalance } from '@/utils/chartOfAccounts/getAccountNormalBalance';
import type { ChartOfAccount, CooperativeArea, Employee, EmployeeArea } from '@/types';

export interface EmployeeUpsertInput {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  position?: string;
  login_role_id?: string;
  field_cash_account_id?: string;
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
    email: normalizeAuthEmail(parsed.email),
    area_ids: Array.from(new Set(parsed.area_ids ?? [])),
    is_active: parsed.is_active ?? true,
  };
};

const requireEmployeeActor = async () => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'SETTINGS_ACCESS');
  return currentUser;
};

const assertFieldCashAccount = (account: ChartOfAccount | undefined) => {
  if (!account) {
    throw new Error('Akun kas petugas tidak ditemukan.');
  }

  if (account.type !== 'ASSET' || !account.is_active || !account.is_postable) {
    throw new Error('Akun kas petugas harus bertipe aset, aktif, dan postable.');
  }

  return account;
};

const getFieldCashAccountSnapshot = async (accountId?: string) => {
  if (!accountId) return {};

  const account = assertFieldCashAccount(await db.chartOfAccounts.get(accountId));
  return {
    field_cash_account_id: account.id,
    field_cash_account_code: account.code,
    field_cash_account_name: account.name,
  };
};

const assertFieldCashAccountAvailable = async (
  accountId: string | undefined,
  excludeEmployeeId: string | undefined,
  isActive: boolean,
) => {
  if (!accountId || !isActive) return;

  const existingEmployee = await db.employees
    .where('field_cash_account_id')
    .equals(accountId)
    .and((employee) => employee.is_active && employee.id !== excludeEmployeeId)
    .first();

  if (existingEmployee) {
    throw new Error(`Akun kas petugas sudah dipakai oleh karyawan aktif ${existingEmployee.name}.`);
  }
};

const normalizeAccountCodeCandidate = (value: string) => value.trim().toUpperCase();

const createNextFieldCashAccountCode = async () => {
  const accounts = await db.chartOfAccounts.toArray();
  const usedCodes = new Set(accounts.filter((account) => account.is_active).map((account) => account.code));
  const fieldCashNumbers = accounts
    .map((account) => {
      const match = account.code.match(/^1011\.(\d{3})$/);
      return match ? Number(match[1]) : 0;
    })
    .filter((value) => value > 0);
  let nextNumber = Math.max(0, ...fieldCashNumbers) + 1;
  let nextCode = `1011.${String(nextNumber).padStart(3, '0')}`;

  while (usedCodes.has(nextCode)) {
    nextNumber += 1;
    nextCode = `1011.${String(nextNumber).padStart(3, '0')}`;
  }

  return nextCode;
};

const getFieldCashParentAccount = async () => {
  const parent = await db.chartOfAccounts.get('cash-and-bank')
    ?? await db.chartOfAccounts.where('code').equals('1000').first();

  if (!parent || parent.type !== 'ASSET' || !parent.is_active) {
    throw new Error('Parent akun Kas dan Bank tidak ditemukan atau tidak aktif.');
  }

  return parent;
};

export const createFieldCashAccountForEmployee = async (input: {
  employee_name: string;
  account_code?: string;
}): Promise<ChartOfAccount> => {
  const currentUser = await requireEmployeeActor();
  const employeeName = input.employee_name.trim();
  if (!employeeName) {
    throw new Error('Nama karyawan wajib diisi sebelum membuat akun kas petugas.');
  }

  const code = input.account_code
    ? normalizeAccountCodeCandidate(input.account_code)
    : await createNextFieldCashAccountCode();
  const existingAccount = await db.chartOfAccounts
    .where('code')
    .equals(code)
    .and((account) => account.is_active)
    .first();
  if (existingAccount) {
    throw new Error('Kode akun kas petugas sudah dipakai akun aktif lain.');
  }

  const parent = await getFieldCashParentAccount();
  const now = new Date().toISOString();
  const account: ChartOfAccount = {
    id: crypto.randomUUID(),
    code,
    name: `Kas Petugas - ${employeeName}`,
    type: 'ASSET',
    normal_balance: getAccountNormalBalance('ASSET'),
    parent_id: parent.id,
    parent_code: parent.code,
    parent_name: parent.name,
    is_postable: true,
    is_system: false,
    is_active: true,
    description: `Akun kas petugas lapangan ${employeeName}.`,
    created_at: now,
    updated_at: now,
  };

  await db.transaction('rw', [db.chartOfAccounts, db.activityLogs], async () => {
    await db.chartOfAccounts.add(account);
    await writeActivityLog({
      user: currentUser,
      action: 'FIELD_CASH_ACCOUNT_CREATED',
      entity: 'chartOfAccounts',
      entity_id: account.id,
      description: `${currentUser?.name ?? 'User'} membuat akun kas petugas ${account.code} ${account.name}.`,
    });
  });

  return account;
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
  await assertFieldCashAccountAvailable(
    sanitizedInput.field_cash_account_id,
    undefined,
    sanitizedInput.is_active,
  );
  const fieldCashAccountSnapshot = await getFieldCashAccountSnapshot(sanitizedInput.field_cash_account_id);
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
    ...fieldCashAccountSnapshot,
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
  await assertFieldCashAccountAvailable(
    sanitizedInput.field_cash_account_id,
    id,
    sanitizedInput.is_active,
  );
  const fieldCashAccountSnapshot = await getFieldCashAccountSnapshot(sanitizedInput.field_cash_account_id);

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
    field_cash_account_id: fieldCashAccountSnapshot.field_cash_account_id,
    field_cash_account_code: fieldCashAccountSnapshot.field_cash_account_code,
    field_cash_account_name: fieldCashAccountSnapshot.field_cash_account_name,
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


  await assertFieldCashAccountAvailable(employee.field_cash_account_id, id, true);

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
