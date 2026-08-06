import { useMemo } from 'react';
import { App } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  buildProductSyncQueueItem,
  processPendingSyncQueue,
} from '@/services/syncQueueService';
import {
  getOpeningBalanceBatchId,
} from '@/services/openingBalanceService';
import { postInventoryOpeningBalance } from '@/services/openingInventoryBalanceService';
import {
  createPurchaseDocument,
  issuePurchaseDocument,
} from '@/services/purchaseDocumentService';
import type { OpeningBalanceBatch, Product } from '@/types';
import type { StockInLine } from '@/utils/stockIn/stockInCsv';
import {
  resolveStockInRouting,
  type StockInRouting,
} from '@/utils/stockIn/stockInRouting';
import {
  assertNewProductsCarryNoStock,
  buildOpeningBalanceLines,
  buildPurchasePayload,
} from '@/utils/stockIn/stockInPayload';

export interface StockInSubmitInput {
  documentDate: string;
  lines: StockInLine[];
  supplierName?: string;
  contactId?: string;
  notes?: string;
}

export interface StockInSubmitResult {
  mode: StockInRouting['mode'];
  documentNumber?: string;
  lineCount: number;
  totalValue: number;
}

const toDateOnly = (value: string) => value.slice(0, 10);

export const useStockIn = () => {
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  const products = useLiveQuery(() => db.products.orderBy('name').toArray(), [], [] as Product[]);
  const contacts = useLiveQuery(() => db.contacts.orderBy('name').toArray(), [], []);

  const setup = useLiveQuery(() => db.accountingInitialSetupSetting.get('default'), []);
  const ledgerSetting = useLiveQuery(() => db.generalLedgerSetting.get('default'), []);
  const cutoffDate = setup?.cutoff_date ?? ledgerSetting?.cutoff_date;

  const openingBatch = useLiveQuery(
    async (): Promise<OpeningBalanceBatch | undefined> => {
      if (!cutoffDate) return undefined;
      return db.openingBalanceBatches.get(getOpeningBalanceBatchId('INVENTORY', cutoffDate));
    },
    [cutoffDate],
  );

  const suppliers = useMemo(
    () => contacts.filter((contact) => (
      contact.is_active
      && (contact.contact_type === 'SUPPLIER' || contact.contact_type === 'CUSTOMER_SUPPLIER')
    )),
    [contacts],
  );

  const getRouting = (documentDate: string, hasFinalPrice: boolean) => resolveStockInRouting({
    documentDate,
    cutoffDate: cutoffDate ? toDateOnly(cutoffDate) : undefined,
    openingBatch,
    hasFinalPrice,
  });

  const invalidate = () => {
    for (const key of [
      'products',
      'purchaseDocuments',
      'stockCard',
      'journalEntries',
      'trialBalance',
      'balanceSheet',
      'openingBalances',
    ]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  /**
   * Products typed on the screen that do not exist yet are written here for the
   * opening route. The purchase route hands them to `createPurchaseDocument`
   * instead, which creates them inside the same transaction as the document.
   */
  const createMissingProducts = async (newProducts: Product[]) => {
    if (newProducts.length === 0) return;

    const now = new Date().toISOString();
    await db.transaction('rw', [db.products, db.syncQueue], async () => {
      for (const product of newProducts) {
        const existing = await db.products.get(product.id);
        if (existing) continue;

        if (product.sku) {
          const sameSku = await db.products.where('sku').equals(product.sku).first();
          if (sameSku) {
            throw new Error(`SKU ${product.sku} sudah terdaftar pada produk lain.`);
          }
        }

        // Stock always comes from the document, never from the product record.
        await db.products.add({ ...product, stock: 0, created_at: now, updated_at: now });
        await db.syncQueue.add(buildProductSyncQueueItem(product, 'create', {
          preserveStock: true,
          createdAt: now,
        }));
      }
    });

    void processPendingSyncQueue();
  };

  const submitMutation = useMutation({
    mutationFn: async ({
      documentDate,
      lines,
      supplierName,
      contactId,
      notes,
    }: StockInSubmitInput): Promise<StockInSubmitResult> => {
      if (lines.length === 0) {
        throw new Error('Belum ada barang yang diisi.');
      }
      assertNewProductsCarryNoStock(lines);

      const hasFinalPrice = lines.every((line) => line.costPerUnit !== undefined);
      const routing = getRouting(documentDate, hasFinalPrice);
      const newProducts = lines
        .filter((line) => line.isNewProduct)
        .map((line) => line.product);
      const totalValue = lines.reduce((sum, line) => sum + (line.totalValue ?? 0), 0);

      if (routing.mode === 'OPENING') {
        const missingPrice = lines.find((line) => line.costPerBaseUnit === undefined);
        if (missingPrice) {
          throw new Error(
            `Harga ${missingPrice.product.name} wajib diisi karena tanggal ini masuk saldo awal.`,
          );
        }

        await createMissingProducts(newProducts);
        await postInventoryOpeningBalance({
          lines: buildOpeningBalanceLines(lines),
          notes,
        });

        return { mode: 'OPENING', lineCount: lines.length, totalValue };
      }

      const { document, items } = buildPurchasePayload({
        lines,
        documentDate,
        documentType: routing.purchaseDocumentType ?? 'PURCHASE_RECEIPT',
        supplierName,
        contactId,
        notes,
      });

      const created = await createPurchaseDocument({
        document,
        items,
        pendingProducts: newProducts,
      });
      // Stock and the journal only move once the document is issued.
      await issuePurchaseDocument(created.document.id);

      return {
        mode: 'PURCHASE',
        documentNumber: created.document.document_number,
        lineCount: lines.length,
        totalValue,
      };
    },
    onSuccess: (result) => {
      invalidate();
      message.success(
        result.mode === 'OPENING'
          ? `Saldo awal persediaan tersimpan untuk ${result.lineCount} produk.`
          : `Stok masuk tersimpan sebagai ${result.documentNumber}.`,
      );
    },
  });

  return {
    products,
    suppliers,
    cutoffDate: cutoffDate ? toDateOnly(cutoffDate) : undefined,
    openingBatch,
    isLoading: products === undefined,
    getRouting,
    submitStockIn: submitMutation.mutateAsync,
    isSubmitting: submitMutation.isPending,
  };
};
