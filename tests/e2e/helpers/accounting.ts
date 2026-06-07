import { expect, type Page } from '@playwright/test';
import { demoOpeningBalance } from './data';
import { fillControlByTestId } from './ui';

const requiredKspAccounts = [
  { code: '1010', name: 'Kas Tunai' },
  { code: '1020', name: 'Bank / Non Tunai' },
  { code: '1120', name: 'Piutang Pinjaman Anggota' },
  { code: '2300', name: 'Simpanan Anggota' },
  { code: '3000', name: 'Modal Pemilik' },
  { code: '4040', name: 'Pendapatan Bunga Pinjaman Anggota' },
  { code: '4050', name: 'Pendapatan Denda Pinjaman Anggota' },
] as const;

async function gotoOpeningBalancePage(page: Page, pageNumber: number) {
  const targetPage = page.locator(`li[title="${pageNumber}"]`).last();
  if (await targetPage.count()) {
    await targetPage.click();
  }
}

async function fillOpeningBalanceAmount(page: Page, accountCode: string, side: 'debit' | 'credit', amount: string) {
  const testId = `gl-opening-balance-${side}-${accountCode}`;
  await expect(page.getByTestId(testId)).toBeVisible();
  await fillControlByTestId(page, testId, amount);
}

export async function expectDefaultKspAccounts(page: Page) {
  await page.goto('/finance/chart-of-accounts');
  await expect(page.getByText('Daftar Akun').first()).toBeVisible();

  const search = page.getByPlaceholder('Cari kode, nama, parent, atau deskripsi akun...');
  for (const account of requiredKspAccounts) {
    await search.fill(account.code);
    await expect(page.getByText(account.code, { exact: true })).toBeVisible();
    await expect(page.getByText(account.name, { exact: true })).toBeVisible();
  }
  await search.fill('');
}

export async function expectAccountingMappingReady(page: Page) {
  await page.goto('/finance/chart-of-accounts');
  await page.getByRole('tab', { name: 'Mapping & Template' }).click();

  await expect(page.getByText('Profile & Template')).toBeVisible();
  await expect(page.getByText('SAK EMKM')).toBeVisible();
  await expect(page.getByTitle('Retail')).toBeVisible();
  await expect(page.getByText('Module Activation')).toBeVisible();
  await expect(page.getByTestId('accounting-module-general-ledger-switch')).toBeVisible();

  await expect(page.getByText('KSP Setoran Simpanan')).toBeVisible();
  await expect(page.getByText('KSP Penarikan Simpanan')).toBeVisible();
  await expect(page.getByText('KSP_PENCAIRAN_PINJAMAN')).toBeVisible();
  await expect(page.getByText('KSP_PEMBAYARAN_ANGSURAN')).toBeVisible();
}

export async function postOpeningBalance(page: Page) {
  await page.goto('/finance/general-ledger');
  await expect(page.getByText('Setup Cutoff dan Opening Balance')).toBeVisible();
  await expect(page.getByText('Readiness')).toBeVisible();

  await gotoOpeningBalancePage(page, 1);
  await fillOpeningBalanceAmount(page, '1010', 'debit', demoOpeningBalance[0].debit);

  await gotoOpeningBalancePage(page, 2);
  await fillOpeningBalanceAmount(page, '3000', 'credit', '4000000');
  await expect(page.getByText('Total debit dan kredit opening balance harus balance.')).toBeVisible();
  await expect(page.getByTestId('gl-opening-balance-post-button')).toBeDisabled();

  await gotoOpeningBalancePage(page, 1);
  await fillOpeningBalanceAmount(page, '1020', 'debit', demoOpeningBalance[1].debit);

  await gotoOpeningBalancePage(page, 2);
  await fillOpeningBalanceAmount(page, '3000', 'credit', demoOpeningBalance[2].credit);
  await expect(page.getByTestId('gl-opening-balance-post-button')).toBeEnabled();
  await page.getByTestId('gl-opening-balance-post-button').click();

  await expect(page.getByText('General Ledger belum aktif')).toBeVisible();
  await expect(page.getByText('Siap', { exact: true })).toBeVisible();
}

export async function activateGeneralLedger(page: Page) {
  await page.goto('/finance/chart-of-accounts');
  await page.getByRole('tab', { name: 'Mapping & Template' }).click();

  const generalLedgerSwitch = page.getByTestId('accounting-module-general-ledger-switch');
  await expect(generalLedgerSwitch).toBeVisible();

  if (await generalLedgerSwitch.getAttribute('aria-checked') !== 'true') {
    await generalLedgerSwitch.click();
  }

  await expect(generalLedgerSwitch).toHaveAttribute('aria-checked', 'true');
}

export async function expectGeneralLedgerReportsReady(page: Page) {
  await page.goto('/finance/general-ledger');

  await expect(page.getByText('Siap', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Jurnal' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Buku Besar' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Trial Balance' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Laba Rugi' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Neraca' })).toBeVisible();
}

export async function setupAccountingReady(page: Page) {
  await expectDefaultKspAccounts(page);
  await expectAccountingMappingReady(page);
  await postOpeningBalance(page);
  await activateGeneralLedger(page);
  await expectGeneralLedgerReportsReady(page);
}
