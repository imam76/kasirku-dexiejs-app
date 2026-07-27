import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const hrisMigration = readFileSync(
  new URL('../../src-tauri/migrations/0063_hris_mvp.sql', import.meta.url),
  'utf8',
);
const employeeAccessMigration = readFileSync(
  new URL('../../src-tauri/migrations/0065_employee_access_profiles.sql', import.meta.url),
  'utf8',
);
const employeeRepository = readFileSync(
  new URL('../../src-tauri/src/repositories/employee_repository.rs', import.meta.url),
  'utf8',
);
const workforceMigration = readFileSync(
  new URL('../../src-tauri/migrations/0066_hr_workforce_collection_coverage.sql', import.meta.url),
  'utf8',
);
const workforceRepository = readFileSync(
  new URL('../../src-tauri/src/repositories/workforce_repository.rs', import.meta.url),
  'utf8',
);
const paymentRepository = readFileSync(
  new URL('../../src-tauri/src/repositories/cooperative_payment_repository.rs', import.meta.url),
  'utf8',
);
const syncQueueService = readFileSync(
  new URL('../../src/services/syncQueueService.ts', import.meta.url),
  'utf8',
);
const workforceDexieMigration = readFileSync(
  new URL('../../src/lib/database/migrations/versions/v105.ts', import.meta.url),
  'utf8',
);
const dailyTargetManagement = readFileSync(
  new URL(
    '../../src/view/koperasi/reports/CooperativeDailyTargetReportManagement.tsx',
    import.meta.url,
  ),
  'utf8',
);

describe('PostgreSQL HRIS migration', () => {
  test('deduplicates overlapping legacy permission mappings before upsert', () => {
    const permissionGrantStart = hrisMigration.indexOf('WITH permission_grants AS');
    const permissionGrantEnd = hrisMigration.indexOf(
      'ON CONFLICT (role_id, permission_code) DO UPDATE',
      permissionGrantStart,
    );
    const permissionGrantSql = hrisMigration.slice(permissionGrantStart, permissionGrantEnd);

    expect(permissionGrantStart).toBeGreaterThan(-1);
    expect(permissionGrantEnd).toBeGreaterThan(permissionGrantStart);
    expect(permissionGrantSql).toMatch(
      /SELECT DISTINCT\s+source\.role_id,\s+mapping\.target_permission/,
    );
    expect(permissionGrantSql).toContain(
      "('FINANCE_ACCESS', 'hr.payroll.view')",
    );
    expect(permissionGrantSql).toContain(
      "('REPORT_PAYROLL_VIEW', 'hr.payroll.view')",
    );
    expect(permissionGrantSql.indexOf('SELECT DISTINCT')).toBeLessThan(
      permissionGrantSql.indexOf('INSERT INTO role_permissions'),
    );
  });

  test('separates access credentials and gives legacy inserts an employee number', () => {
    expect(employeeAccessMigration).toContain(
      'CREATE TABLE IF NOT EXISTS employee_access_profiles',
    );
    expect(employeeAccessMigration).toContain(
      'ALTER COLUMN employee_number SET DEFAULT generate_employee_number()',
    );
    expect(employeeAccessMigration).toContain(
      'INSERT INTO employee_access_profiles',
    );
    expect(employeeAccessMigration).toContain(
      'CREATE TRIGGER trg_sync_employee_access_profile',
    );
  });

  test('keeps legacy employee sync compatible without clearing HR data', () => {
    expect(employeeRepository).toContain('let mut tx = pool.begin().await?');
    expect(employeeRepository).toMatch(
      /employee_number = COALESCE\(\s+NULLIF\(BTRIM\(payload\.employee_number\), ''\),\s+employee\.employee_number/,
    );
    expect(employeeRepository).toContain(
      "AND NULLIF(BTRIM(payload.employee_number), '') IS NOT NULL",
    );
    expect(employeeRepository).toContain(
      'COALESCE(access_profile.access_login_role_id, login_role_id) AS login_role_id',
    );
  });

  test('adds idempotent workforce, leave, review queue, and coverage structures', () => {
    [
      'implementation_review_queue',
      'work_schedule_templates',
      'employee_work_schedule_assignments',
      'leave_requests',
      'leave_request_actions',
      'leave_balance_ledger',
      'employee_availability_exceptions',
      'collection_coverage_exceptions',
    ].forEach((table) => {
      expect(workforceMigration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    });
    expect(workforceMigration).toContain('idx_auth_users_employee_unique');
    expect(workforceMigration).toContain('collection_assignment_needs_review = TRUE');
    expect(workforceMigration).toContain('employee_work_schedule_assignments_no_overlap');
    expect(workforceMigration).toContain('ON CONFLICT (id) DO UPDATE');
  });

  test('keeps legacy employee indexes available after the workforce Dexie migration', () => {
    expect(workforceDexieMigration).toMatch(
      /employees: 'id,[^']*field_cash_account_id[^']*department_id[^']*sync_status/,
    );
  });

  test('keeps final leave approval and coverage resolution atomic and server-authorized', () => {
    expect(workforceRepository).toContain('let mut tx = pool.begin().await?');
    expect(workforceRepository).toContain('"hr.leave.hr_approve"');
    expect(workforceRepository).toContain('"cooperative.collection.coverage.manage"');
    expect(workforceRepository).toContain('tx.commit().await?');
    expect(workforceRepository).toContain('Saldo cuti tidak mencukupi');
    expect(workforceRepository).toContain('Petugas pengganti tidak aktif');
  });

  test('syncs pre-final leave workflow between clients with server transition checks', () => {
    expect(syncQueueService).toContain("const LEAVE_WORKFLOW_ENTITY = 'leaveWorkflows'");
    expect(syncQueueService).toContain('enqueuePendingWorkforceForSync');
    expect(syncQueueService).toContain('upsertLeaveWorkflow');
    expect(workforceRepository).toContain('pub async fn upsert_leave_workflow');
    expect(workforceRepository).toContain('Transisi workflow cuti dari');
    expect(workforceRepository).toContain('SUPERVISOR_SKIPPED');
  });

  test('authorizes payment against effective coverage instead of the immutable loan snapshot', () => {
    expect(paymentRepository).toContain('resolve_effective_collector');
    expect(paymentRepository).toContain('assert_actor_collection_scope');
    expect(paymentRepository).toContain(
      'Kolektor harus sesuai dengan coverage penagihan pada tanggal operasional.',
    );
  });

  test('builds the operational daily target from the central coverage worklist', () => {
    expect(dailyTargetManagement).toContain('getCollectionWorklist');
    expect(dailyTargetManagement).toContain('Target Operasional Efektif');
    expect(dailyTargetManagement).toContain('target_amount');
  });
});
