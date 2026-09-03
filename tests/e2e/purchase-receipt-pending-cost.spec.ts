import { expect, test, type Page } from '@playwright/test';
import { registerFirstOwner } from './helpers/auth';

const PRODUCT_ID = 'e2e-pending-cost-product';
const RECEIPT_NUMBER = 'GR-E2E-PENDING-COST';

interface EstimatedSaleFixture {
  documentId: string;
  documentItemId: string;
  lotId: string;
  transactionId: string;
  transactionItemId: string;
  before: {
    documentCostStatus?: string;
    lotCostStatus?: string;
    lotCostPerUnit?: number;
    lotQuantityRemaining?: number;
    transactionItemHppStatus?: string;
    transactionItemProfitStatus?: string;
    transactionItemProfit?: number;
    warnings: string[];
  };
}

const prepareEstimatedReceiptAndSale = async (page: Page): Promise<EstimatedSaleFixture> => {
  await registerFirstOwner(page);
  await page.evaluate(() => {
    localStorage.setItem('feedback_wave1_submitted', 'true');
    localStorage.setItem('feedback_wave2_submitted', 'true');
  });

  return page.evaluate(async ({ productId, receiptNumber }) => {
    const [{ getCurrentSessionUser }, { db }, { createPurchaseDocument, issuePurchaseDocument }, { checkout }] = await Promise.all([
      import('/src/auth/authService.ts'),
      import('/src/lib/db.ts'),
      import('/src/services/purchaseDocumentService.ts'),
      import('/src/services/checkoutService.ts'),
    ]);
    const currentUser = await getCurrentSessionUser();
    if (!currentUser) throw new Error('Owner E2E belum memiliki sesi aktif.');

    const now = new Date().toISOString();
    await db.products.put({
      id: productId,
      name: 'Produk HPP Sementara E2E',
      category: 'consumable',
      purchase_unit: 'pcs',
      selling_unit: 'pcs',
      purchase_price: 10_000,
      selling_price: 20_000,
      stock: 0,
      sku: 'E2E-PENDING-COST',
      product_type: 'FINISHED_GOOD',
      is_visible_in_pos: true,
      sellable_units: ['pcs'],
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
    });

    await db.cashierSessions.where('cashier_user_id').equals(currentUser.id).delete();
    await db.cashierSessions.put({
      id: 'e2e-pending-cost-cashier-session',
      session_number: 'KS-E2E-PENDING-COST',
      status: 'OPEN',
      cashier_user_id: currentUser.id,
      cashier_user_name: currentUser.name,
      opened_at: now,
      opening_cash_amount: 0,
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
    });

    const paymentMethod = (await db.paymentMethods.toArray()).find((method) => (
      method.is_active &&
      method.category === 'CASH' &&
      Boolean(method.posting_account_id) &&
      !method.requires_reference
    ));
    if (!paymentMethod) throw new Error('Metode pembayaran tunai E2E tidak tersedia.');

    const receipt = await createPurchaseDocument({
      document: {
        type: 'PURCHASE_RECEIPT',
        status: 'DRAFT',
        document_number: receiptNumber,
        document_date: now.slice(0, 10),
        supplier_name: 'Supplier HPP Sementara E2E',
        cost_status: 'ESTIMATED',
      },
      items: [{
        id: 'e2e-pending-cost-receipt-item',
        document_id: '',
        product_id: productId,
        product_name: 'Produk HPP Sementara E2E',
        quantity: 10,
        received_quantity: 10,
        unit: 'pcs',
        price: 10_000,
        created_at: now,
      }],
    });
    await issuePurchaseDocument(receipt.document.id);

    const [issuedDocument, issuedItem, product, lot] = await Promise.all([
      db.purchaseDocuments.get(receipt.document.id),
      db.purchaseDocumentItems.where('document_id').equals(receipt.document.id).first(),
      db.products.get(productId),
      db.inventoryLots.where('source_id').equals(receipt.document.id).first(),
    ]);
    if (!issuedDocument || !issuedItem || !product || !lot) {
      throw new Error('Fixture penerimaan harga sementara tidak lengkap.');
    }

    const checkoutResult = await checkout({
      cart: [{ product, quantity: 4, unit: 'pcs' }],
      payments: [{ paymentMethodId: paymentMethod.id, tenderedAmount: 80_000 }],
    });
    const transactionItem = checkoutResult.items[0];
    const refreshedLot = await db.inventoryLots.get(lot.id);
    if (!transactionItem || !refreshedLot) throw new Error('Fixture penjualan harga sementara tidak lengkap.');

    return {
      documentId: issuedDocument.id,
      documentItemId: issuedItem.id,
      lotId: lot.id,
      transactionId: checkoutResult.transaction.id,
      transactionItemId: transactionItem.id,
      before: {
        documentCostStatus: issuedDocument.cost_status,
        lotCostStatus: refreshedLot.cost_status,
        lotCostPerUnit: refreshedLot.cost_per_unit,
        lotQuantityRemaining: refreshedLot.quantity_remaining,
        transactionItemHppStatus: transactionItem.hpp_status,
        transactionItemProfitStatus: transactionItem.profit_status,
        transactionItemProfit: transactionItem.profit,
        warnings: checkoutResult.warnings ?? [],
      },
    };
  }, { productId: PRODUCT_ID, receiptNumber: RECEIPT_NUMBER });
};

test('harga sementara: receipt issued, terjual di POS, lalu direkonsiliasi ke HPP final', async ({ page }) => {
  const fixture = await prepareEstimatedReceiptAndSale(page);

  expect(fixture.before).toMatchObject({
    documentCostStatus: 'ESTIMATED',
    lotCostStatus: 'ESTIMATED',
    lotCostPerUnit: 10_000,
    lotQuantityRemaining: 6,
    transactionItemHppStatus: 'ESTIMATED',
    transactionItemProfitStatus: 'ESTIMATED',
    transactionItemProfit: 40_000,
  });
  expect(fixture.before.warnings).toContain('HPP Produk HPP Sementara E2E masih memakai harga sementara.');

  await page.goto(`/purchases/gr/${fixture.documentId}/reconcile`);
  await expect(page.getByRole('heading', { name: 'Rekonsiliasi HPP' })).toBeVisible();
  await page.getByText('Nomor Invoice Supplier', { exact: true }).locator('..').getByRole('textbox').fill('INV-E2E-HPP-001');
  await page.getByRole('checkbox', { name: 'Pilih Produk HPP Sementara E2E untuk rekonsiliasi' }).check();
  await page.getByRole('spinbutton').last().fill('12000');
  await page.getByRole('button', { name: 'Simpan Rekonsiliasi' }).click();
  await expect(page).toHaveURL(new RegExp(`/purchases/gr/${fixture.documentId}$`));
  await expect(page.getByText('Harga Final', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('Riwayat Rekonsiliasi HPP', { exact: true })).toBeVisible();
  await expect(page.getByText('INV-E2E-HPP-001', { exact: true }).last()).toBeVisible();

  const after = await page.evaluate(async ({ documentId, documentItemId, lotId, transactionItemId }) => {
    const { db } = await import('/src/lib/db.ts');
    const [document, item, lot, transactionItem, reconciliations, reconciliationItems] = await Promise.all([
      db.purchaseDocuments.get(documentId),
      db.purchaseDocumentItems.get(documentItemId),
      db.inventoryLots.get(lotId),
      db.transactionItems.get(transactionItemId),
      db.purchaseCostReconciliations.where('purchase_document_id').equals(documentId).toArray(),
      db.purchaseCostReconciliationItems.toArray(),
    ]);

    return {
      document,
      item,
      lot,
      transactionItem,
      reconciliation: reconciliations[0],
      reconciliationItem: reconciliationItems.find((row) => row.purchase_document_item_id === documentItemId),
    };
  }, fixture);

  expect(after.document).toMatchObject({
    cost_status: 'FINAL',
    supplier_invoice_number: 'INV-E2E-HPP-001',
  });
  expect(after.item).toMatchObject({
    cost_status: 'FINAL',
    final_price: 12_000,
    final_landed_cost_per_unit: 12_000,
  });
  expect(after.lot).toMatchObject({
    cost_status: 'FINAL',
    cost_per_unit: 12_000,
    final_cost_per_unit: 12_000,
    quantity_remaining: 6,
  });
  expect(after.transactionItem).toMatchObject({
    purchase_price: 12_000,
    profit: 32_000,
    hpp_status: 'FINAL',
    profit_status: 'RECONCILED',
    hpp_variance_amount: 8_000,
  });
  expect(after.reconciliation).toMatchObject({
    total_estimated_cost: 100_000,
    total_final_cost: 120_000,
    total_variance_amount: 20_000,
    sold_cost_variance_amount: 8_000,
    remaining_stock_variance_amount: 12_000,
  });
  expect(after.reconciliationItem).toMatchObject({
    sold_quantity_at_reconciliation: 4,
    remaining_quantity_at_reconciliation: 6,
    sold_cost_variance_amount: 8_000,
    remaining_stock_variance_amount: 12_000,
  });
});

test('rekonsiliasi parsial hanya memfinalkan produk yang dipilih', async ({ page }) => {
  await registerFirstOwner(page);

  const fixture = await page.evaluate(async () => {
    const [{ db }, { createPurchaseDocument, issuePurchaseDocument }] = await Promise.all([
      import('/src/lib/db.ts'),
      import('/src/services/purchaseDocumentService.ts'),
    ]);
    const now = new Date().toISOString();
    const products = Array.from({ length: 5 }, (_, index) => {
      const number = index + 1;
      return {
        id: `e2e-mixed-cost-product-${number}`,
        name: `Produk Campuran ${number} E2E`,
        category: 'consumable',
        purchase_unit: 'pcs' as const,
        selling_unit: 'pcs' as const,
        purchase_price: number === 5 ? 11_000 : 10_000,
        selling_price: 20_000,
        stock: 0,
        sku: `E2E-MIXED-COST-${number}`,
        product_type: 'FINISHED_GOOD' as const,
        is_visible_in_pos: true,
        sellable_units: ['pcs' as const],
        created_at: now,
        updated_at: now,
        sync_status: 'pending' as const,
      };
    });
    await db.products.bulkPut(products);

    const receipt = await createPurchaseDocument({
      document: {
        type: 'PURCHASE_RECEIPT',
        status: 'DRAFT',
        document_number: 'GR-E2E-MIXED-COST',
        document_date: now.slice(0, 10),
        supplier_name: 'Supplier Campuran E2E',
        cost_status: 'FINAL',
      },
      items: products.map((product, index) => {
        const number = index + 1;
        const isEstimated = number === 3 || number === 5;
        return {
          id: `e2e-mixed-cost-line-${number}`,
          document_id: '',
          product_id: product.id,
          product_name: product.name,
          quantity: 10,
          received_quantity: 10,
          unit: 'pcs' as const,
          price: number === 5 ? 11_000 : 10_000,
          cost_status: isEstimated ? 'ESTIMATED' as const : 'FINAL' as const,
          created_at: now,
        };
      }),
    });
    await issuePurchaseDocument(receipt.document.id);

    return {
      documentId: receipt.document.id,
      selectedItemId: 'e2e-mixed-cost-line-3',
      untouchedItemId: 'e2e-mixed-cost-line-5',
      selectedProductId: 'e2e-mixed-cost-product-3',
      untouchedProductId: 'e2e-mixed-cost-product-5',
    };
  });

  await page.goto(`/purchases/gr/${fixture.documentId}/reconcile`);
  await expect(page.getByRole('heading', { name: 'Rekonsiliasi HPP' })).toBeVisible();
  await expect(page.getByText('Produk Campuran 3 E2E', { exact: true })).toBeVisible();
  await expect(page.getByText('Produk Campuran 5 E2E', { exact: true })).toBeVisible();

  await page.getByRole('checkbox', { name: 'Pilih Produk Campuran 3 E2E untuk rekonsiliasi' }).check();
  await expect(page.getByText('1 dari 2 produk dipilih', { exact: true })).toBeVisible();
  const selectedRow = page.getByRole('row', { name: /Produk Campuran 3 E2E/ });
  await selectedRow.getByRole('spinbutton').fill('12000');
  await page.getByRole('button', { name: 'Simpan Rekonsiliasi' }).click();
  await expect(page).toHaveURL(new RegExp(`/purchases/gr/${fixture.documentId}$`));

  const after = await page.evaluate(async (input) => {
    const { db } = await import('/src/lib/db.ts');
    const [document, selectedItem, untouchedItem, selectedLot, untouchedLot, reconciliations, reconciliationItems] = await Promise.all([
      db.purchaseDocuments.get(input.documentId),
      db.purchaseDocumentItems.get(input.selectedItemId),
      db.purchaseDocumentItems.get(input.untouchedItemId),
      db.inventoryLots.where('product_id').equals(input.selectedProductId).first(),
      db.inventoryLots.where('product_id').equals(input.untouchedProductId).first(),
      db.purchaseCostReconciliations.where('purchase_document_id').equals(input.documentId).toArray(),
      db.purchaseCostReconciliationItems.toArray(),
    ]);

    return {
      document,
      selectedItem,
      untouchedItem,
      selectedLot,
      untouchedLot,
      reconciliation: reconciliations[0],
      reconciliationItems: reconciliationItems.filter((item) => item.reconciliation_id === reconciliations[0]?.id),
    };
  }, fixture);

  expect(after.document).toMatchObject({ cost_status: 'ESTIMATED' });
  expect(after.selectedItem).toMatchObject({ cost_status: 'FINAL', final_price: 12_000 });
  expect(after.untouchedItem).toMatchObject({ cost_status: 'ESTIMATED', estimated_price: 11_000 });
  expect(after.selectedLot).toMatchObject({ cost_status: 'FINAL', cost_per_unit: 12_000 });
  expect(after.untouchedLot).toMatchObject({ cost_status: 'ESTIMATED', cost_per_unit: 11_000 });
  expect(after.reconciliation).toMatchObject({
    total_estimated_cost: 100_000,
    total_final_cost: 120_000,
    total_variance_amount: 20_000,
  });
  expect(after.reconciliationItems).toHaveLength(1);
  expect(after.reconciliationItems[0]).toMatchObject({ purchase_document_item_id: fixture.selectedItemId });
});

test('harga belum ada tidak dapat diterbitkan menjadi stok jual', async ({ page }) => {
  await registerFirstOwner(page);

  const issueError = await page.evaluate(async () => {
    const [{ db }, { createPurchaseDocument, issuePurchaseDocument }] = await Promise.all([
      import('/src/lib/db.ts'),
      import('/src/services/purchaseDocumentService.ts'),
    ]);
    const now = new Date().toISOString();
    await db.products.put({
      id: 'e2e-pending-cost-blocked-product',
      name: 'Produk Pending Tidak Boleh Jual E2E',
      category: 'consumable',
      purchase_unit: 'pcs',
      selling_unit: 'pcs',
      purchase_price: 0,
      selling_price: 20_000,
      stock: 0,
      sku: 'E2E-PENDING-BLOCKED',
      product_type: 'FINISHED_GOOD',
      is_visible_in_pos: true,
      sellable_units: ['pcs'],
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
    });
    const receipt = await createPurchaseDocument({
      document: {
        type: 'PURCHASE_RECEIPT',
        status: 'DRAFT',
        document_number: 'GR-E2E-PENDING-BLOCKED',
        document_date: now.slice(0, 10),
        supplier_name: 'Supplier Pending E2E',
        cost_status: 'FINAL',
      },
      items: [{
        id: 'e2e-pending-cost-blocked-item',
        document_id: '',
        product_id: 'e2e-pending-cost-blocked-product',
        product_name: 'Produk Pending Tidak Boleh Jual E2E',
        quantity: 1,
        received_quantity: 1,
        unit: 'pcs',
        price: 0,
        cost_status: 'PENDING',
        created_at: now,
      }],
    });

    try {
      await issuePurchaseDocument(receipt.document.id);
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });

  expect(issueError).toContain('belum ada');
});
