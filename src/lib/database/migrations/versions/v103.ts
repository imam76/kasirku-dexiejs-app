import type {
  Employee,
  EmployeeActiveStatus,
  EmployeeEmploymentStatus,
  EmployeePayrollPeriod,
  EmployeeWorkScheduleType,
  SalaryComponent,
  Permission,
  RolePermission,
} from '@/types';
import type { KasirkuDB } from '../../KasirkuDB';

const DEFAULT_SALARY_COMPONENTS: Array<Pick<
  SalaryComponent,
  'id' | 'code' | 'name' | 'kind' | 'calculation' | 'default_value' | 'is_taxable'
>> = [
  { id: 'salary-base', code: 'GAJI-POKOK', name: 'Gaji Pokok', kind: 'EARNING', calculation: 'FIXED', default_value: 0, is_taxable: true },
  { id: 'salary-position', code: 'TUNJ-JABATAN', name: 'Tunjangan Jabatan', kind: 'EARNING', calculation: 'FIXED', default_value: 0, is_taxable: true },
  { id: 'salary-meal', code: 'TUNJ-MAKAN', name: 'Tunjangan Makan', kind: 'EARNING', calculation: 'FIXED', default_value: 0, is_taxable: false },
  { id: 'salary-transport', code: 'TUNJ-TRANSPORT', name: 'Tunjangan Transportasi', kind: 'EARNING', calculation: 'FIXED', default_value: 0, is_taxable: false },
  { id: 'salary-bonus', code: 'BONUS', name: 'Bonus', kind: 'EARNING', calculation: 'FIXED', default_value: 0, is_taxable: true },
  { id: 'salary-overtime', code: 'LEMBUR', name: 'Lembur', kind: 'EARNING', calculation: 'FIXED', default_value: 0, is_taxable: true },
  { id: 'deduction-late', code: 'POT-TERLAMBAT', name: 'Potongan Keterlambatan', kind: 'DEDUCTION', calculation: 'FIXED', default_value: 0, is_taxable: false },
  { id: 'deduction-health-bpjs', code: 'BPJS-KES', name: 'BPJS Kesehatan', kind: 'DEDUCTION', calculation: 'PERCENTAGE', default_value: 1, is_taxable: false },
  { id: 'deduction-employment-bpjs', code: 'BPJS-TK', name: 'BPJS Ketenagakerjaan', kind: 'DEDUCTION', calculation: 'PERCENTAGE', default_value: 2, is_taxable: false },
  { id: 'deduction-tax', code: 'PPH-21', name: 'PPh 21', kind: 'DEDUCTION', calculation: 'FIXED', default_value: 0, is_taxable: false },
];

const resolveLegacyEmploymentStatus = (employee: Employee): EmployeeEmploymentStatus => (
  employee.employment_status ?? 'PERMANENT'
);

const resolveLegacyActiveStatus = (employee: Employee): EmployeeActiveStatus => (
  employee.active_status ?? (employee.is_active ? 'ACTIVE' : 'INACTIVE')
);

export function registerMigrationV103(db: KasirkuDB) {
  db.version(103).stores({
    employees: 'id, &employee_number, &nik, name, department_id, job_position_id, supervisor_id, employment_status, active_status, join_date, contract_end_date, is_active, updated_at, sync_status',
    departments: 'id, &code, name, head_employee_id, parent_department_id, is_active, updated_at, sync_status',
    hrPositions: 'id, &code, name, department_id, level, reports_to_position_id, is_active, updated_at, sync_status',
    employmentContracts: 'id, &contract_number, employee_id, contract_type, start_date, end_date, department_id, job_position_id, status, updated_at, sync_status',
    salaryComponents: 'id, &code, name, kind, calculation, is_taxable, is_active, updated_at, sync_status',
    employeeSalaryComponents: 'id, employee_id, salary_component_id, [employee_id+salary_component_id], kind, is_active, updated_at, sync_status',
  }).upgrade(async (transaction) => {
    const now = new Date().toISOString();
    const employeeTable = transaction.table<Employee>('employees');
    const employees = (await employeeTable.toArray())
      .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id));
    const usedNumbers = new Set(
      employees.map((employee) => employee.employee_number).filter((value): value is string => Boolean(value)),
    );
    let sequence = 1;

    const migratedEmployees = employees.map((employee) => {
      let employeeNumber = employee.employee_number;
      while (!employeeNumber || usedNumbers.has(`EMP-${String(sequence).padStart(5, '0')}`)) {
        const candidate = `EMP-${String(sequence).padStart(5, '0')}`;
        sequence += 1;
        if (!usedNumbers.has(candidate)) {
          employeeNumber = employeeNumber ?? candidate;
          break;
        }
      }
      usedNumbers.add(employeeNumber);

      return {
        ...employee,
        employee_number: employeeNumber,
        personal_email: employee.personal_email ?? employee.email,
        identity_address: employee.identity_address ?? employee.address,
        domicile_address: employee.domicile_address ?? employee.address,
        job_position_name: employee.job_position_name ?? employee.position,
        employment_status: resolveLegacyEmploymentStatus(employee),
        active_status: resolveLegacyActiveStatus(employee),
        work_schedule_type: employee.work_schedule_type ?? ('FULL_TIME' satisfies EmployeeWorkScheduleType),
        salary_currency: employee.salary_currency ?? 'IDR',
        payroll_period: employee.payroll_period ?? ('MONTHLY' satisfies EmployeePayrollPeriod),
        is_active: resolveLegacyActiveStatus(employee) === 'ACTIVE',
        updated_at: now,
        sync_status: 'pending' as const,
      };
    });

    if (migratedEmployees.length > 0) {
      await employeeTable.bulkPut(migratedEmployees);
    }

    const salaryComponentTable = transaction.table<SalaryComponent>('salaryComponents');
    const salaryComponents: SalaryComponent[] = DEFAULT_SALARY_COMPONENTS.map((component) => ({
      ...component,
      is_active: true,
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
    }));
    await salaryComponentTable.bulkPut(salaryComponents);

    const rolePermissionTable = transaction.table<RolePermission>('rolePermissions');
    const currentPermissions = await rolePermissionTable.toArray();
    const currentPermissionKeys = new Set(
      currentPermissions.map((permission) => `${permission.role_id}:${permission.permission_code}`),
    );
    const permissionMigration: Array<{ source: Permission; targets: Permission[] }> = [
      {
        source: 'EMPLOYEE_MANAGE',
        targets: [
          'hr.employee.view',
          'hr.employee.create',
          'hr.employee.update',
          'hr.employee.deactivate',
          'hr.contract.manage',
        ],
      },
      { source: 'DEPARTMENT_MANAGE', targets: ['hr.organization.manage'] },
      { source: 'FINANCE_ACCESS', targets: ['hr.payroll.view', 'hr.payroll.manage'] },
      { source: 'REPORT_PAYROLL_VIEW', targets: ['hr.payroll.view'] },
    ];
    const migratedRolePermissions = permissionMigration.flatMap(({ source, targets }) => (
      currentPermissions
        .filter((permission) => permission.permission_code === source)
        .flatMap((permission) => targets.map((target): RolePermission => ({
          id: `${permission.role_id}:${target}`,
          role_id: permission.role_id,
          permission_code: target,
          created_at: now,
          updated_at: now,
          sync_status: 'pending',
        })))
    )).filter((permission) => (
      !currentPermissionKeys.has(`${permission.role_id}:${permission.permission_code}`)
    ));
    if (migratedRolePermissions.length > 0) {
      await rolePermissionTable.bulkPut(migratedRolePermissions);
    }
  });
}
