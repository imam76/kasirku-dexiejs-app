import { expect, test } from '@playwright/test';
import { registerFirstOwner } from './helpers/auth';

test('database unconfigured tidak memblokir operasi lokal dan warning hanya tampil di Sync DB', async ({ page }) => {
  await registerFirstOwner(page);

  await expect(page.getByLabel(/Profil login|Logged-in profile/)).toBeVisible();
  await expect(page.getByText('Koneksi database belum tersedia', { exact: true })).toHaveCount(0);

  await page.goto('/sync-db');

  await expect(page.getByRole('heading', { name: 'Setup Sync Database' })).toBeVisible();
  await expect(page.getByText('Koneksi database belum tersedia', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Atur host' }).first()).toBeVisible();
});
