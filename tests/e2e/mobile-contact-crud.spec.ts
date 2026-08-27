import { expect, test } from '@playwright/test';
import { registerFirstOwner } from './helpers/auth';

test.describe('mobile contact CRUD standard', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('uses cards, sheets, a full-screen editor, and desktop fallback', async ({ page }) => {
    await registerFirstOwner(page);

    await page.evaluate(async () => {
      const { db } = await import('/src/lib/db.ts');
      const now = new Date().toISOString();
      await db.contacts.bulkPut(Array.from({ length: 21 }, (_, index) => ({
        id: `e2e-mobile-contact-${String(index + 1).padStart(2, '0')}`,
        name: index === 0 ? 'Budi Mobile' : `Contact Mobile ${String(index + 1).padStart(2, '0')}`,
        contact_type: index === 0 ? 'CUSTOMER_SUPPLIER' : 'CUSTOMER',
        company_name: index === 0 ? 'PT Mobile' : undefined,
        phone: index === 0 ? '08123456789' : undefined,
        email: index === 0 ? 'budi@example.com' : undefined,
        is_active: true,
        is_member: index === 0,
        membership_number: index === 0 ? 'MBR-MOBILE' : undefined,
        membership_status: index === 0 ? 'ACTIVE' : undefined,
        membership_points_balance: index === 0 ? 125 : undefined,
        created_at: new Date(Date.now() + index * 1000).toISOString(),
        updated_at: now,
        sync_status: 'pending',
      })));
    });

    await page.goto('/master-data/contacts');

    const pageHeader = page.getByTestId('mobile-contact-page-header');
    await expect(pageHeader).toBeVisible();
    await expect(pageHeader.getByTestId('global-breadcrumb')).toContainText('Home');
    await expect(page.locator('.ant-table')).toHaveCount(0);

    const mobileList = page.getByTestId('mobile-crud-list');
    await expect(mobileList.getByTestId('mobile-crud-item')).toHaveCount(20);
    await mobileList.getByRole('button', { name: /Muat lagi/ }).click();
    await expect(mobileList.getByTestId('mobile-crud-item')).toHaveCount(21);

    await page.getByRole('button', { name: 'Buka aksi untuk contact Budi Mobile' }).click();
    const actionSheet = page.getByRole('dialog').filter({ hasText: 'Budi Mobile' });
    await expect(actionSheet.getByRole('button', { name: /Edit/ })).toBeVisible();
    await expect(actionSheet.getByRole('button', { name: /Arsipkan/ })).toBeVisible();
    await actionSheet.getByRole('button', { name: /Edit/ }).click();

    const editEditor = page.getByRole('dialog').filter({ hasText: 'Edit Contact' });
    await expect(editEditor.getByLabel('Nama')).toHaveValue('Budi Mobile');
    const editorBox = await editEditor.boundingBox();
    expect(editorBox?.width).toBeCloseTo(390, 1);
    await editEditor.getByRole('button', { name: 'Batal' }).click();

    await page.getByRole('button', { name: 'Lihat detail contact Budi Mobile' }).click();
    const detailSheet = page.getByTestId('contact-detail-sheet');
    await expect(detailSheet).toContainText('PT Mobile');
    await expect(detailSheet).toContainText('125 poin');
    await detailSheet.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('dialog').filter({ hasText: 'Edit Contact' }).getByRole('button', { name: 'Batal' }).click();

    await page.getByTestId('contact-filter-fab').click();
    const filterSheet = page.getByRole('dialog').filter({ hasText: 'Filter Contact' });
    await expect(filterSheet.getByRole('searchbox', { name: 'Cari nama, company, telepon, atau email' })).toBeVisible();
    await filterSheet.getByRole('button', { name: 'Terapkan' }).click();

    await page.getByTestId('contact-add-fab').click();
    const createEditor = page.getByRole('dialog').filter({ hasText: 'Tambah Contact' });
    await expect(createEditor).toBeVisible();
    await createEditor.getByRole('button', { name: 'Batal' }).click();

    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      const hasHorizontalOverflow = await page.evaluate(() => (
        document.documentElement.scrollWidth > document.documentElement.clientWidth
      ));
      expect(hasHorizontalOverflow).toBe(false);
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByTestId('mobile-crud-list')).toHaveCount(0);
    await expect(page.locator('.ant-table')).toBeVisible();
  });
});
