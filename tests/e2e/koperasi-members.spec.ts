import { test } from '@playwright/test';
import { loginAsBootstrappedOwner } from './helpers/auth';
import { demoMembers } from './helpers/data';
import { createActiveMember, expectDuplicateActiveMemberRejected } from './helpers/koperasi';

test.describe.serial('master anggota koperasi', () => {
  test('MEM-01, MEM-02 - tambah anggota aktif dan nomor anggota aktif unik', async ({ page }) => {
    await loginAsBootstrappedOwner(page);

    await createActiveMember(page, demoMembers.siti);
    await expectDuplicateActiveMemberRejected(page, demoMembers.siti);
  });
});

