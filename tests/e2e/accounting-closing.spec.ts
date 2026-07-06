import { expect, test } from '@playwright/test';
import { loginAsBootstrappedOwner } from './helpers/auth';
import { setupAccountingReady } from './helpers/accounting';
import { fillControlByTestId, setAntdDateByTestId } from './helpers/ui';

test.describe.serial('tutup buku akhir tahun', () => {
  test('CLS-01 - buat periode, kunci, dan posting tutup buku', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await setupAccountingReady(page);

    await page.goto('/finance/closing');
    await expect(page.getByText('Tutup Buku').first()).toBeVisible();

    // Buat periode tahunan.
    const periodName = 'Tahun Buku 2020';
    await fillControlByTestId(page, 'gl-closing-period-name', periodName);
    await setAntdDateByTestId(page, 'gl-closing-start-date', '2020-01-01');
    await setAntdDateByTestId(page, 'gl-closing-end-date', '2020-12-31');
    await page.getByTestId('gl-closing-create-period').click();

    const periodRow = page.getByRole('row', { name: new RegExp(periodName) });
    await expect(periodRow).toBeVisible();
    await expect(periodRow.getByText('Terbuka')).toBeVisible();

    // Kunci periode.
    await periodRow.getByRole('button', { name: 'Kunci', exact: true }).click();
    await expect(periodRow.getByText('Terkunci')).toBeVisible();

    // Buka preview tutup buku lalu posting.
    await periodRow.getByRole('button', { name: 'Tutup Buku', exact: true }).click();
    await expect(page.getByText('Preview Tutup Buku')).toBeVisible();

    const postButton = page.getByTestId('gl-closing-post');
    await expect(postButton).toBeEnabled();
    await postButton.click();

    // Periode menjadi CLOSED.
    await expect(page.getByRole('row', { name: new RegExp(periodName) }).getByText('Ditutup')).toBeVisible();

    // Riwayat tutup buku mencatat closing run POSTED.
    await page.getByRole('tab', { name: 'Riwayat Tutup Buku' }).click();
    await expect(page.getByRole('row', { name: new RegExp(periodName) }).getByText('POSTED')).toBeVisible();
  });
});
