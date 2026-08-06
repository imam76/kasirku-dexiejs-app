import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createStockSchema, type StockFormData } from '@/lib/validations/stock';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { App } from 'antd';
import { db } from '@/lib/db';
import {
  buildProductSyncQueueItem,
  enqueueProductSync,
  processPendingSyncQueue,
} from '@/services/syncQueueService';
import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { createProductRecord } from '@/services/productCreateService';
import { updateProductRecord } from '@/services/productUpdateService';
import type { Product } from '@/types';
import type { ProductCsvImportItem } from '@/utils/productsCsv';
import {
  getProductSellableUnits,
  normalizeProductUnitMappings,
} from '@/utils/productUnits';
import { useI18n } from '@/hooks/useI18n';
import { buildProductMasterImportPlan } from '@/utils/productMasterImport';
import { DEFAULT_CONVERSIONS, normalizeUnitKey, resolveUnitCategory } from '@/constants/units';
import { materializeWholesalePriceUnits } from '@/utils/pricing';

export type { StockFormData };

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
  const { data: unitConversions = DEFAULT_CONVERSIONS } = useQuery({
    queryKey: ['unitConversions'],
    queryFn: () => db.unitConversions.toArray(),
  });

  // Validasi harus menilai satuan pakai master unit, bukan hanya daftar bawaan,
  // supaya satuan kemasan buatan pengguna tidak ditolak diam-diam.
  const unitDefinitions = useLiveQuery(() => db.units.toArray(), [], []);
  const unitTypeById = useMemo(
    () => new Map(unitDefinitions.map((unit) => [normalizeUnitKey(unit.id), unit.type])),
    [unitDefinitions],
  );
  const stockSchema = useMemo(
    () => createStockSchema(t, {
      globalConversions: unitConversions,
      getUnitCategory: (unit) => resolveUnitCategory(unit, unitTypeById.get(normalizeUnitKey(unit))),
    }),
    [t, unitConversions, unitTypeById],
  );


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
      product_type: 'FINISHED_GOOD',
      is_visible_in_pos: true,
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
    mutationFn: async (data: StockFormData) => (
      editingId ? updateProductRecord(editingId, data) : createProductRecord(data)
    ),
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
      await requireUserPermission(currentUser, 'PRODUCT_MANAGE');
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
      await requireUserPermission(currentUser, 'PRODUCT_MANAGE');
      const now = new Date().toISOString();
      let importPlan: ReturnType<typeof buildProductMasterImportPlan> | undefined;

      await db.transaction('rw', [db.products, db.syncQueue], async () => {
        importPlan = buildProductMasterImportPlan({
          items,
          existingProducts: await db.products.toArray(),
          now,
          globalConversions: unitConversions,
        });
        // Baris yang gagal digugurkan satu per satu, sisanya tetap masuk. Aman
        // karena master produk tidak membawa stok maupun kas.
        if (importPlan.items.length === 0) {
          throw new Error(
            importPlan.errors.length > 0
              ? importPlan.errors.join('\n')
              : 'Tidak ada baris yang bisa diimpor.',
          );
        }
        await db.products.bulkPut(importPlan.items.map((item) => item.product));
        await db.syncQueue.bulkAdd(importPlan.items.map(({ product, operation }) => (
          buildProductSyncQueueItem(product, operation, {
            // A row that is new on this device can still collide with an
            // existing remote ID. Master import must preserve remote stock in
            // both create and update cases.
            preserveStock: true,
            createdAt: now,
          })
        )));
      });

      if (!importPlan) {
        throw new Error('Rencana import master produk gagal dibuat.');
      }

      const skippedCount = importPlan.rowErrors.length;
      await writeActivityLog({
        user: currentUser,
        action: 'PRODUCT_CSV_IMPORTED',
        entity: 'products',
        description: `${currentUser?.name ?? 'User'} mengimpor ${importPlan.items.length} dari ${items.length} baris master produk tanpa mengubah stok atau kas. Produk baru: ${importPlan.createdCount}, diperbarui: ${importPlan.updatedCount}, dilewati: ${skippedCount}.`,
      });
      void processPendingSyncQueue();

      return {
        createdCount: importPlan.createdCount,
        updatedCount: importPlan.updatedCount,
        importedCount: importPlan.items.length,
        rowErrors: importPlan.rowErrors,
        rowWarnings: importPlan.rowWarnings,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      message.success(t('stock.importSuccess', { count: result.importedCount }));
    },
  });

  const onSubmit = async (data: StockFormData) => {
    // Turunan (satuan jual default, harga kosong -> 0, dst) ditangani di
    // createProductRecord/updateProductRecord supaya jalur create dan update
    // menempuh logika yang sama persis.
    await upsertMutation.mutateAsync(data);
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
    setValue('sku', product.sku || '');
    setValue('product_type', product.product_type ?? 'FINISHED_GOOD');
    setValue('is_visible_in_pos', product.is_visible_in_pos ?? true);
    setValue('purchase_quantity', 0);
    setValue('wholesale_prices', materializeWholesalePriceUnits(product, unitConversions).map(p => ({
      min_quantity: p.min_quantity,
      unit: p.unit || product.selling_unit || product.purchase_unit,
      price: p.price,
      price_type: p.price_type,
    })));
    setValue('sellable_units', getProductSellableUnits(product));
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
    getValues,
    reset,
    isSubmitting: upsertMutation.isPending,
    isDeleting: deleteMutation.isPending,
    importProductsFromCsv: (items: Parameters<typeof importCsvMutation.mutateAsync>[0]) =>
      importCsvMutation.mutateAsync(items),
    isImporting: importCsvMutation.isPending,
  };
};
