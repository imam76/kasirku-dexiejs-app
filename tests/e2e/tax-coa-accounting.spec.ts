import { expect, test, type Page } from '@playwright/test';
import { loginAsBootstrappedOwner } from './helpers/auth';

async function prepareGlReadyFixture(page: Page) {
  await loginAsBootstrappedOwner(page);

  await page.evaluate(async () => {
    const { ensureAccountingDefaults } = await import('/src/services/chartOfAccountService.ts');
    const { db } = await import('/src/lib/db.ts');
    const now = new Date().toISOString();

    await ensureAccountingDefaults();

    const generalLedgerModule = await db.enabledModules.get('GENERAL_LEDGER');
    await db.enabledModules.put({
      ...generalLedgerModule,
      id: 'GENERAL_LEDGER',
      code: 'GENERAL_LEDGER',
      is_enabled: true,
      source: generalLedgerModule?.source ?? 'USER',
      created_at: generalLedgerModule?.created_at ?? now,
      updated_at: now,
      sync_status: 'pending',
      sync_error: undefined,
    });

    const generalLedgerSetting = await db.generalLedgerSetting.get('default');
    await db.generalLedgerSetting.put({
      ...generalLedgerSetting,
      id: 'default',
      is_ready: true,
      cutoff_date: '2026-01-01',
      inventory_policy: 'PERPETUAL_INVENTORY',
      activated_at: generalLedgerSetting?.activated_at ?? now,
      created_at: generalLedgerSetting?.created_at ?? now,
      updated_at: now,
      sync_status: 'pending',
      sync_error: undefined,
    });

    await db.products.put({
      id: 'tax-coa-product',
      name: 'Produk Pajak COA',
      category: 'non_consumable',
      purchase_unit: 'pcs',
      selling_unit: 'pcs',
      purchase_price: 60000,
      selling_price: 100000,
      stock: 100,
      sku: 'TAX-COA',
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
      sync_error: undefined,
    });
  });
}

test('posting invoice memakai akun pajak dari master tax COA', async ({ page }) => {
  await prepareGlReadyFixture(page);

  const result = await page.evaluate(async () => {
    let step = 'import modules';
    try {
      const { createSalesDocument, issueSalesDocument } = await import('/src/services/salesDocumentService.ts');
      const { createPurchaseDocument, issuePurchaseDocument } = await import('/src/services/purchaseDocumentService.ts');
      const { createTax } = await import('/src/services/taxService.ts');
      const { db } = await import('/src/lib/db.ts');

      const getPostedLines = async (sourceId: string, sourceEvent: string) => {
        const entry = await db.journalEntries
          .where('source_id')
          .equals(sourceId)
          .filter((candidate) => candidate.status === 'POSTED' && candidate.source_event === sourceEvent)
          .first();

        if (!entry) throw new Error(`Jurnal ${sourceEvent} untuk ${sourceId} tidak ditemukan.`);

        const lines = await db.journalEntryLines
          .where('journal_entry_id')
          .equals(entry.id)
          .toArray();

        return lines.map((line) => ({
          account_code: line.account_code,
          account_name: line.account_name,
          debit: line.debit,
          credit: line.credit,
        }));
      };

      step = 'create ppn tax';
      const ppn = await createTax({
        name: 'PPN 11%',
        code: 'PPN11',
        rate: 11,
        calculation_mode: 'EXCLUSIVE',
        tax_flow: 'ADDITIVE',
        sales_tax_account_id: 'output-tax',
        purchase_tax_account_id: 'input-tax',
        is_active: true,
      });

      step = 'create pph23 tax';
      const pph23 = await createTax({
        name: 'PPh 23 NPWP',
        code: 'PPH23',
        rate: 2,
        calculation_mode: 'EXCLUSIVE',
        tax_flow: 'WITHHOLDING',
        purchase_tax_account_id: 'pph23-payable',
        is_active: true,
      });

      step = 'create missing account tax';
      const missingAccountTax = await createTax({
        name: 'Tax Tanpa Akun',
        code: 'NOCOA',
        rate: 10,
        calculation_mode: 'EXCLUSIVE',
        tax_flow: 'ADDITIVE',
        is_active: true,
      });

      const lineItem = {
        product_id: 'tax-coa-product',
        product_name: 'Produk Pajak COA',
        unit: 'pcs',
        quantity: 1,
        price: 100000,
        purchase_price: 60000,
      };

      step = 'create sales invoice';
      const sales = await createSalesDocument({
        document: {
          type: 'SALES_INVOICE',
          customer_name: 'Customer PPN',
          document_date: '2026-07-08',
          due_date: '2026-07-15',
          payment_status: 'UNPAID',
          tax_id: ppn.id,
        },
        items: [lineItem],
      });

      step = 'issue sales invoice';
      await issueSalesDocument(sales.document.id);

      step = 'create purchase ppn invoice';
      const purchasePpn = await createPurchaseDocument({
        document: {
          type: 'PURCHASE_INVOICE',
          supplier_name: 'Supplier PPN',
          document_date: '2026-07-08',
          due_date: '2026-07-15',
          payment_status: 'UNPAID',
          tax_id: ppn.id,
        },
        items: [lineItem],
      });

      step = 'issue purchase ppn invoice';
      await issuePurchaseDocument(purchasePpn.document.id);

      step = 'create purchase pph invoice';
      const purchasePph = await createPurchaseDocument({
        document: {
          type: 'PURCHASE_INVOICE',
          supplier_name: 'Supplier PPh',
          document_date: '2026-07-08',
          due_date: '2026-07-15',
          payment_status: 'UNPAID',
          tax_id: pph23.id,
        },
        items: [lineItem],
      });

      step = 'issue purchase pph invoice';
      await issuePurchaseDocument(purchasePph.document.id);

      step = 'create missing account invoice';
      const missingAccount = await createSalesDocument({
        document: {
          type: 'SALES_INVOICE',
          customer_name: 'Customer Tax Tanpa Akun',
          document_date: '2026-07-08',
          due_date: '2026-07-15',
          payment_status: 'UNPAID',
          tax_id: missingAccountTax.id,
        },
        items: [lineItem],
      });

      step = 'issue missing account invoice';
      let missingAccountError = '';
      try {
        await issueSalesDocument(missingAccount.document.id);
      } catch (error) {
        missingAccountError = error instanceof Error ? error.message : String(error);
      }

      step = 'read result';
      return {
        ok: true,
        data: {
          salesDocument: await db.salesDocuments.get(sales.document.id),
          salesLines: await getPostedLines(sales.document.id, 'SALES_INVOICE_ISSUED'),
          purchasePpnDocument: await db.purchaseDocuments.get(purchasePpn.document.id),
          purchasePpnLines: await getPostedLines(purchasePpn.document.id, 'PURCHASE_INVOICE_ISSUED'),
          purchasePphDocument: await db.purchaseDocuments.get(purchasePph.document.id),
          purchasePphLines: await getPostedLines(purchasePph.document.id, 'PURCHASE_INVOICE_ISSUED'),
          missingAccountDocument: await db.salesDocuments.get(missingAccount.document.id),
          missingAccountError,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          name: error instanceof Error ? error.name : 'UnknownError',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          step,
        },
      };
    }
  });

  if (!result.ok) {
    throw new Error(`[${result.error.step}] ${result.error.name}: ${result.error.message}\n${result.error.stack ?? ''}`);
  }
  const data = result.data;

  expect(data.salesDocument?.tax_amount).toBe(11000);
  expect(data.salesLines).toEqual(expect.arrayContaining([
    expect.objectContaining({ account_code: '2100', account_name: 'PPN Keluaran', credit: 11000 }),
  ]));

  expect(data.purchasePpnDocument?.tax_amount).toBe(11000);
  expect(data.purchasePpnLines).toEqual(expect.arrayContaining([
    expect.objectContaining({ account_code: '1305', account_name: 'PPN Masukan', debit: 11000 }),
  ]));

  expect(data.purchasePphDocument?.tax_flow).toBe('WITHHOLDING');
  expect(data.purchasePphDocument?.tax_amount).toBe(2000);
  expect(data.purchasePphDocument?.total_amount).toBe(98000);
  expect(data.purchasePphLines).toEqual(expect.arrayContaining([
    expect.objectContaining({ account_code: '2000', account_name: 'Hutang Usaha', credit: 98000 }),
    expect.objectContaining({ account_code: '2120', account_name: 'PPh 23 Terutang', credit: 2000 }),
  ]));

  expect(data.missingAccountDocument?.status).toBe('DRAFT');
  expect(data.missingAccountError).toContain('Akun pajak penjualan belum diatur di master tax.');
});
