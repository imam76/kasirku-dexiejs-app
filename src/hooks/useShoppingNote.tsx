import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { shoppingItemSchema, type ShoppingItemFormData } from '@/lib/validations/shopping';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { db } from '@/lib/db';
import { enqueueFinanceTransactionsSync } from '@/services/financeTransactionSyncService';
import { recordStockPurchase } from '@/services/stockPurchaseService';
import type { FinanceTransaction, Product, ShoppingNoteItem, StockMutation } from '@/types';
import { konversiSatuanProduk, normalisasiHargaProduk } from '@/utils/pricing';
import { createStockMutation, enqueueStockMutations } from '@/services/stockMutationSyncService';

export const useShoppingNote = () => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<ShoppingNoteItem[]>([]);

  const { data: products = [], isLoading: isProductsLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      return await db.products.orderBy('name').toArray();
    },
  });

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
    const product = products.find((item) => item.id === productId);
    if (!product) return;

    setValue('product_id', product.id);
    setValue('unit', product.purchase_unit || 'pcs');
    setValue('unit_price', product.purchase_price ?? 0);
  };

  const addItem = (data: ShoppingItemFormData) => {
    const product = products.find((item) => item.id === data.product_id);
    if (!product) {
      message.warning('Produk tidak ditemukan');
      return;
    }

    const unitPrice = Number(data.unit_price);
    const quantity = Number(data.quantity);
    const subtotal = unitPrice * quantity;
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
      const shoppingNoteId = crypto.randomUUID();
      const stockMutations: StockMutation[] = [];
      const financeTransactionsToSync: FinanceTransaction[] = [];

      await db.transaction('rw', [db.shoppingNotes, db.products, db.stockPurchases, db.financeBalance, db.financeTransactions, db.chartOfAccounts, db.financeAccountMappings, db.enabledModules, db.journalEntries, db.journalEntryLines], async () => {
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

          if (product.purchase_price !== costPerStockUnit) {
            productUpdate.purchase_price = costPerStockUnit;
          }

          await db.products.update(product.id, productUpdate);

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
    products,
    isProductsLoading,
    removeItem,
    totalShopping,
    control,
    handleSubmit: handleSubmit(addItem),
    handleProductChange,
    errors,
    saveNote,
  };
};
