import type { Page } from '@playwright/test';
import type {
  CooperativeArea,
  CooperativeMember,
  Employee,
  EmployeeArea,
  EmployeeCollectionSchedule,
} from '../../../src/types';

const createdAt = '2026-01-01T08:00:00.000+07:00';

export const migrationFixtureMember = {
  memberNumber: 'MIG-001',
  name: 'Anggota Migrasi',
  // Officer collects on Monday (ISO weekday 1); the official schedule date must land on it.
  officerWeekday: 1,
} as const;

const employee: Employee = {
  id: 'e2e-mig-officer',
  name: 'Petugas Migrasi',
  position: 'PDL Migrasi',
  is_active: true,
  created_at: createdAt,
  updated_at: createdAt,
};

const area: CooperativeArea = {
  id: 'e2e-mig-area',
  code: 'MIG',
  name: 'Area Migrasi',
  is_active: true,
  created_at: createdAt,
  updated_at: createdAt,
};

const employeeArea: EmployeeArea = {
  id: 'e2e-mig-employee-area',
  employee_id: employee.id,
  area_id: area.id,
  area_name: area.name,
  area_code: area.code,
  created_at: createdAt,
  updated_at: createdAt,
};

const schedule: EmployeeCollectionSchedule = {
  id: 'e2e-mig-schedule',
  employee_id: employee.id,
  employee_name: employee.name,
  employee_position: employee.position,
  area_id: area.id,
  area_name: area.name,
  area_code: area.code,
  weekday: 1,
  effective_from: createdAt,
  is_active: true,
  created_at: createdAt,
  updated_at: createdAt,
};

const member: CooperativeMember = {
  id: 'e2e-mig-member',
  member_number: migrationFixtureMember.memberNumber,
  name: migrationFixtureMember.name,
  area_id: area.id,
  area_name: area.name,
  area_code: area.code,
  officer_id: employee.id,
  officer_name: employee.name,
  officer_position: employee.position,
  join_date: createdAt,
  status: 'ACTIVE',
  created_at: createdAt,
  updated_at: createdAt,
  sync_status: 'synced',
};

const fixture = {
  cooperativeAreas: [area],
  employees: [employee],
  employeeAreas: [employeeArea],
  employeeCollectionSchedules: [schedule],
  cooperativeMembers: [member],
};

/**
 * Seeds the minimal master data (officer + area + assignment + Monday collection schedule
 * + active member) required to record a migration loan, writing straight into IndexedDB so
 * the test does not depend on the (currently flaky) accounting-setup UI helper.
 */
export async function seedMigrationFixture(page: Page) {
  await page.evaluate(async (recordsByStore) => {
    const storeNames = Object.keys(recordsByStore);
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('KasirkuDB');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(storeNames, 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };

        Object.entries(recordsByStore).forEach(([storeName, records]) => {
          const store = transaction.objectStore(storeName);
          (records as unknown[]).forEach((record) => store.put(record));
        });
      };
    });
  }, fixture);

  await page.reload();
}
