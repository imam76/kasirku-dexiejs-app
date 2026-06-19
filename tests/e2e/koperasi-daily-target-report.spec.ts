import { expect, test } from '@playwright/test';
import { loginAsBootstrappedOwner } from './helpers/auth';
import {
  dailyTargetFixtureIds,
  seedDailyTargetFixture,
} from './helpers/koperasiDailyTarget';

test('TH-01, TH-03, TH-04, TH-06, TH-07, TH-10, TH-11, TH-12 - laporan target harian per PDL', async ({ page }) => {
  await loginAsBootstrappedOwner(page);
  await seedDailyTargetFixture(page);
  await page.goto('/koperasi/laporan-target-harian');

  const report = page.getByTestId('koperasi-daily-target-report');
  await expect(report).toBeVisible();
  await expect(report).toContainText('LAPORAN TARGET HARIAN');

  const group = page.getByTestId(`koperasi-daily-target-group-${dailyTargetFixtureIds.employee}`);
  await expect(group).toContainText('Petugas Target - PDL Utama');
  await expect(group).toContainText('Senin:');
  await expect(group).toContainText('SENIN - Area Senin');
  await expect(group).toContainText('Kamis:');
  await expect(group).toContainText('KAMIS - Area Kamis');

  const secondGroup = page.getByTestId(
    `koperasi-daily-target-group-${dailyTargetFixtureIds.secondEmployee}`,
  );
  await expect(secondGroup).toContainText('Petugas Cadangan - PDL Kedua');
  await expect(secondGroup).toContainText('Rabu:');
  await expect(secondGroup).toContainText('RABU - Area Rabu');

  const monday = page.getByTestId(
    `koperasi-daily-target-row-${dailyTargetFixtureIds.employee}-2026-06-01-1`,
  );
  const mondayCells = monday.locator('td');
  await expect(mondayCells.nth(1)).toHaveText('2');
  await expect(mondayCells.nth(2)).toHaveText('1');
  await expect(mondayCells.nth(3)).toHaveText('1');
  await expect(mondayCells.nth(4)).toHaveText('2');
  await expect(mondayCells.nth(5)).toContainText('Rp 200.000');
  await expect(mondayCells.nth(6)).toContainText('Rp 50.000');
  await expect(mondayCells.nth(7)).toContainText('Rp 70.000');
  await expect(mondayCells.nth(8)).toContainText('Rp 180.000');
  await expect(mondayCells.nth(9)).toContainText('Rp 180.000');
  await expect(mondayCells.nth(10)).toHaveText('90%');
  await expect(mondayCells.nth(12)).toHaveText('-');
  await expect(mondayCells.nth(13)).toContainText('Rp 100.000');
  await expect(mondayCells.nth(14)).toContainText('Rp 100.000');
  await expect(mondayCells.nth(15)).toContainText('Rp 180.000');
  await expect(mondayCells.nth(16)).toContainText('Rp 20.000');
  await expect(mondayCells.nth(17)).toContainText('Rp 70.000');

  const thursday = page.getByTestId(
    `koperasi-daily-target-row-${dailyTargetFixtureIds.employee}-2026-06-04-4`,
  );
  const thursdayCells = thursday.locator('td');
  await expect(thursdayCells.nth(5)).toContainText('Rp 300.000');
  await expect(thursdayCells.nth(9)).toContainText('Rp 150.000');
  await expect(thursdayCells.nth(12)).toContainText('Rp 100.000');
  await expect(thursdayCells.nth(14)).toContainText('Rp 300.000');
  await expect(thursdayCells.nth(15)).toContainText('Rp 330.000');
  await expect(thursdayCells.nth(17)).toContainText('Rp -30.000');

  const nextMonday = page.getByTestId(
    `koperasi-daily-target-row-${dailyTargetFixtureIds.employee}-2026-06-08-1`,
  );
  await expect(nextMonday.locator('td').nth(5)).toContainText('Rp 180.000');
  await expect(nextMonday.locator('td').nth(14)).toContainText('Rp 300.000');
  await expect(nextMonday.locator('td').nth(15)).toContainText('Rp 330.000');

  const firstWeekTotal = page.getByTestId(
    `koperasi-daily-target-week-total-${dailyTargetFixtureIds.employee}-1`,
  );
  await expect(firstWeekTotal.locator('td').nth(10)).toHaveText('66%');

  const employeeFilter = page.getByTestId('koperasi-daily-target-employee-filter');
  await employeeFilter.click();
  await page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .last()
    .locator('.ant-select-item-option')
    .filter({ hasText: 'Petugas Target - PDL Utama' })
    .click();

  await expect(group).toBeVisible();
  await expect(secondGroup).toHaveCount(0);
});
