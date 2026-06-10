import { expect, type Page } from '@playwright/test';
import { demoOwner } from './data';

export async function registerFirstOwner(page: Page, pin = demoOwner.pin) {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Masuk Kasirku' })).toBeVisible();
  await expect(page.getByText('Belum ada user aktif.')).toBeVisible();

  await page.getByRole('button', { name: 'Register Owner Pertama' }).click();
  await expect(page.getByRole('heading', { name: 'Register Owner' })).toBeVisible();

  await page.getByLabel('Nama Owner').fill(demoOwner.name);
  await page.getByLabel('Email').fill(demoOwner.email);
  await page.getByLabel('PIN', { exact: true }).fill(pin);
  await page.getByLabel('Konfirmasi PIN').fill(pin);
  await page.getByRole('button', { name: 'Simpan Owner' }).click();

  await expect(page.getByLabel('Logout')).toBeVisible();
}

export async function logout(page: Page) {
  await page.getByLabel('Logout').click();

  const logoutDialog = page.getByRole('dialog').filter({ hasText: 'Logout dari Kasirku?' });
  await expect(logoutDialog).toBeVisible();
  await logoutDialog.getByRole('button', { name: 'Logout' }).click();
  await expect(page.getByRole('heading', { name: 'Masuk Kasirku' })).toBeVisible();
}

export async function loginWithCredentials(page: Page, email: string, pin: string) {
  await expect(page.getByRole('heading', { name: 'Masuk Kasirku' })).toBeVisible();

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('PIN').fill(pin);
  await page.getByRole('button', { name: 'Masuk' }).click();

  await expect(page.getByLabel('Logout')).toBeVisible();
}

export async function logoutAndLoginAgain(page: Page, pin = demoOwner.pin) {
  await logout(page);
  await loginWithCredentials(page, demoOwner.email, pin);
}

export async function loginAsBootstrappedOwner(page: Page) {
  await registerFirstOwner(page);
}
