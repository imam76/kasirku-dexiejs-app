import type {
  Employee,
  PayrollRun,
  PayrollRunItem,
} from '@/types';
import type { KasirkuDB } from '../../KasirkuDB';

export function registerMigrationV104(db: KasirkuDB) {
  db.version(104).stores({
    payrollRuns: 'id, &payroll_number, period_start, period_end, payroll_period, salary_currency, status, paid_at, finance_transaction_id, created_at, updated_at, sync_status',
    payrollRunItems: 'id, payroll_run_id, employee_id, employee_number, employee_department, payroll_period, salary_currency',
  }).upgrade(async (transaction) => {
    const now = new Date().toISOString();
    const employeeTable = transaction.table<Employee>('employees');
    const runTable = transaction.table<PayrollRun>('payrollRuns');
    const itemTable = transaction.table<PayrollRunItem>('payrollRunItems');
    const employees = await employeeTable.toArray();
    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
    const items = await itemTable.toArray();

    const migratedItems = items.map((item): PayrollRunItem => {
      const employee = employeeById.get(item.employee_id);
      return {
        ...item,
        employee_number: item.employee_number ?? employee?.employee_number,
        employee_position: item.employee_position
          ?? employee?.job_position_name
          ?? employee?.position,
        employee_department: item.employee_department ?? employee?.department_name,
        payroll_period: item.payroll_period ?? employee?.payroll_period ?? 'MONTHLY',
        salary_currency: item.salary_currency ?? employee?.salary_currency ?? 'IDR',
        salary_payment_method: item.salary_payment_method
          ?? employee?.salary_payment_method
          ?? 'CASH',
        updated_at: now,
      };
    });
    if (migratedItems.length > 0) {
      await itemTable.bulkPut(migratedItems);
    }

    const firstItemByRunId = new Map<string, PayrollRunItem>();
    for (const item of migratedItems) {
      if (!firstItemByRunId.has(item.payroll_run_id)) {
        firstItemByRunId.set(item.payroll_run_id, item);
      }
    }
    const runs = await runTable.toArray();
    const migratedRuns = runs.map((run): PayrollRun => {
      const firstItem = firstItemByRunId.get(run.id);
      return {
        ...run,
        payroll_period: run.payroll_period ?? firstItem?.payroll_period ?? 'MONTHLY',
        salary_currency: run.salary_currency ?? firstItem?.salary_currency ?? 'IDR',
        updated_at: now,
        sync_status: 'pending',
        sync_error: undefined,
      };
    });
    if (migratedRuns.length > 0) {
      await runTable.bulkPut(migratedRuns);
    }
  });
}
