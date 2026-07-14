import { expect, type Page } from '@playwright/test';
import { demoOwner } from './data';

export async function registerFirstOwner(page: Page, pin = demoOwner.pin) {
  await page.goto('/');

  const registerHeading = page.getByRole('heading', { name: 'Register Owner' });
  await expect(page.getByRole('heading', { name: /Masuk Frayukti|Register Owner/ })).toBeVisible();

  if (!await registerHeading.isVisible()) {
    await expect(page.getByRole('heading', { name: 'Masuk Frayukti' })).toBeVisible();
    await expect(page.getByText('Belum ada user aktif.')).toBeVisible();

    await page.getByRole('button', { name: 'Register Owner Pertama' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Register Owner' })).toBeVisible();

  await page.getByLabel('Nama Owner').fill(demoOwner.name);
  await page.getByLabel('Email').fill(demoOwner.email);
  await page.getByLabel('PIN', { exact: true }).fill(pin);
  await page.getByLabel('Konfirmasi PIN').fill(pin);
  await page.getByRole('button', { name: 'Simpan Owner' }).click();

  await expect(page.getByLabel(/Profil login|Logged-in profile/)).toBeVisible();
}

export async function logout(page: Page) {
  const logoutButton = page.getByRole('button', { name: 'Logout' });
  if (!await logoutButton.isVisible()) {
    await page.getByLabel(/Profil login|Logged-in profile/).click();
  }
  await logoutButton.click();

  const logoutDialog = page.getByRole('dialog').filter({ hasText: 'Logout dari Frayukti?' });
  await expect(logoutDialog).toBeVisible();
  await logoutDialog.getByRole('button', { name: 'Logout' }).click();
  await expect(page.getByRole('heading', { name: 'Masuk Frayukti' })).toBeVisible();
}

export async function loginWithCredentials(page: Page, email: string, pin: string) {
  await expect(page.getByRole('heading', { name: 'Masuk Frayukti' })).toBeVisible();

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('PIN').fill(pin);
  await page.getByRole('button', { name: 'Masuk' }).click();

  await expect(page.getByLabel(/Profil login|Logged-in profile/)).toBeVisible();
}

export async function logoutAndLoginAgain(page: Page, pin = demoOwner.pin) {
  await logout(page);
  await loginWithCredentials(page, demoOwner.email, pin);
}

export async function loginAsBootstrappedOwner(page: Page) {
  await registerFirstOwner(page);
}
