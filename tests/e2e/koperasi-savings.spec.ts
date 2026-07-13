import { expect, test } from '@playwright/test';
import { setupAccountingReady } from './helpers/accounting';
import { loginAsBootstrappedOwner } from './helpers/auth';
import { demoMembers } from './helpers/data';
import {
  createActiveMember,
  expectSavingBalance,
  recordOpeningSaving,
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
      savingType: 'WAJIB',
      amount: 120_000,
      transactionDate: '2025-12-31 08:00:00',
      expectedMutationType: 'OPENING_BALANCE',
    });
    await expectSavingBalance(page, demoMembers.siti, 'WAJIB', 120_000);

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
      expectedError: 'Penarikan tidak boleh melebihi saldo simpanan anggota Rp 200.000.',
    });

    await page.goto('/finance/general-ledger');
    await expect(page.getByText(/Setoran simpanan POKOK KSU-001 - Siti Aminah/)).toBeVisible();
    await expect(page.getByText(/Penarikan simpanan SUKARELA KSU-001 - Siti Aminah/)).toBeVisible();
  });

  test('SAV-OPEN-01, SAV-OPEN-05 - saldo awal simpanan tercatat sebagai mutasi historis dan duplikasi ditolak', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await createActiveMember(page, demoMembers.budi);

    await recordOpeningSaving(page, {
      member: demoMembers.budi,
      savingType: 'POKOK',
      amount: 500_000,
    });
    await expectSavingBalance(page, demoMembers.budi, 'POKOK', 500_000);

    await recordOpeningSaving(page, {
      member: demoMembers.budi,
      savingType: 'POKOK',
      amount: 250_000,
      expectedError: 'Saldo awal untuk anggota dan jenis simpanan ini sudah pernah dicatat.',
    });
    await expectSavingBalance(page, demoMembers.budi, 'POKOK', 500_000);
  });
});
