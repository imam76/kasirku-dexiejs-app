import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createStockSchema, type StockFormData } from '@/lib/validations/stock';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { App } from 'antd';
import { db } from '@/lib/db';
import { enqueueProductSync } from '@/services/syncQueueService';
import { enqueueFinanceTransactionsSync } from '@/services/financeTransactionSyncService';
import { recordStockPurchase } from '@/services/stockPurchaseService';
import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';
import type { FinanceTransaction, Product, ProductUnit } from '@/types';
import type { ProductCsvImportItem } from '@/utils/productsCsv';
import { buildSellableUnitsFromMappings, normalizeProductUnitMappings } from '@/utils/productUnits';
import { useI18n } from '@/hooks/useI18n';

export type { StockFormData };

type ProductUpsertData = Omit<Product, 'id' | 'created_at' | 'updated_at' | 'stock'> & {
  stock?: number;
};

const withPendingSync = (product: Product): Product => ({
  ...product,
  sync_status: 'pending',
  sync_error: undefined,
});

export const useStockManagement = () => {
  const queryClient = useQueryClient();
  const { modal, message } = App.useApp();
  const { t } = useI18n();
  const [editingId, setEditingId] = useState<string | null>(null);
  const stockSchema = useMemo(() => createStockSchema(t), [t]);
  
  const form = useForm<StockFormData>({
    resolver: zodResolver(stockSchema),
    defaultValues: {
      name: '',
      category: 'non_consumable',
      purchase_unit: 'pcs',
      selling_unit: 'pcs',
      purchase_price: undefined,
      selling_price: undefined,
      stock: undefined,
      sku: '',
      purchase_quantity: 0,
      wholesale_prices: [],
      sellable_units: ['pcs'],
      unit_mappings: [],
    },
  });

  const {
    reset,
    watch,
    setValue,
    control,
    trigger,
    getValues,
    formState: { errors },
  } = form;

  const liveProducts = useLiveQuery(
    () => db.products.orderBy('created_at').reverse().toArray(),
    [],
  );
  const products = liveProducts ?? [];
  const isLoading = liveProducts === undefined;

  // Upsert (add/update) mutation
  const upsertMutation = useMutation({
    mutationFn: async (productData: Omit<Product, 'id' | 'created_at' | 'updated_at'> & { purchase_quantity?: number }) => {
      const currentUser = await getCurrentSessionUser();
      requireRolePermission(currentUser?.role, 'STOCK_ACCESS');
      const purchase_quantity = productData.purchase_quantity || 0;
      const now = new Date().toISOString();
      let productId = editingId ?? '';
      const isEdit = Boolean(editingId);
      let syncedProduct: Product | null = null;
      const financeTransactionsToSync: FinanceTransaction[] = [];

      const unitMappings = normalizeProductUnitMappings({
        purchase_unit: productData.purchase_unit || 'pcs',
        selling_unit: productData.selling_unit || 'pcs',
        sellable_units: productData.sellable_units || [],
        unit_mappings: productData.unit_mappings || [],
      });

      const cleanData: ProductUpsertData = {
        name: productData.name,
        category: productData.category || 'non_consumable',
        purchase_unit: productData.purchase_unit || 'pcs',
        selling_unit: productData.selling_unit || 'pcs',
        purchase_price: productData.purchase_price ?? undefined,
        selling_price: productData.selling_price ?? undefined,
        sku: productData.sku,
        wholesale_prices: (productData.wholesale_prices || []).map((p) => ({
          min_quantity: Number(p.min_quantity),
          price: Number(p.price),
          price_type: p.price_type || 'unit',
        })),
        unit_mappings: unitMappings,
        sellable_units: buildSellableUnitsFromMappings({
          purchase_unit: productData.purchase_unit || 'pcs',
          selling_unit: productData.selling_unit || 'pcs',
          sellable_units: productData.sellable_units || [],
          unit_mappings: unitMappings,
        }),
      };

      // Only include stock if it's explicitly provided
      if (productData.stock !== undefined) {
        cleanData.stock = productData.stock;
      }

      await db.transaction('rw', [db.products, db.stockPurchases, db.financeBalance, db.financeTransactions, db.chartOfAccounts, db.financeAccountMappings, db.enabledModules, db.generalLedgerSetting, db.journalEntries, db.journalEntryLines], async () => {
        if (isEdit) {
          productId = editingId!;
          const existingProduct = await db.products.get(productId);
          if (!existingProduct) {
            throw new Error('Produk tidak ditemukan.');
          }

          // Update product
          const updatedProduct: Product = withPendingSync({
            ...existingProduct,
            ...cleanData,
            stock: cleanData.stock ?? existingProduct.stock,
            updated_at: now,
          });
          await db.products.put(updatedProduct);
          syncedProduct = updatedProduct;

          // Record purchase if stock was added
          if (purchase_quantity > 0) {
            const totalCost = cleanData.purchase_price * purchase_quantity;
            const purchaseResult = await recordStockPurchase({
              productId,
              productName: cleanData.name,
              sku: cleanData.sku,
              quantity: purchase_quantity,
              costPerUnit: cleanData.purchase_price,
              totalCost,
              description: t('stock.purchaseDescription', { name: cleanData.name, quantity: purchase_quantity }),
              createdAt: now,
              actor: currentUser,
            });
            financeTransactionsToSync.push(purchaseResult.financeTransaction);
          }
        } else {
          // Create new product
          const newId = crypto.randomUUID();
          productId = newId;
          const newProduct: Product = withPendingSync({
            id: newId,
            ...cleanData,
            stock: cleanData.stock ?? 0, // Ensure stock is set for new product
            created_at: now,
            updated_at: now,
          });

          await db.products.add(newProduct);
          syncedProduct = newProduct;

          // Record initial purchase if stock was added
          if (purchase_quantity > 0) {
            const totalCost = cleanData.purchase_price * purchase_quantity;
            const purchaseResult = await recordStockPurchase({
              productId: newId,
              productName: cleanData.name,
              sku: cleanData.sku,
              quantity: purchase_quantity,
              costPerUnit: cleanData.purchase_price,
              totalCost,
              description: t('stock.initialPurchaseDescription', { name: cleanData.name, quantity: purchase_quantity }),
              createdAt: now,
              actor: currentUser,
            });
            financeTransactionsToSync.push(purchaseResult.financeTransaction);
          }
        }
      });

      if (syncedProduct) {
        await enqueueProductSync(syncedProduct, isEdit ? 'update' : 'create');
      }
      if (financeTransactionsToSync.length > 0) {
        await enqueueFinanceTransactionsSync(financeTransactionsToSync, 'create');
      }

      await writeActivityLog({
        user: currentUser,
        action: isEdit ? 'PRODUCT_UPDATED' : 'PRODUCT_CREATED',
        entity: 'products',
        entity_id: productId,
        description: `${currentUser?.name ?? 'User'} ${isEdit ? 'memperbarui' : 'menambahkan'} produk ${cleanData.name}.`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseReport'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      queryClient.invalidateQueries({ queryKey: ['trialBalance'] });
      queryClient.invalidateQueries({ queryKey: ['incomeStatement'] });
      queryClient.invalidateQueries({ queryKey: ['balanceSheet'] });
      resetFormData();
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const currentUser = await getCurrentSessionUser();
      requireRolePermission(currentUser?.role, 'STOCK_ACCESS');
      const product = await db.products.get(id);
      const now = new Date().toISOString();
      const deletedProduct = product ? withPendingSync({
        ...product,
        updated_at: now,
      }) : null;

      await db.products.delete(id);

      await writeActivityLog({
        user: currentUser,
        action: 'PRODUCT_DELETED',
        entity: 'products',
        entity_id: id,
        description: `${currentUser?.name ?? 'User'} menghapus produk ${product?.name ?? id}.`,
      });
      if (deletedProduct) {
        await enqueueProductSync(deletedProduct, 'delete');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const importCsvMutation = useMutation({
    mutationFn: async (items: ProductCsvImportItem[]) => {
      const currentUser = await getCurrentSessionUser();
      requireRolePermission(currentUser?.role, 'STOCK_ACCESS');
      const now = new Date().toISOString();
      let createdCount = 0;
      let updatedCount = 0;
      const productsToSync: Array<{ product: Product; operation: 'create' | 'update' }> = [];
      const financeTransactionsToSync: FinanceTransaction[] = [];

      await db.transaction('rw', [db.products, db.stockPurchases, db.financeBalance, db.financeTransactions, db.chartOfAccounts, db.financeAccountMappings, db.enabledModules, db.generalLedgerSetting, db.journalEntries, db.journalEntryLines], async () => {
        for (const item of items) {
          let existing = null;
          if (item.sku) {
            existing = await db.products.where('sku').equals(item.sku).first();
          }
          if (!existing && item.id) {
            existing = await db.products.get(item.id);
          }

          const purchaseUnit = (item.purchase_unit || existing?.purchase_unit || 'pcs') as ProductUnit;
          const sellingUnit = (item.selling_unit || existing?.selling_unit || 'pcs') as ProductUnit;
          const unitMappings = normalizeProductUnitMappings({
            purchase_unit: purchaseUnit,
            selling_unit: sellingUnit,
            sellable_units: item.sellable_units || existing?.sellable_units || [],
            unit_mappings: item.unit_mappings || existing?.unit_mappings || [],
          });

          const cleanData = {
            name: item.name,
            category: item.category || existing?.category || 'non_consumable',
            purchase_unit: purchaseUnit,
            selling_unit: sellingUnit,
            purchase_price: item.purchase_price ?? 0,
            selling_price: item.selling_price ?? 0,
            stock: item.stock ?? 0,
            sku: item.sku || existing?.sku || '',
            wholesale_prices: (item.wholesale_prices || existing?.wholesale_prices || []).map((p) => ({
              min_quantity: Number(p.min_quantity),
              price: Number(p.price),
              price_type: p.price_type || 'unit',
            })),
            unit_mappings: unitMappings,
            sellable_units: buildSellableUnitsFromMappings({
              purchase_unit: purchaseUnit,
              selling_unit: sellingUnit,
              sellable_units: item.sellable_units && item.sellable_units.length > 0
                ? item.sellable_units
                : existing?.sellable_units || [],
              unit_mappings: unitMappings,
            }),
          };

          const purchase_quantity = item.purchase_quantity || 0;

          if (existing) {
            updatedCount += 1;
            const updatedProduct: Product = withPendingSync({
              ...existing,
              ...cleanData,
              updated_at: now,
            });
            await db.products.put(updatedProduct);
            productsToSync.push({ product: updatedProduct, operation: 'update' });

            if (purchase_quantity > 0) {
              const totalCost = cleanData.purchase_price * purchase_quantity;
              const purchaseResult = await recordStockPurchase({
                productId: existing.id,
                productName: cleanData.name,
                sku: cleanData.sku,
                quantity: purchase_quantity,
                costPerUnit: cleanData.purchase_price,
                totalCost,
                description: t('stock.importPurchaseDescription', { name: cleanData.name, quantity: purchase_quantity }),
                createdAt: now,
                actor: currentUser,
              });
              financeTransactionsToSync.push(purchaseResult.financeTransaction);
            }
          } else {
            createdCount += 1;
            const newId = item.id && item.id.length > 0 ? item.id : crypto.randomUUID();
            const newProduct: Product = withPendingSync({
              id: newId,
              ...cleanData,
              created_at: now,
              updated_at: now,
            });

            await db.products.add(newProduct);
            productsToSync.push({ product: newProduct, operation: 'create' });

            if (purchase_quantity > 0) {
              const totalCost = cleanData.purchase_price * purchase_quantity;
              const purchaseResult = await recordStockPurchase({
                productId: newId,
                productName: cleanData.name,
                sku: cleanData.sku,
                quantity: purchase_quantity,
                costPerUnit: cleanData.purchase_price,
                totalCost,
                description: t('stock.importInitialPurchaseDescription', { name: cleanData.name, quantity: purchase_quantity }),
                createdAt: now,
                actor: currentUser,
              });
              financeTransactionsToSync.push(purchaseResult.financeTransaction);
            }
          }
        }
      });

      await writeActivityLog({
        user: currentUser,
        action: 'PRODUCT_CSV_IMPORTED',
        entity: 'products',
        description: `${currentUser?.name ?? 'User'} mengimpor ${items.length} baris produk dari CSV. Produk baru: ${createdCount}, diperbarui: ${updatedCount}.`,
      });
      for (const { product, operation } of productsToSync) {
        await enqueueProductSync(product, operation);
      }
      if (financeTransactionsToSync.length > 0) {
        await enqueueFinanceTransactionsSync(financeTransactionsToSync, 'create');
      }
    },
    onSuccess: (_data, items) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseReport'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      queryClient.invalidateQueries({ queryKey: ['trialBalance'] });
      queryClient.invalidateQueries({ queryKey: ['incomeStatement'] });
      queryClient.invalidateQueries({ queryKey: ['balanceSheet'] });
      message.success(t('stock.importSuccess', { count: items.length }));
    },
  });

  const onSubmit = async (data: StockFormData) => {
    const sellableUnits = data.sellable_units && data.sellable_units.length > 0
      ? data.sellable_units
      : [data.selling_unit || 'pcs'];
    const defaultSellingUnit = sellableUnits[0] || data.selling_unit || 'pcs';

    await upsertMutation.mutateAsync({
      name: data.name,
      category: data.category,
      purchase_unit: data.purchase_unit,
      selling_unit: defaultSellingUnit,
      purchase_price: data.purchase_price,
      selling_price: data.selling_price,
      stock: data.stock,
      sku: data.sku || '',
      purchase_quantity: data.purchase_quantity || 0,
      wholesale_prices: data.wholesale_prices || [],
      sellable_units: sellableUnits,
      unit_mappings: data.unit_mappings || [],
    });
  };

  const submitForm = async () => {
    const isValid = await trigger();
    if (!isValid) {
      console.log('isValid', isValid, errors);
      return false;
    }
    const data = getValues();
    await onSubmit(data);
    return true;
  };

  const handleEdit = (product: Product) => {
    setEditingId(product.id);
    setValue('name', product.name);
    setValue('category', product.category || 'non_consumable');
    setValue('purchase_unit', product.purchase_unit);
    setValue('selling_unit', product.selling_unit);
    setValue('purchase_price', product.purchase_price);
    setValue('selling_price', product.selling_price);
    setValue('stock', product.stock);
    setValue('sku', product.sku || '');
    setValue('purchase_quantity', 0);
    setValue('wholesale_prices', (product.wholesale_prices || []).map(p => ({
      min_quantity: p.min_quantity,
      price: p.price,
      price_type: p.price_type
    })));
    setValue('sellable_units', product.sellable_units || [product.selling_unit]);
    setValue('unit_mappings', normalizeProductUnitMappings(product));
  };

  const handleDelete = (id: string) => {
    modal.confirm({
      title: t('stock.deleteTitle'),
      content: t('stock.deleteContent'),
      okText: t('stock.deleteOk'),
      cancelText: t('stock.form.cancel'),
      okType: 'danger',
      onOk: async () => {
        await deleteMutation.mutateAsync(id);
      },
    });
  };

  const resetFormData = () => {
    reset();
    setEditingId(null);
  };

  return {
    products,
    isLoading,
    editingId,
    control,
    handleSubmit: submitForm,
    handleEdit,
    handleDelete,
    resetForm: resetFormData,
    errors,
    watch,
    setValue,
    isSubmitting: upsertMutation.isPending,
    isDeleting: deleteMutation.isPending,
    importProductsFromCsv: (items: Parameters<typeof importCsvMutation.mutateAsync>[0]) =>
      importCsvMutation.mutateAsync(items),
    isImporting: importCsvMutation.isPending,
  };
};
