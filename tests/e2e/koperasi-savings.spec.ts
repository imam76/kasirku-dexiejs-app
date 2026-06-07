import { expect, test } from '@playwright/test';
import { setupAccountingReady } from './helpers/accounting';
import { loginAsBootstrappedOwner } from './helpers/auth';
import { demoMembers } from './helpers/data';
import {
  createActiveMember,
  expectSavingBalance,
  recordSaving,
} from './helpers/koperasi';

test.describe.serial('simpanan anggota koperasi', () => {
  test('SAV-01, SAV-04, SAV-06, SAV-07, SAV-09 - setoran, validasi pokok, penarikan, saldo, dan jurnal', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await setupAccountingReady(page);
    await createActiveMember(page, demoMembers.siti);

    await recordSaving(page, {
      member: demoMembers.siti,
      transactionType: 'DEPOSIT',
      savingType: 'POKOK',
      amount: 500_000,
    });
    await expectSavingBalance(page, demoMembers.siti, 'POKOK', 500_000);

    await recordSaving(page, {
      member: demoMembers.siti,
      transactionType: 'DEPOSIT',
      savingType: 'POKOK',
      amount: 500_000,
      expectedError: 'Simpanan pokok hanya boleh disetor satu kali per anggota.',
    });

    await recordSaving(page, {
      member: demoMembers.siti,
      transactionType: 'DEPOSIT',
      savingType: 'SUKARELA',
      amount: 300_000,
    });
    await recordSaving(page, {
      member: demoMembers.siti,
      transactionType: 'WITHDRAWAL',
      savingType: 'SUKARELA',
      amount: 100_000,
    });
    await expectSavingBalance(page, demoMembers.siti, 'SUKARELA', 200_000);

    await recordSaving(page, {
      member: demoMembers.siti,
      transactionType: 'WITHDRAWAL',
      savingType: 'SUKARELA',
      amount: 999_000,
      expectedError: 'Penarikan tidak boleh melebihi saldo simpanan sukarela.',
    });

    await page.goto('/finance/general-ledger');
    await expect(page.getByText(/Setoran simpanan POKOK KSU-001 - Siti Aminah/)).toBeVisible();
    await expect(page.getByText(/Penarikan simpanan SUKARELA KSU-001 - Siti Aminah/)).toBeVisible();
  });
});

