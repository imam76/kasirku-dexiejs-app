import {
  createPinHash,
  getCurrentSessionUser,
  normalizeAuthEmail,
  requireUserPermission,
  writeActivityLog,
} from '@/auth/authService';
import { db } from '@/lib/db';
import { employeeSchema } from '@/lib/validations/employee';
import { getAccountNormalBalance } from '@/utils/chartOfAccounts/getAccountNormalBalance';
import {
  employeePostgresAdapter,
  employeeAreaPostgresAdapter,
  employeeCollectionSchedulePostgresAdapter,
  type RemoteEmployeeDto,
  type RemoteEmployeeAreaDto,
  type RemoteEmployeeCollectionScheduleDto,
} from '@/services/postgresAdapter';
import type {
  ChartOfAccount,
  CooperativeArea,
  CooperativeCollectionWeekday,
  Employee,
  EmployeeArea,
  EmployeeCollectionSchedule,
} from '@/types';

export interface EmployeeCollectionScheduleInput {
  id?: string;
  area_id: string;
  weekday: CooperativeCollectionWeekday;
  effective_from?: string;
  effective_until?: string;
  is_active?: boolean;
}

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
  collection_schedules?: EmployeeCollectionScheduleInput[];
  is_active?: boolean;
}

type SanitizedEmployeeInput =
  Required<Pick<EmployeeUpsertInput, 'name' | 'area_ids' | 'collection_schedules' | 'is_active'>> &
  Omit<EmployeeUpsertInput, 'name' | 'area_ids' | 'collection_schedules' | 'is_active'>;

const sanitizeEmployeeInput = (input: EmployeeUpsertInput): SanitizedEmployeeInput => {
  const parsed = employeeSchema.parse(input);

  return {
    ...parsed,
    name: parsed.name.trim(),
    email: normalizeAuthEmail(parsed.email),
    area_ids: Array.from(new Set(parsed.area_ids ?? [])),
    collection_schedules: parsed.collection_schedules ?? [],
    is_active: parsed.is_active ?? true,
  };
};

const requireEmployeeActor = async () => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'EMPLOYEE_MANAGE');
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

const assertCollectionSchedulesValid = (
  schedules: EmployeeCollectionScheduleInput[],
  areaIds: string[],
) => {
  const allowedAreaIds = new Set(areaIds);

  schedules.forEach((schedule) => {
    if (!allowedAreaIds.has(schedule.area_id)) {
      throw new Error('Area jadwal penagihan harus termasuk wilayah karyawan.');
    }
    if (
      schedule.effective_from &&
      schedule.effective_until &&
      schedule.effective_from.slice(0, 10) > schedule.effective_until.slice(0, 10)
    ) {
      throw new Error('Tanggal mulai jadwal tidak boleh setelah tanggal selesai.');
    }
  });

  const activeSchedules = schedules.filter((schedule) => schedule.is_active !== false);
  activeSchedules.forEach((schedule, index) => {
    const start = schedule.effective_from?.slice(0, 10) ?? '0000-01-01';
    const end = schedule.effective_until?.slice(0, 10) ?? '9999-12-31';
    const hasOverlap = activeSchedules.some((candidate, candidateIndex) => {
      if (candidateIndex === index) return false;
      if (candidate.area_id !== schedule.area_id || candidate.weekday !== schedule.weekday) return false;
      const candidateStart = candidate.effective_from?.slice(0, 10) ?? '0000-01-01';
      const candidateEnd = candidate.effective_until?.slice(0, 10) ?? '9999-12-31';
      return start <= candidateEnd && candidateStart <= end;
    });

    if (hasOverlap) {
      throw new Error('Jadwal aktif pada area dan hari yang sama tidak boleh memiliki periode tumpang tindih.');
    }
  });
};

const buildEmployeeCollectionSchedules = (
  employee: Employee,
  areas: CooperativeArea[],
  inputs: EmployeeCollectionScheduleInput[],
  now: string,
): EmployeeCollectionSchedule[] => {
  const areaById = new Map(areas.map((area) => [area.id, area]));

  return inputs.map((input) => {
    const area = areaById.get(input.area_id);
    if (!area) throw new Error('Area jadwal penagihan tidak ditemukan.');

    return {
      id: input.id ?? crypto.randomUUID(),
      employee_id: employee.id,
      employee_name: employee.name,
      employee_position: employee.position,
      area_id: area.id,
      area_name: area.name,
      area_code: area.code,
      weekday: input.weekday,
      effective_from: input.effective_from,
      effective_until: input.effective_until,
      is_active: input.is_active ?? true,
      created_at: now,
      updated_at: now,
    };
  });
};

export const createEmployee = async (input: EmployeeUpsertInput): Promise<Employee> => {
  const currentUser = await requireEmployeeActor();
  const sanitizedInput = sanitizeEmployeeInput(input);
  
  if (sanitizedInput.login_pin && !sanitizedInput.login_role_id) {
    throw new Error('Role login wajib dipilih jika PIN diisi.');
  }

  const areas = await getSelectedAreas(sanitizedInput.area_ids);
  assertCollectionSchedulesValid(sanitizedInput.collection_schedules, sanitizedInput.area_ids);
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
  const collectionSchedules = buildEmployeeCollectionSchedules(
    employee,
    areas,
    sanitizedInput.collection_schedules,
    now,
  );

  await db.transaction('rw', [
    db.employees,
    db.employeeAreas,
    db.employeeCollectionSchedules,
    db.activityLogs,
  ], async () => {
    await db.employees.add(employee);
    if (assignments.length > 0) {
      await db.employeeAreas.bulkAdd(assignments);
    }
    if (collectionSchedules.length > 0) {
      await db.employeeCollectionSchedules.bulkAdd(collectionSchedules);
    }
    await writeActivityLog({
      user: currentUser,
      action: 'EMPLOYEE_CREATED',
      entity: 'employees',
      entity_id: employee.id,
      description: `${currentUser?.name ?? 'User'} membuat karyawan ${employee.name}.`,
    });
  });

  // Sync to PostgreSQL
  try {
    const remoteEmployee: RemoteEmployeeDto = {
      ...employee,
      phone: employee.phone ?? null,
      email: employee.email ?? null,
      address: employee.address ?? null,
      position: employee.position ?? null,
      user_id: employee.user_id ?? null,
      user_name: employee.user_name ?? null,
      login_role_id: employee.login_role_id ?? null,
      field_cash_account_id: employee.field_cash_account_id ?? null,
      field_cash_account_code: employee.field_cash_account_code ?? null,
      field_cash_account_name: employee.field_cash_account_name ?? null,
      pin_hash: employee.pin_hash ?? null,
      pin_salt: employee.pin_salt ?? null,
      notes: employee.notes ?? null,
    };

    await employeePostgresAdapter.upsert(remoteEmployee);

    // Sync employee areas
    for (const assignment of assignments) {
      const remoteArea: RemoteEmployeeAreaDto = {
        ...assignment,
        area_code: assignment.area_code ?? null,
      };
      await employeeAreaPostgresAdapter.upsert(remoteArea);
    }

    // Sync collection schedules
    for (const schedule of collectionSchedules) {
      const remoteSchedule: RemoteEmployeeCollectionScheduleDto = {
        ...schedule,
        employee_position: schedule.employee_position ?? null,
        area_code: schedule.area_code ?? null,
        effective_from: schedule.effective_from ?? null,
        effective_until: schedule.effective_until ?? null,
      };
      await employeeCollectionSchedulePostgresAdapter.upsert(remoteSchedule);
    }
  } catch (error) {
    console.error('Failed to sync employee to PostgreSQL:', error);
    // Continue even if sync fails, as data is already saved locally
  }

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
  assertCollectionSchedulesValid(sanitizedInput.collection_schedules, sanitizedInput.area_ids);
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
  const existingSchedules = await db.employeeCollectionSchedules
    .where('employee_id')
    .equals(id)
    .toArray();
  const existingScheduleById = new Map(existingSchedules.map((schedule) => [schedule.id, schedule]));
  const collectionSchedules = buildEmployeeCollectionSchedules(
    updatedEmployee,
    areas,
    sanitizedInput.collection_schedules,
    updatedAt,
  ).map((schedule) => ({
    ...schedule,
    created_at: existingScheduleById.get(schedule.id)?.created_at ?? schedule.created_at,
  }));

  await db.transaction('rw', [
    db.employees,
    db.employeeAreas,
    db.employeeCollectionSchedules,
    db.activityLogs,
  ], async () => {
    await db.employees.put(updatedEmployee);
    await db.employeeAreas.where('employee_id').equals(id).delete();
    if (assignments.length > 0) {
      await db.employeeAreas.bulkAdd(assignments);
    }
    await db.employeeCollectionSchedules.where('employee_id').equals(id).delete();
    if (collectionSchedules.length > 0) {
      await db.employeeCollectionSchedules.bulkAdd(collectionSchedules);
    }
    await writeActivityLog({
      user: currentUser,
      action: 'EMPLOYEE_UPDATED',
      entity: 'employees',
      entity_id: id,
      description: `${currentUser?.name ?? 'User'} memperbarui karyawan ${updatedEmployee.name}.`,
    });
  });

  // Sync to PostgreSQL
  try {
    const remoteEmployee: RemoteEmployeeDto = {
      ...updatedEmployee,
      phone: updatedEmployee.phone ?? null,
      email: updatedEmployee.email ?? null,
      address: updatedEmployee.address ?? null,
      position: updatedEmployee.position ?? null,
      user_id: updatedEmployee.user_id ?? null,
      user_name: updatedEmployee.user_name ?? null,
      login_role_id: updatedEmployee.login_role_id ?? null,
      field_cash_account_id: updatedEmployee.field_cash_account_id ?? null,
      field_cash_account_code: updatedEmployee.field_cash_account_code ?? null,
      field_cash_account_name: updatedEmployee.field_cash_account_name ?? null,
      pin_hash: updatedEmployee.pin_hash ?? null,
      pin_salt: updatedEmployee.pin_salt ?? null,
      notes: updatedEmployee.notes ?? null,
    };

    await employeePostgresAdapter.upsert(remoteEmployee);

    // Sync employee areas
    for (const assignment of assignments) {
      const remoteArea: RemoteEmployeeAreaDto = {
        ...assignment,
        area_code: assignment.area_code ?? null,
      };
      await employeeAreaPostgresAdapter.upsert(remoteArea);
    }

    // Sync collection schedules
    for (const schedule of collectionSchedules) {
      const remoteSchedule: RemoteEmployeeCollectionScheduleDto = {
        ...schedule,
        employee_position: schedule.employee_position ?? null,
        area_code: schedule.area_code ?? null,
        effective_from: schedule.effective_from ?? null,
        effective_until: schedule.effective_until ?? null,
      };
      await employeeCollectionSchedulePostgresAdapter.upsert(remoteSchedule);
    }
  } catch (error) {
    console.error('Failed to sync employee to PostgreSQL:', error);
    // Continue even if sync fails, as data is already saved locally
  }

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

  // Sync to PostgreSQL
  try {
    const remoteEmployee: RemoteEmployeeDto = {
      ...archivedEmployee,
      phone: archivedEmployee.phone ?? null,
      email: archivedEmployee.email ?? null,
      address: archivedEmployee.address ?? null,
      position: archivedEmployee.position ?? null,
      user_id: archivedEmployee.user_id ?? null,
      user_name: archivedEmployee.user_name ?? null,
      login_role_id: archivedEmployee.login_role_id ?? null,
      field_cash_account_id: archivedEmployee.field_cash_account_id ?? null,
      field_cash_account_code: archivedEmployee.field_cash_account_code ?? null,
      field_cash_account_name: archivedEmployee.field_cash_account_name ?? null,
      pin_hash: archivedEmployee.pin_hash ?? null,
      pin_salt: archivedEmployee.pin_salt ?? null,
      notes: archivedEmployee.notes ?? null,
    };

    await employeePostgresAdapter.upsert(remoteEmployee);
  } catch (error) {
    console.error('Failed to sync archived employee to PostgreSQL:', error);
    // Continue even if sync fails, as data is already saved locally
  }

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

  // Sync to PostgreSQL
  try {
    const remoteEmployee: RemoteEmployeeDto = {
      ...restoredEmployee,
      phone: restoredEmployee.phone ?? null,
      email: restoredEmployee.email ?? null,
      address: restoredEmployee.address ?? null,
      position: restoredEmployee.position ?? null,
      user_id: restoredEmployee.user_id ?? null,
      user_name: restoredEmployee.user_name ?? null,
      login_role_id: restoredEmployee.login_role_id ?? null,
      field_cash_account_id: restoredEmployee.field_cash_account_id ?? null,
      field_cash_account_code: restoredEmployee.field_cash_account_code ?? null,
      field_cash_account_name: restoredEmployee.field_cash_account_name ?? null,
      pin_hash: restoredEmployee.pin_hash ?? null,
      pin_salt: restoredEmployee.pin_salt ?? null,
      notes: restoredEmployee.notes ?? null,
    };

    await employeePostgresAdapter.upsert(remoteEmployee);
  } catch (error) {
    console.error('Failed to sync restored employee to PostgreSQL:', error);
    // Continue even if sync fails, as data is already saved locally
  }

  return restoredEmployee;
};
