import { expect, test, type Page } from '@playwright/test';
import { setupAccountingReady } from './helpers/accounting';
import { loginAsBootstrappedOwner } from './helpers/auth';
import { demoMembers } from './helpers/data';
import {
  createActiveMember,
  expectSavingBalance,
  expectSavingInterest,
  recordOpeningSaving,
  recordSaving,
} from './helpers/koperasi';

async function seedCooperativeGeneralLedger(page: Page) {
  await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    const now = new Date().toISOString();
    const cutoffDate = now.slice(0, 10);
    const cutoffYear = cutoffDate.slice(0, 4);

    await db.transaction(
      'rw',
      [db.enabledModules, db.generalLedgerSetting, db.accountingPeriods],
      async () => {
        await db.enabledModules.put({
          id: 'GENERAL_LEDGER',
          code: 'GENERAL_LEDGER',
          is_enabled: true,
          source: 'USER',
          created_at: now,
          updated_at: now,
          sync_status: 'pending',
        });
        await db.generalLedgerSetting.put({
          id: 'default',
          is_ready: true,
          cutoff_date: `${cutoffDate}T00:00:00.000`,
          inventory_policy: 'PERPETUAL_INVENTORY',
          activated_at: now,
          created_at: now,
          updated_at: now,
          sync_status: 'pending',
        });
        await db.accountingPeriods.put({
          id: `e2e-cooperative-period-${cutoffYear}`,
          name: `Tahun Buku ${cutoffYear}`,
          period_type: 'YEARLY',
          start_date: `${cutoffYear}-01-01`,
          end_date: `${cutoffYear}-12-31`,
          status: 'OPEN',
          version: 1,
          created_at: now,
          updated_at: now,
          sync_status: 'pending',
        });
      },
    );
  });
}

async function seedActiveCooperativeMember(
  page: Page,
  member: {
    memberNumber: string;
    name: string;
    identityNumber: string;
    phone: string;
    address: string;
  },
) {
  await page.evaluate(async (memberInput) => {
    const { db } = await import('/src/lib/db.ts');
    const now = new Date().toISOString();
    await db.cooperativeMembers.put({
      id: `e2e-${memberInput.memberNumber}`,
      member_number: memberInput.memberNumber,
      name: memberInput.name,
      identity_number: memberInput.identityNumber,
      phone: memberInput.phone,
      address: memberInput.address,
      join_date: now,
      status: 'ACTIVE',
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
    });
  }, member);
}

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
    await seedCooperativeGeneralLedger(page);
    await seedActiveCooperativeMember(page, demoMembers.budi);

    await recordOpeningSaving(page, {
      member: demoMembers.budi,
      savingType: 'POKOK',
      amount: 500_000,
      openingInterest: 25_000,
    });
    await expectSavingBalance(page, demoMembers.budi, 'POKOK', 500_000);
    await expectSavingInterest(page, demoMembers.budi, 'POKOK', 25_000);

    const openingJournal = await page.evaluate(async (memberNumber) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('KasirkuDB');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const transaction = database.transaction(
        ['cooperativeSavingTransactions', 'journalEntryLines'],
        'readonly',
      );
      const readAll = (storeName: string) => new Promise<unknown[]>((resolve, reject) => {
        const request = transaction.objectStore(storeName).getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const [savingRecords, lineRecords] = await Promise.all([
        readAll('cooperativeSavingTransactions'),
        readAll('journalEntryLines'),
      ]);
      database.close();

      const opening = (savingRecords as Array<{
        member_number: string;
        transaction_type: string;
        journal_entry_id?: string;
        opening_interest_amount?: number;
      }>).find((record) => (
        record.member_number === memberNumber &&
        record.transaction_type === 'OPENING_BALANCE'
      ));
      const lines = (lineRecords as Array<{
        journal_entry_id: string;
        debit: number;
        credit: number;
      }>).filter((line) => line.journal_entry_id === opening?.journal_entry_id);

      return {
        openingInterestAmount: opening?.opening_interest_amount,
        debit: lines.reduce((sum, line) => sum + Number(line.debit || 0), 0),
        credit: lines.reduce((sum, line) => sum + Number(line.credit || 0), 0),
        creditAmounts: lines.filter((line) => Number(line.credit || 0) > 0).map((line) => line.credit),
      };
    }, demoMembers.budi.memberNumber);
    expect(openingJournal.openingInterestAmount).toBe(25_000);
    expect(openingJournal.debit).toBe(525_000);
    expect(openingJournal.credit).toBe(525_000);
    expect(openingJournal.creditAmounts).toEqual(expect.arrayContaining([500_000, 25_000]));

    await page.goto('/koperasi/migrasi-simpanan');
    await page.getByTestId('koperasi-saving-opening-add-button').click();
    await expect(page.getByTestId('koperasi-saving-opening-interest-input')).toBeDisabled();
    await page.locator('.ant-modal').getByRole('button', { name: 'Cancel' }).click();

    await recordOpeningSaving(page, {
      member: demoMembers.budi,
      savingType: 'POKOK',
      amount: 250_000,
      openingInterest: 10_000,
      expectedError: 'Saldo awal untuk anggota dan jenis simpanan ini sudah pernah dicatat.',
    });
    await expectSavingBalance(page, demoMembers.budi, 'POKOK', 500_000);
  });

  test('SAV-OPEN-06 - jasa historis dapat dicatat tanpa saldo pokok dan dipakai lebih dulu', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await seedCooperativeGeneralLedger(page);
    await seedActiveCooperativeMember(page, demoMembers.budi);

    await recordOpeningSaving(page, {
      member: demoMembers.budi,
      savingType: 'SUKARELA',
      amount: 0,
      openingInterest: 25_000,
    });
    await expectSavingBalance(page, demoMembers.budi, 'SUKARELA', 0);
    await expectSavingInterest(page, demoMembers.budi, 'SUKARELA', 25_000);

    await page.evaluate(async (memberNumber) => {
      const { db } = await import('/src/lib/db.ts');
      const { recordCooperativeSaving } = await import('/src/services/cooperativeSavingService.ts');
      const member = await db.cooperativeMembers
        .where('member_number')
        .equals(memberNumber)
        .first();
      if (!member) throw new Error('Fixture anggota tidak ditemukan.');

      await recordCooperativeSaving({
        member_id: member.id,
        saving_type: 'SUKARELA',
        transaction_type: 'WITHDRAWAL',
        withdrawal_source: 'INTEREST',
        amount: 10_000,
        transaction_date: new Date().toISOString(),
        payment_method: 'TUNAI',
        cash_account_id: 'cash',
      });
    }, demoMembers.budi.memberNumber);

    await expectSavingBalance(page, demoMembers.budi, 'SUKARELA', 0);
    await expectSavingInterest(page, demoMembers.budi, 'SUKARELA', 15_000);

    const payout = await page.evaluate(async (memberNumber) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('KasirkuDB');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const transaction = database.transaction(
        ['cooperativeSavingTransactions', 'journalEntryLines'],
        'readonly',
      );
      const readAll = (storeName: string) => new Promise<unknown[]>((resolve, reject) => {
        const request = transaction.objectStore(storeName).getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const [savingRecords, lineRecords] = await Promise.all([
        readAll('cooperativeSavingTransactions'),
        readAll('journalEntryLines'),
      ]);
      database.close();

      const withdrawal = (savingRecords as Array<{
        id: string;
        member_number: string;
        transaction_type: string;
        withdrawal_source?: string;
        journal_entry_id?: string;
        opening_interest_applied_amount?: number;
      }>).find((record) => (
        record.member_number === memberNumber &&
        record.transaction_type === 'WITHDRAWAL' &&
        record.withdrawal_source === 'INTEREST'
      ));
      const lines = (lineRecords as Array<{
        journal_entry_id: string;
        account_code: string;
        debit: number;
        credit: number;
      }>).filter((line) => line.journal_entry_id === withdrawal?.journal_entry_id);

      return {
        withdrawalId: withdrawal?.id,
        appliedAmount: withdrawal?.opening_interest_applied_amount,
        expenseDebit: lines
          .filter((line) => line.account_code === '6095')
          .reduce((sum, line) => sum + Number(line.debit || 0), 0),
        debit: lines.reduce((sum, line) => sum + Number(line.debit || 0), 0),
        credit: lines.reduce((sum, line) => sum + Number(line.credit || 0), 0),
      };
    }, demoMembers.budi.memberNumber);

    expect(payout.appliedAmount).toBe(10_000);
    expect(payout.expenseDebit).toBe(0);
    expect(payout.debit).toBe(10_000);
    expect(payout.credit).toBe(10_000);

    await page.goto('/koperasi/migrasi-simpanan');
    const openingRow = page.getByTestId(
      `koperasi-saving-opening-row-${demoMembers.budi.memberNumber}-SUKARELA`,
    );
    await openingRow.getByRole('button', { name: 'Reversal' }).click();
    let reversalModal = page.locator('.ant-modal-confirm').last();
    await reversalModal.locator('textarea').fill('Tidak boleh karena jasa sudah dipakai');
    await reversalModal.getByRole('button', { name: 'Reversal' }).click();
    await expect(page.getByText('Saldo awal tidak dapat direversal karena jasa historisnya sudah digunakan.'))
      .toBeVisible();
    await reversalModal.getByRole('button', { name: 'Batal' }).click();

    await page.goto('/koperasi/simpanan');
    await page.getByTestId(`koperasi-saving-reverse-${payout.withdrawalId}`).click();
    reversalModal = page.locator('.ant-modal-confirm').last();
    await reversalModal.locator('textarea').fill('Koreksi pengambilan jasa');
    await reversalModal.getByRole('button', { name: 'Reversal' }).click();
    await expect(page.getByText('Transaksi simpanan berhasil direversal.')).toBeVisible();

    await page.goto('/koperasi/migrasi-simpanan');
    await openingRow.getByRole('button', { name: 'Reversal' }).click();
    reversalModal = page.locator('.ant-modal-confirm').last();
    await reversalModal.locator('textarea').fill('Koreksi saldo awal');
    await reversalModal.getByRole('button', { name: 'Reversal' }).click();
    await expect(page.getByText('Saldo awal simpanan berhasil direversal.')).toBeVisible();
    await expect(openingRow).toContainText('Reversed');
    await expectSavingBalance(page, demoMembers.budi, 'SUKARELA', 0);
    await expectSavingInterest(page, demoMembers.budi, 'SUKARELA', 0);
  });
});
