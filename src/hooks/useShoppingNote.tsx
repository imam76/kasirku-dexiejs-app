import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { shoppingItemSchema, type ShoppingItemFormData } from '@/lib/validations/shopping';
import { useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { App } from 'antd';
import { db } from '@/lib/db';
import { getCurrentSessionUser } from '@/auth/authService';
import { enqueueFinanceTransactionsSync } from '@/services/financeTransactionSyncService';
import { recordStockPurchase } from '@/services/stockPurchaseService';
import type { FinanceTransaction, Product, ProductCategory, ShoppingNoteItem, StockMutation } from '@/types';
import { konversiSatuanProduk, normalisasiHargaProduk } from '@/utils/pricing';
import { createStockMutation, enqueueStockMutations } from '@/services/stockMutationSyncService';
import { addInventoryLot } from '@/utils/inventory/addInventoryLot';

type CreateBasicProductInput = {
  name: string;
  sku?: string;
  category?: ProductCategory;
  unit: string;
  purchasePrice?: number;
};

export const useShoppingNote = () => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<ShoppingNoteItem[]>([]);
  const [pendingProducts, setPendingProducts] = useState<Product[]>([]);

  const liveProducts = useLiveQuery(
    () => db.products.orderBy('name').toArray(),
    [],
  );
  const products = useMemo(() => liveProducts ?? [], [liveProducts]);
  const isProductsLoading = liveProducts === undefined;

  const allProducts = useMemo(() => {
    const map = new Map<string, Product>();
    for (const product of products) {
      map.set(product.id, product);
    }
    for (const product of pendingProducts) {
      map.set(product.id, product);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [products, pendingProducts]);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<ShoppingItemFormData>({
    resolver: zodResolver(shoppingItemSchema),
    defaultValues: {
      product_id: '',
      unit_price: undefined,
      quantity: 1,
      unit: 'pcs',
    },
  });

  const handleProductChange = (productId: string) => {
    const product = allProducts.find((item) => item.id === productId);
    if (!product) return;

    setValue('product_id', product.id);
    setValue('unit', product.purchase_unit || 'pcs');
    setValue('unit_price', product.purchase_price ?? 0);
  };

  const createBasicProduct = (input: CreateBasicProductInput) => {
    const name = input.name.trim();
    const sku = input.sku?.trim() || undefined;
    const category = input.category;
    const unit = input.unit.trim() || 'pcs';
    const purchasePrice = Number(input.purchasePrice || 0);

    if (!name) {
      message.warning('Nama produk wajib diisi');
      return undefined;
    }

    if (sku) {
      const skuLower = sku.toLowerCase();
      const existing = allProducts.find((product) => (product.sku || '').toLowerCase() === skuLower);
      if (existing) {
        message.info('Barcode/SKU sudah terdaftar, gunakan produk yang sudah ada');
        handleProductChange(existing.id);
        return existing.id;
      }
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const baseProduct: Product = {
      id,
      name,
      sku,
      category,
      purchase_unit: unit,
      selling_unit: unit,
      purchase_price: Number.isFinite(purchasePrice) ? purchasePrice : 0,
      selling_price: Number.isFinite(purchasePrice) ? purchasePrice : 0,
      stock: 0,
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
    };

    setPendingProducts((prev) => [...prev, baseProduct]);

    // Automatically select the newly created product in the form
    setValue('product_id', id);
    setValue('unit', unit);
    setValue('unit_price', purchasePrice);

    return id;
  };

  const addItem = (data: ShoppingItemFormData) => {
    const product = allProducts.find((item) => item.id === data.product_id);
    if (!product) {
      message.warning('Produk tidak ditemukan');
      return;
    }

    const now = new Date().toISOString();
    const unitPrice = Number(data.unit_price);
    const quantity = Number(data.quantity);
    const subtotal = unitPrice * quantity;

    setPendingProducts((prev) => {
      const pending = prev.find((p) => p.id === product.id);
      if (!pending) return prev;
      return prev.map((p) => p.id === product.id ? {
        ...p,
        purchase_unit: data.unit,
        selling_unit: data.unit,
        purchase_price: unitPrice,
        selling_price: unitPrice,
        updated_at: now,
      } : p);
    });

    const newItem: ShoppingNoteItem = {
      id: crypto.randomUUID(),
      product_id: product.id,
      product_name: product.name,
      sku: product.sku,
      unit_price: unitPrice,
      cost_per_unit: unitPrice,
      quantity,
      unit: data.unit,
      subtotal,
      total_cost: subtotal,
    };
    setItems((prev) => [...prev, newItem]);
    reset({
      product_id: '',
      unit_price: undefined,
      quantity: 1,
      unit: 'pcs',
    });
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const totalShopping = useMemo(() => {
    return items.reduce((acc, item) => acc + (item.total_cost ?? item.subtotal), 0);
  }, [items]);

  const saveNote = async () => {
    if (items.length === 0) {
      message.warning('Daftar belanja stok masih kosong');
      return;
    }

    try {
      const now = new Date().toISOString();
      const currentUser = await getCurrentSessionUser();
      const shoppingNoteId = crypto.randomUUID();
      const stockMutations: StockMutation[] = [];
      const financeTransactionsToSync: FinanceTransaction[] = [];

      await db.transaction('rw', [
        db.shoppingNotes,
        db.products,
        db.stockPurchases,
        db.financeBalance,
        db.financeTransactions,
        db.chartOfAccounts,
        db.financeAccountMappings,
        db.enabledModules,
        db.generalLedgerSetting,
        db.journalEntries,
        db.journalEntryLines,
        db.inventoryLots
      ], async () => {
        const itemsByProductId = new Map(items.map((item) => [item.product_id, item]));
        const productsToCreate = pendingProducts.filter((product) => itemsByProductId.has(product.id));

        for (const product of productsToCreate) {
          const item = itemsByProductId.get(product.id);
          const existing = await db.products.get(product.id);
          if (existing) continue;

          if (product.sku) {
            const sameSku = await db.products.where('sku').equals(product.sku).first();
            if (sameSku) {
              throw new Error(`Barcode/SKU ${product.sku} sudah terdaftar pada produk lain`);
            }
          }

          await db.products.add({
            ...product,
            purchase_price: Number(item?.unit_price ?? product.purchase_price),
            selling_price: Number(item?.unit_price ?? product.selling_price),
            purchase_unit: item?.unit ?? product.purchase_unit,
            selling_unit: item?.unit ?? product.selling_unit,
            created_at: now,
            updated_at: now,
          });
        }

        await db.shoppingNotes.add({
          id: shoppingNoteId,
          created_at: now,
          items,
          total_shopping: totalShopping,
        });

        for (const item of items) {
          const product = await db.products.get(item.product_id);
          if (!product) {
            throw new Error(`Produk ${item.product_name} tidak ditemukan`);
          }

          const quantityInStockUnit = konversiSatuanProduk(item.quantity, product, item.unit, product.purchase_unit);
          const costPerStockUnit = normalisasiHargaProduk(item.unit_price, product, item.unit, product.purchase_unit);
          const totalCost = item.total_cost ?? item.subtotal;

          const productUpdate: Partial<Product> = {
            stock: product.stock + quantityInStockUnit,
            updated_at: now,
          };

          // Update purchase_price as a UI reference for the next purchase form auto-fill.
          // This does NOT affect HPP calculation — FIFO lots are used instead.
          if (product.purchase_price !== costPerStockUnit) {
            productUpdate.purchase_price = costPerStockUnit;
          }

          await db.products.update(product.id, productUpdate);

          // Create a FIFO lot for this purchase batch
          await addInventoryLot({
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            sourceType: 'SHOPPING_NOTE',
            sourceId: shoppingNoteId,
            sourceLineId: item.id,
            quantityReceived: quantityInStockUnit,
            costPerUnit: costPerStockUnit,
            receivedAt: now,
          });

          if (quantityInStockUnit > 0) {
            stockMutations.push(createStockMutation({
              product,
              sourceType: 'SHOPPING_NOTE',
              sourceId: shoppingNoteId,
              sourceLineId: item.id,
              quantityDelta: quantityInStockUnit,
              sourceQuantity: item.quantity,
              sourceUnit: item.unit,
              occurredAt: now,
            }));
          }

          const purchaseResult = await recordStockPurchase({
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            quantity: quantityInStockUnit,
            costPerUnit: costPerStockUnit,
            totalCost,
            description: `Belanja Stok: ${product.name} (${item.quantity} ${item.unit})`,
            createdAt: now,
            actor: currentUser,
          });
          financeTransactionsToSync.push(purchaseResult.financeTransaction);
        }
      });

      await enqueueStockMutations(stockMutations);
      if (financeTransactionsToSync.length > 0) {
        await enqueueFinanceTransactionsSync(financeTransactionsToSync, 'create');
      }

      message.success('Belanja stok berhasil disimpan');
      setItems([]);
      setPendingProducts([]);
      queryClient.invalidateQueries({ queryKey: ['shoppingNotesHistory'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseReport'] });
      queryClient.invalidateQueries({ queryKey: ['financeTransactions'] });
      queryClient.invalidateQueries({ queryKey: ['financeBalance'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      queryClient.invalidateQueries({ queryKey: ['trialBalance'] });
      queryClient.invalidateQueries({ queryKey: ['incomeStatement'] });
      queryClient.invalidateQueries({ queryKey: ['balanceSheet'] });
    } catch (error) {
      console.error('Failed to save stock shopping:', error);
      message.error(error instanceof Error ? error.message : 'Gagal menyimpan belanja stok');
    }
  };

  return {
    items,
    products: allProducts,
    pendingProducts,
    isProductsLoading,
    removeItem,
    totalShopping,
    control,
    handleSubmit: handleSubmit(addItem),
    handleProductChange,
    createBasicProduct,
    errors,
    saveNote,
  };
};
