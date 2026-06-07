import { test } from '@playwright/test';
import { loginAsBootstrappedOwner } from './helpers/auth';
import {
  activateGeneralLedger,
  expectAccountingMappingReady,
  expectDefaultKspAccounts,
  expectGeneralLedgerReportsReady,
  postOpeningBalance,
} from './helpers/accounting';

test.describe.serial('setup accounting dasar KSU', () => {
  test('ACC-01 sampai ACC-07 - akun default, mapping, opening balance, aktivasi GL, dan report awal', async ({ page }) => {
    await loginAsBootstrappedOwner(page);

    await expectDefaultKspAccounts(page);
    await expectAccountingMappingReady(page);
    await postOpeningBalance(page);
    await activateGeneralLedger(page);
    await expectGeneralLedgerReportsReady(page);
  });
});

