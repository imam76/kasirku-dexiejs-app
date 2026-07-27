import { expect, test } from '@playwright/test';
import {
  loginAsBootstrappedOwner,
  loginWithCredentials,
  logout,
} from './helpers/auth';
import { demoOwner } from './helpers/data';

test.describe('user dan hak akses', () => {
  test('user dapat mengganti PIN sendiri lalu login dengan PIN baru', async ({ page }) => {
    const newPin = '741852';
    await loginAsBootstrappedOwner(page);

    await page.getByLabel(/Profil login|Logged-in profile/).click();
    await page.getByRole('button', { name: 'Ganti PIN Saya' }).click();

    const dialog = page.getByRole('dialog', { name: 'Ganti PIN Saya' });
    await dialog.getByLabel('PIN Saat Ini').fill(demoOwner.pin);
    await dialog.getByLabel('PIN Baru', { exact: true }).fill(newPin);
    await dialog.getByLabel('Konfirmasi PIN Baru').fill(newPin);
    await dialog.getByRole('button', { name: 'Ganti PIN' }).click();
    await expect(page.getByText('PIN berhasil diganti.')).toBeVisible();

    await logout(page);
    await page.getByLabel('Email').fill(demoOwner.email);
    await page.getByLabel('PIN').fill(demoOwner.pin);
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page.getByText('Email atau PIN tidak valid atau user tidak aktif.')).toBeVisible();

    await page.getByLabel('PIN').fill(newPin);
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page.getByLabel(/Profil login|Logged-in profile/)).toBeVisible();
  });

  test('Owner membuat akun login yang tertaut ke karyawan melalui Master Data', async ({ page }) => {
    const employee = {
      id: 'e2e-employee-user-access',
      employee_number: 'EMP-90001',
      name: 'Karyawan Akses E2E',
      email: 'karyawan.akses@ksu.test',
    };
    const employeePin = '852741';

    await loginAsBootstrappedOwner(page);
    await page.evaluate(async (input) => {
      const { db } = await import('/src/lib/db.ts');
      const now = new Date().toISOString();
      await db.employees.put({
        ...input,
        active_status: 'ACTIVE',
        employment_status: 'PERMANENT',
        is_active: true,
        created_at: now,
        updated_at: now,
        sync_status: 'pending',
      });
    }, employee);

    await page.goto('/master-data');
    await page.getByRole('link', { name: /Akun Pengguna/ }).click();
    await expect(page).toHaveURL(/\/master-data\/users$/);
    await expect(page.getByRole('button', { name: 'Tambah User' })).toBeVisible();

    await page.getByRole('button', { name: 'Tambah User' }).click();
    const dialog = page.getByRole('dialog', { name: 'Tambah User' });
    await dialog.getByLabel('Karyawan Tertaut (Opsional)').click();
    await page
      .locator('.ant-select-dropdown:visible .ant-select-item-option')
      .filter({ hasText: `${employee.employee_number} — ${employee.name}` })
      .click();
    await expect(dialog.getByLabel('Nama User')).toHaveValue(employee.name);
    await expect(dialog.getByLabel('Email')).toHaveValue(employee.email);
    await dialog.getByLabel('PIN', { exact: true }).fill(employeePin);
    await dialog.getByPlaceholder('Ulangi PIN').fill(employeePin);
    await dialog.getByRole('button', { name: 'OK' }).click();

    await expect(page.getByText('User berhasil ditambahkan.')).toBeVisible();
    const userRow = page.getByRole('row').filter({ hasText: employee.email });
    await expect(userRow).toContainText(employee.name);
    await expect(userRow).toContainText(employee.email);

    const persisted = await page.evaluate(async (employeeId) => {
      const { db } = await import('/src/lib/db.ts');
      const [user, employeeRecord] = await Promise.all([
        db.authUsers.where('employee_id').equals(employeeId).first(),
        db.employees.get(employeeId),
      ]);
      return {
        userEmployeeId: user?.employee_id,
        userHasCredential: Boolean(user?.pin_hash && user?.pin_salt),
        employeeHasCredential: Boolean(employeeRecord?.pin_hash || employeeRecord?.pin_salt),
      };
    }, employee.id);

    expect(persisted).toEqual({
      userEmployeeId: employee.id,
      userHasCredential: true,
      employeeHasCredential: false,
    });

    await logout(page);
    await loginWithCredentials(page, employee.email, employeePin);
  });
});
