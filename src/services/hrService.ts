import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import {
  employeeSalaryComponentSchema,
  employmentContractSchema,
  hrDepartmentSchema,
  hrEmployeeSchema,
  hrPositionSchema,
  salaryComponentSchema,
  type EmployeeSalaryComponentInput,
  type EmploymentContractInput,
  type HrDepartmentInput,
  type HrEmployeeInput,
  type HrPositionInput,
  type SalaryComponentInput,
} from '@/lib/validations/hr';
import {
  enqueueDepartmentSync,
  enqueueEmployeeSalaryComponentSync,
  enqueueEmployeeSync,
  enqueueEmploymentContractSync,
  enqueueHrPositionSync,
  enqueueSalaryComponentSync,
} from '@/services/syncQueueService';
import type {
  ActivityLogChange,
  Department,
  Employee,
  EmployeeSalaryComponent,
  EmploymentContract,
  HrPosition,
  Permission,
  SalaryComponent,
} from '@/types';

const withPendingSync = <T extends object>(record: T) => ({
  ...record,
  sync_status: 'pending' as const,
  sync_error: undefined,
});

const normalizeUniqueText = (value: string | undefined) => value?.trim().toLowerCase();

const requireHrActor = async (permission: Permission) => {
  const actor = await getCurrentSessionUser();
  await requireUserPermission(actor, permission);
  if (!actor) throw new Error('Sesi pengguna tidak ditemukan.');
  return actor;
};

const maskSensitive = (value: unknown) => {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value);
  if (text.length <= 4) return '••••';
  return `••••${text.slice(-4)}`;
};

const assertEmployeePayrollMutationAllowed = async (
  actor: Awaited<ReturnType<typeof requireHrActor>>,
  input: HrEmployeeInput,
  existing?: Employee,
) => {
  const payrollChanged = existing ? (
    input.salary_payment_method !== existing.salary_payment_method ||
    input.bank_name !== existing.bank_name ||
    input.bank_account_number !== existing.bank_account_number ||
    input.bank_account_holder !== existing.bank_account_holder ||
    (input.base_salary ?? 0) !== (existing.base_salary ?? 0) ||
    (input.salary_currency ?? 'IDR') !== (existing.salary_currency ?? 'IDR') ||
    (input.payroll_period ?? 'MONTHLY') !== (existing.payroll_period ?? 'MONTHLY') ||
    (input.is_taxable ?? true) !== (existing.is_taxable ?? true) ||
    input.ptkp_status !== existing.ptkp_status ||
    (input.is_bpjs_participant ?? false) !== (existing.is_bpjs_participant ?? false)
  ) : Boolean(
    input.salary_payment_method ||
    input.bank_name ||
    input.bank_account_number ||
    input.bank_account_holder ||
    (input.base_salary ?? 0) > 0 ||
    input.ptkp_status ||
    input.is_bpjs_participant,
  );
  if (payrollChanged) {
    await requireUserPermission(actor, 'hr.payroll.manage');
  }
};

const EMPLOYEE_AUDIT_FIELDS: Array<{
  key: keyof Employee;
  sensitive?: boolean;
}> = [
  { key: 'employment_status' },
  { key: 'active_status' },
  { key: 'department_name' },
  { key: 'job_position_name' },
  { key: 'supervisor_name' },
  { key: 'nik', sensitive: true },
  { key: 'tax_number', sensitive: true },
  { key: 'bank_account_number', sensitive: true },
  { key: 'base_salary', sensitive: true },
];

const buildEmployeeChanges = (
  before: Employee | undefined,
  after: Employee,
): ActivityLogChange[] => EMPLOYEE_AUDIT_FIELDS.flatMap(({ key, sensitive }) => {
  const previous = before?.[key];
  const next = after[key];
  if (previous === next) return [];
  return [{
    field: key,
    before: sensitive ? maskSensitive(previous) : (previous as string | number | boolean | null | undefined),
    after: sensitive ? maskSensitive(next) : (next as string | number | boolean | null | undefined),
    sensitive,
  }];
});

const nextEmployeeNumber = async () => {
  const rows = await db.employees.toArray();
  const highest = rows.reduce((current, employee) => {
    const match = employee.employee_number?.match(/^EMP-(\d+)$/i);
    return Math.max(current, match ? Number(match[1]) : 0);
  }, 0);
  return `EMP-${String(highest + 1).padStart(5, '0')}`;
};

const assertEmployeeUnique = async (
  employeeNumber: string,
  nik: string | undefined,
  excludeId?: string,
) => {
  const employees = await db.employees.toArray();
  const duplicateNumber = employees.find((employee) => (
    employee.id !== excludeId &&
    normalizeUniqueText(employee.employee_number) === normalizeUniqueText(employeeNumber)
  ));
  if (duplicateNumber) throw new Error('Nomor karyawan sudah digunakan.');

  if (nik) {
    const duplicateNik = employees.find((employee) => (
      employee.id !== excludeId &&
      normalizeUniqueText(employee.nik) === normalizeUniqueText(nik)
    ));
    if (duplicateNik) throw new Error('NIK sudah digunakan karyawan lain.');
  }
};

const getActiveDepartment = async (id: string | undefined) => {
  if (!id) return undefined;
  const department = await db.departments.get(id);
  if (!department?.is_active) throw new Error('Departemen tidak ditemukan atau sudah nonaktif.');
  return department;
};

const getActivePosition = async (id: string | undefined) => {
  if (!id) return undefined;
  const position = await db.hrPositions.get(id);
  if (!position?.is_active) throw new Error('Jabatan tidak ditemukan atau sudah nonaktif.');
  return position;
};

const getActiveSupervisor = async (id: string | undefined, employeeId?: string) => {
  if (!id) return undefined;
  if (id === employeeId) throw new Error('Karyawan tidak dapat menjadi atasan bagi dirinya sendiri.');
  const supervisor = await db.employees.get(id);
  if (!supervisor || !supervisor.is_active || supervisor.active_status !== 'ACTIVE') {
    throw new Error('Atasan harus merupakan karyawan aktif.');
  }
  return supervisor;
};

const buildEmployee = async (
  input: HrEmployeeInput,
  existing?: Employee,
): Promise<Employee> => {
  const parsed = hrEmployeeSchema.parse(input);
  const employeeNumber = parsed.employee_number ?? existing?.employee_number ?? await nextEmployeeNumber();
  await assertEmployeeUnique(employeeNumber, parsed.nik, existing?.id);
  const [department, position, supervisor] = await Promise.all([
    getActiveDepartment(parsed.department_id),
    getActivePosition(parsed.job_position_id),
    getActiveSupervisor(parsed.supervisor_id, existing?.id),
  ]);
  if (position && department && position.department_id !== department.id) {
    throw new Error('Jabatan harus berasal dari departemen yang dipilih.');
  }

  const now = new Date().toISOString();
  const isActive = parsed.active_status === 'ACTIVE';
  return withPendingSync({
    ...existing,
    id: existing?.id ?? crypto.randomUUID(),
    employee_number: employeeNumber,
    name: parsed.name,
    preferred_name: parsed.preferred_name,
    photo_data_url: parsed.photo_data_url,
    gender: parsed.gender,
    birth_place: parsed.birth_place,
    birth_date: parsed.birth_date,
    marital_status: parsed.marital_status,
    nationality: parsed.nationality,
    phone: parsed.phone,
    email: parsed.personal_email,
    personal_email: parsed.personal_email,
    address: parsed.domicile_address ?? parsed.identity_address,
    identity_address: parsed.identity_address,
    domicile_address: parsed.domicile_address,
    emergency_contact_name: parsed.emergency_contact_name,
    emergency_contact_relationship: parsed.emergency_contact_relationship,
    emergency_contact_phone: parsed.emergency_contact_phone,
    nik: parsed.nik,
    family_card_number: parsed.family_card_number,
    tax_number: parsed.tax_number,
    health_bpjs_number: parsed.health_bpjs_number,
    employment_bpjs_number: parsed.employment_bpjs_number,
    company_unit: parsed.company_unit,
    department_id: department?.id,
    department_code: department?.code,
    department_name: department?.name,
    job_position_id: position?.id,
    job_position_code: position?.code,
    job_position_name: position?.name,
    position: position?.name ?? existing?.position,
    supervisor_id: supervisor?.id,
    supervisor_name: supervisor?.name,
    work_location: parsed.work_location,
    join_date: parsed.join_date,
    employment_status: parsed.employment_status,
    active_status: parsed.active_status,
    work_schedule_type: parsed.work_schedule_type,
    contract_start_date: parsed.contract_start_date,
    contract_end_date: parsed.contract_end_date,
    permanent_date: parsed.permanent_date,
    exit_date: parsed.exit_date,
    exit_reason: parsed.exit_reason,
    salary_payment_method: parsed.salary_payment_method,
    bank_name: parsed.bank_name,
    bank_account_number: parsed.bank_account_number,
    bank_account_holder: parsed.bank_account_holder,
    base_salary: parsed.base_salary ?? 0,
    salary_currency: parsed.salary_currency ?? 'IDR',
    payroll_period: parsed.payroll_period ?? 'MONTHLY',
    is_taxable: parsed.is_taxable ?? true,
    ptkp_status: parsed.ptkp_status,
    is_bpjs_participant: parsed.is_bpjs_participant ?? false,
    notes: parsed.notes,
    is_active: isActive,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  });
};

export const createHrEmployee = async (input: HrEmployeeInput) => {
  const actor = await requireHrActor('hr.employee.create');
  await assertEmployeePayrollMutationAllowed(actor, input);
  const employee = await buildEmployee(input);
  await db.employees.add(employee);
  await writeActivityLog({
    user: actor,
    action: 'HR_EMPLOYEE_CREATED',
    entity: 'employees',
    entity_id: employee.id,
    description: `${actor.name} membuat karyawan ${employee.employee_number} - ${employee.name}.`,
    changes: buildEmployeeChanges(undefined, employee),
  });
  await enqueueEmployeeSync(employee, 'create');
  return employee;
};

export const updateHrEmployee = async (id: string, input: HrEmployeeInput) => {
  const actor = await requireHrActor('hr.employee.update');
  const existing = await db.employees.get(id);
  if (!existing) throw new Error('Karyawan tidak ditemukan.');
  await assertEmployeePayrollMutationAllowed(actor, input, existing);
  const employee = await buildEmployee(input, existing);
  await db.employees.put(employee);
  const changes = buildEmployeeChanges(existing, employee);
  const organizationChanged = (
    existing.department_id !== employee.department_id ||
    existing.job_position_id !== employee.job_position_id
  );
  const payrollChanged = (
    existing.base_salary !== employee.base_salary ||
    existing.bank_account_number !== employee.bank_account_number ||
    existing.salary_payment_method !== employee.salary_payment_method
  );
  await writeActivityLog({
    user: actor,
    action: payrollChanged
      ? 'HR_EMPLOYEE_PAYROLL_UPDATED'
      : organizationChanged
        ? 'HR_EMPLOYEE_ORGANIZATION_UPDATED'
        : 'HR_EMPLOYEE_UPDATED',
    entity: 'employees',
    entity_id: employee.id,
    description: `${actor.name} memperbarui data ${employee.employee_number} - ${employee.name}.`,
    changes,
  });
  await enqueueEmployeeSync(employee, 'update');
  return employee;
};

export const setHrEmployeeActiveStatus = async (
  id: string,
  activeStatus: Employee['active_status'],
) => {
  const actor = await requireHrActor('hr.employee.deactivate');
  const existing = await db.employees.get(id);
  if (!existing) throw new Error('Karyawan tidak ditemukan.');
  const updated = withPendingSync({
    ...existing,
    active_status: activeStatus ?? 'INACTIVE',
    is_active: activeStatus === 'ACTIVE',
    updated_at: new Date().toISOString(),
  });
  await db.employees.put(updated);
  await writeActivityLog({
    user: actor,
    action: activeStatus === 'ACTIVE' ? 'HR_EMPLOYEE_ACTIVATED' : 'HR_EMPLOYEE_DEACTIVATED',
    entity: 'employees',
    entity_id: updated.id,
    description: `${actor.name} mengubah status aktif ${updated.employee_number} - ${updated.name}.`,
    changes: buildEmployeeChanges(existing, updated),
  });
  await enqueueEmployeeSync(updated, 'update');
  return updated;
};

const assertDepartmentCodeUnique = async (code: string, excludeId?: string) => {
  const duplicate = (await db.departments.toArray()).find((department) => (
    department.id !== excludeId && normalizeUniqueText(department.code) === normalizeUniqueText(code)
  ));
  if (duplicate) throw new Error('Kode departemen sudah digunakan.');
};

const assertDepartmentParentValid = async (parentId: string | undefined, departmentId?: string) => {
  if (!parentId) return undefined;
  if (parentId === departmentId) throw new Error('Departemen tidak dapat menjadi parent dirinya sendiri.');
  const parent = await getActiveDepartment(parentId);
  let ancestor = parent;
  const visited = new Set<string>();
  while (ancestor?.parent_department_id) {
    if (ancestor.parent_department_id === departmentId) {
      throw new Error('Parent departemen membentuk siklus hierarki.');
    }
    if (visited.has(ancestor.id)) throw new Error('Hierarki departemen tidak valid.');
    visited.add(ancestor.id);
    ancestor = await db.departments.get(ancestor.parent_department_id);
  }
  return parent;
};

const buildDepartment = async (input: HrDepartmentInput, existing?: Department) => {
  const parsed = hrDepartmentSchema.parse(input);
  await assertDepartmentCodeUnique(parsed.code, existing?.id);
  const [parent, head] = await Promise.all([
    assertDepartmentParentValid(parsed.parent_department_id, existing?.id),
    getActiveSupervisor(parsed.head_employee_id),
  ]);
  const now = new Date().toISOString();
  return withPendingSync({
    ...existing,
    id: existing?.id ?? crypto.randomUUID(),
    code: parsed.code.toUpperCase(),
    name: parsed.name,
    head_employee_id: head?.id,
    head_employee_name: head?.name,
    parent_department_id: parent?.id,
    parent_department_code: parent?.code,
    parent_department_name: parent?.name,
    description: parsed.description,
    is_active: parsed.is_active,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  });
};

export const createHrDepartment = async (input: HrDepartmentInput) => {
  const actor = await requireHrActor('hr.organization.manage');
  const department = await buildDepartment(input);
  await db.departments.add(department);
  await writeActivityLog({
    user: actor,
    action: 'HR_DEPARTMENT_CREATED',
    entity: 'departments',
    entity_id: department.id,
    description: `${actor.name} membuat departemen ${department.code} - ${department.name}.`,
  });
  await enqueueDepartmentSync(department, 'create');
  return department;
};

export const updateHrDepartment = async (id: string, input: HrDepartmentInput) => {
  const actor = await requireHrActor('hr.organization.manage');
  const existing = await db.departments.get(id);
  if (!existing) throw new Error('Departemen tidak ditemukan.');
  const department = await buildDepartment(input, existing);
  await db.departments.put(department);
  await writeActivityLog({
    user: actor,
    action: department.is_active === existing.is_active ? 'HR_DEPARTMENT_UPDATED' : 'HR_DEPARTMENT_STATUS_CHANGED',
    entity: 'departments',
    entity_id: department.id,
    description: `${actor.name} memperbarui departemen ${department.code} - ${department.name}.`,
  });
  await enqueueDepartmentSync(department, 'update');
  return department;
};

const assertPositionCodeUnique = async (code: string, excludeId?: string) => {
  const duplicate = (await db.hrPositions.toArray()).find((position) => (
    position.id !== excludeId && normalizeUniqueText(position.code) === normalizeUniqueText(code)
  ));
  if (duplicate) throw new Error('Kode jabatan sudah digunakan.');
};

const buildPosition = async (input: HrPositionInput, existing?: HrPosition): Promise<HrPosition> => {
  const parsed = hrPositionSchema.parse(input);
  await assertPositionCodeUnique(parsed.code, existing?.id);
  const [department, reportsTo] = await Promise.all([
    getActiveDepartment(parsed.department_id),
    getActivePosition(parsed.reports_to_position_id),
  ]);
  if (!department) throw new Error('Departemen wajib dipilih.');
  if (existing && reportsTo?.id === existing.id) {
    throw new Error('Jabatan tidak dapat menjadi atasan dirinya sendiri.');
  }
  const now = new Date().toISOString();
  return withPendingSync({
    ...existing,
    id: existing?.id ?? crypto.randomUUID(),
    code: parsed.code.toUpperCase(),
    name: parsed.name,
    department_id: department.id,
    department_code: department.code,
    department_name: department.name,
    level: parsed.level,
    reports_to_position_id: reportsTo?.id,
    reports_to_position_code: reportsTo?.code,
    reports_to_position_name: reportsTo?.name,
    description: parsed.description,
    is_active: parsed.is_active,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  });
};

export const createHrPosition = async (input: HrPositionInput) => {
  const actor = await requireHrActor('hr.organization.manage');
  const position = await buildPosition(input);
  await db.hrPositions.add(position);
  await writeActivityLog({
    user: actor,
    action: 'HR_POSITION_CREATED',
    entity: 'hrPositions',
    entity_id: position.id,
    description: `${actor.name} membuat jabatan ${position.code} - ${position.name}.`,
  });
  await enqueueHrPositionSync(position, 'create');
  return position;
};

export const updateHrPosition = async (id: string, input: HrPositionInput) => {
  const actor = await requireHrActor('hr.organization.manage');
  const existing = await db.hrPositions.get(id);
  if (!existing) throw new Error('Jabatan tidak ditemukan.');
  const position = await buildPosition(input, existing);
  await db.hrPositions.put(position);
  await writeActivityLog({
    user: actor,
    action: 'HR_POSITION_UPDATED',
    entity: 'hrPositions',
    entity_id: position.id,
    description: `${actor.name} memperbarui jabatan ${position.code} - ${position.name}.`,
  });
  await enqueueHrPositionSync(position, 'update');
  return position;
};

const buildContract = async (
  input: EmploymentContractInput,
  existing?: EmploymentContract,
): Promise<EmploymentContract> => {
  const parsed = employmentContractSchema.parse(input);
  const duplicate = (await db.employmentContracts.toArray()).find((contract) => (
    contract.id !== existing?.id &&
    normalizeUniqueText(contract.contract_number) === normalizeUniqueText(parsed.contract_number)
  ));
  if (duplicate) throw new Error('Nomor kontrak sudah digunakan.');
  const [employee, department, position] = await Promise.all([
    db.employees.get(parsed.employee_id),
    getActiveDepartment(parsed.department_id),
    getActivePosition(parsed.job_position_id),
  ]);
  if (!employee) throw new Error('Karyawan tidak ditemukan.');
  if (!department || !position) throw new Error('Departemen dan jabatan wajib dipilih.');
  if (position.department_id !== department.id) throw new Error('Jabatan harus berasal dari departemen yang dipilih.');
  const now = new Date().toISOString();
  return withPendingSync({
    ...existing,
    id: existing?.id ?? crypto.randomUUID(),
    contract_number: parsed.contract_number.toUpperCase(),
    employee_id: employee.id,
    employee_number: employee.employee_number,
    employee_name: employee.name,
    contract_type: parsed.contract_type,
    start_date: parsed.start_date,
    end_date: parsed.end_date,
    job_position_id: position.id,
    job_position_code: position.code,
    job_position_name: position.name,
    department_id: department.id,
    department_code: department.code,
    department_name: department.name,
    base_salary: parsed.base_salary,
    status: parsed.status,
    notes: parsed.notes,
    renewed_from_contract_id: parsed.renewed_from_contract_id,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  });
};

export const createEmploymentContract = async (input: EmploymentContractInput) => {
  const actor = await requireHrActor('hr.contract.manage');
  if (input.base_salary > 0) await requireUserPermission(actor, 'hr.payroll.manage');
  if (!['DRAFT', 'ACTIVE'].includes(input.status)) {
    throw new Error('Kontrak baru hanya dapat dibuat sebagai Draft atau Aktif.');
  }
  const contract = await buildContract(input);
  await db.employmentContracts.add(contract);
  await writeActivityLog({
    user: actor,
    action: contract.renewed_from_contract_id ? 'HR_CONTRACT_RENEWED' : 'HR_CONTRACT_CREATED',
    entity: 'employmentContracts',
    entity_id: contract.id,
    description: `${actor.name} membuat kontrak ${contract.contract_number} untuk ${contract.employee_name}.`,
    changes: [{ field: 'base_salary', after: maskSensitive(contract.base_salary), sensitive: true }],
  });
  await enqueueEmploymentContractSync(contract, 'create');
  return contract;
};

export const updateDraftEmploymentContract = async (id: string, input: EmploymentContractInput) => {
  const actor = await requireHrActor('hr.contract.manage');
  const existing = await db.employmentContracts.get(id);
  if (!existing) throw new Error('Kontrak tidak ditemukan.');
  if (existing.status !== 'DRAFT') {
    throw new Error('Hanya kontrak draft yang dapat diubah. Gunakan perpanjangan untuk menjaga riwayat.');
  }
  if (input.base_salary !== existing.base_salary) {
    await requireUserPermission(actor, 'hr.payroll.manage');
  }
  const contract = await buildContract({ ...input, status: 'DRAFT' }, existing);
  await db.employmentContracts.put(contract);
  await writeActivityLog({
    user: actor,
    action: 'HR_CONTRACT_DRAFT_UPDATED',
    entity: 'employmentContracts',
    entity_id: contract.id,
    description: `${actor.name} memperbarui draft kontrak ${contract.contract_number}.`,
  });
  await enqueueEmploymentContractSync(contract, 'update');
  return contract;
};

export const renewEmploymentContract = async (
  sourceId: string,
  input: EmploymentContractInput,
) => {
  const actor = await requireHrActor('hr.contract.manage');
  const source = await db.employmentContracts.get(sourceId);
  if (!source) throw new Error('Kontrak asal tidak ditemukan.');
  if (input.base_salary !== source.base_salary) {
    await requireUserPermission(actor, 'hr.payroll.manage');
  }
  const contract = await buildContract({
    ...input,
    status: 'ACTIVE',
    renewed_from_contract_id: sourceId,
  });
  const renewedSource = withPendingSync({
    ...source,
    status: 'RENEWED' as const,
    updated_at: new Date().toISOString(),
  });
  await db.transaction('rw', [db.employmentContracts], async () => {
    await db.employmentContracts.put(renewedSource);
    await db.employmentContracts.add(contract);
  });
  await writeActivityLog({
    user: actor,
    action: 'HR_CONTRACT_RENEWED',
    entity: 'employmentContracts',
    entity_id: contract.id,
    description: `${actor.name} memperpanjang ${source.contract_number} menjadi ${contract.contract_number}.`,
    changes: [
      { field: 'source_contract', before: source.contract_number, after: contract.contract_number },
      { field: 'base_salary', before: maskSensitive(source.base_salary), after: maskSensitive(contract.base_salary), sensitive: true },
    ],
  });
  await Promise.all([
    enqueueEmploymentContractSync(renewedSource, 'update'),
    enqueueEmploymentContractSync(contract, 'create'),
  ]);
  return contract;
};

export const setEmploymentContractStatus = async (
  id: string,
  status: Extract<EmploymentContract['status'], 'ACTIVE' | 'TERMINATED'>,
) => {
  const actor = await requireHrActor('hr.contract.manage');
  const existing = await db.employmentContracts.get(id);
  if (!existing) throw new Error('Kontrak tidak ditemukan.');
  const transitionAllowed = (
    (existing.status === 'DRAFT' && status === 'ACTIVE') ||
    (existing.status === 'ACTIVE' && status === 'TERMINATED')
  );
  if (!transitionAllowed) {
    throw new Error('Transisi status kontrak tidak diizinkan.');
  }
  const contract = withPendingSync({
    ...existing,
    status,
    updated_at: new Date().toISOString(),
  });
  await db.employmentContracts.put(contract);
  await writeActivityLog({
    user: actor,
    action: 'HR_CONTRACT_STATUS_CHANGED',
    entity: 'employmentContracts',
    entity_id: contract.id,
    description: `${actor.name} mengubah status kontrak ${contract.contract_number}.`,
    changes: [{ field: 'status', before: existing.status, after: contract.status }],
  });
  await enqueueEmploymentContractSync(contract, 'update');
  return contract;
};

const buildSalaryComponent = (
  input: SalaryComponentInput,
  existing?: SalaryComponent,
): SalaryComponent => {
  const parsed = salaryComponentSchema.parse(input);
  const now = new Date().toISOString();
  return withPendingSync({
    ...existing,
    id: existing?.id ?? crypto.randomUUID(),
    code: parsed.code.toUpperCase(),
    name: parsed.name,
    kind: parsed.kind,
    calculation: parsed.calculation,
    default_value: parsed.default_value,
    is_taxable: parsed.is_taxable,
    is_active: parsed.is_active,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  });
};

const assertSalaryComponentCodeUnique = async (code: string, excludeId?: string) => {
  const duplicate = (await db.salaryComponents.toArray()).find((component) => (
    component.id !== excludeId && normalizeUniqueText(component.code) === normalizeUniqueText(code)
  ));
  if (duplicate) throw new Error('Kode komponen gaji sudah digunakan.');
};

export const createSalaryComponent = async (input: SalaryComponentInput) => {
  const actor = await requireHrActor('hr.payroll.manage');
  const parsed = salaryComponentSchema.parse(input);
  await assertSalaryComponentCodeUnique(parsed.code);
  const component = buildSalaryComponent(parsed);
  await db.salaryComponents.add(component);
  await writeActivityLog({
    user: actor,
    action: 'HR_SALARY_COMPONENT_CREATED',
    entity: 'salaryComponents',
    entity_id: component.id,
    description: `${actor.name} membuat komponen gaji ${component.code} - ${component.name}.`,
  });
  await enqueueSalaryComponentSync(component, 'create');
  return component;
};

export const updateSalaryComponent = async (id: string, input: SalaryComponentInput) => {
  const actor = await requireHrActor('hr.payroll.manage');
  const existing = await db.salaryComponents.get(id);
  if (!existing) throw new Error('Komponen gaji tidak ditemukan.');
  const parsed = salaryComponentSchema.parse(input);
  await assertSalaryComponentCodeUnique(parsed.code, id);
  const component = buildSalaryComponent(parsed, existing);
  await db.salaryComponents.put(component);
  await writeActivityLog({
    user: actor,
    action: 'HR_SALARY_COMPONENT_UPDATED',
    entity: 'salaryComponents',
    entity_id: component.id,
    description: `${actor.name} memperbarui komponen gaji ${component.code} - ${component.name}.`,
  });
  await enqueueSalaryComponentSync(component, 'update');
  return component;
};

export const upsertEmployeeSalaryComponent = async (
  employeeId: string,
  input: EmployeeSalaryComponentInput,
) => {
  const actor = await requireHrActor('hr.payroll.manage');
  const parsed = employeeSalaryComponentSchema.parse(input);
  const [employee, component] = await Promise.all([
    db.employees.get(employeeId),
    db.salaryComponents.get(parsed.salary_component_id),
  ]);
  if (!employee) throw new Error('Karyawan tidak ditemukan.');
  if (!component || (!component.is_active && parsed.is_active !== false)) {
    throw new Error('Komponen gaji tidak ditemukan atau sudah nonaktif.');
  }
  const existing = await db.employeeSalaryComponents
    .where('[employee_id+salary_component_id]')
    .equals([employeeId, component.id])
    .first();
  const now = new Date().toISOString();
  const assignment: EmployeeSalaryComponent = withPendingSync({
    ...existing,
    id: existing?.id ?? crypto.randomUUID(),
    employee_id: employee.id,
    salary_component_id: component.id,
    component_code: component.code,
    component_name: component.name,
    kind: component.kind,
    calculation: component.calculation,
    value: parsed.value,
    is_active: parsed.is_active ?? true,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  });
  await db.employeeSalaryComponents.put(assignment);
  await writeActivityLog({
    user: actor,
    action: 'HR_EMPLOYEE_SALARY_COMPONENT_UPDATED',
    entity: 'employeeSalaryComponents',
    entity_id: assignment.id,
    description: `${actor.name} mengubah komponen ${component.name} untuk ${employee.name}.`,
    changes: [{
      field: component.code,
      before: maskSensitive(existing?.value),
      after: maskSensitive(assignment.value),
      sensitive: true,
    }],
  });
  await enqueueEmployeeSalaryComponentSync(assignment, existing ? 'update' : 'create');
  return assignment;
};
