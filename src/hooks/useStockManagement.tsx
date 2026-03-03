import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { db } from '@/lib/db';
import { Product, StockPurchase, WholesalePrice } from '@/types';
import type { ProductCsvImportItem } from '@/utils/productsCsv';

export interface StockFormData {
  name: string;
  purchase_price: number | undefined;
  selling_price: number | undefined;
  stock: number | undefined;
  sku: string;
  purchase_quantity?: number | undefined;
  wholesale_prices?: WholesalePrice[];
}

export const useStockManagement = () => {
  const queryClient = useQueryClient();
  const { modal, message } = App.useApp();
  const [editingId, setEditingId] = useState<string | null>(null);
  const {
    handleSubmit,
    reset,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<StockFormData>({
    defaultValues: {
      name: '',
      purchase_price: undefined,
      selling_price: undefined,
      stock: undefined,
      sku: '',
      purchase_quantity: undefined,
      wholesale_prices: [],
    },
  });

  // Fetch products query
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      return await db.products.orderBy('created_at').reverse().toArray();
    },
  });

  // Upsert (add/update) mutation
  const upsertMutation = useMutation({
    mutationFn: async (productData: Omit<Product, 'id' | 'created_at' | 'updated_at'> & { purchase_quantity?: number }) => {
      const purchase_quantity = productData.purchase_quantity || 0;
      const now = new Date().toISOString();

      const cleanData = {
        name: productData.name,
        purchase_price: productData.purchase_price ?? 0,
        selling_price: productData.selling_price ?? 0,
        stock: productData.stock ?? 0,
        sku: productData.sku,
        wholesale_prices: (productData.wholesale_prices || []).map((p) => ({
          min_quantity: Number(p.min_quantity),
          price: Number(p.price),
          price_type: p.price_type || 'unit',
        })),
      };

      await db.transaction('rw', db.products, db.stockPurchases, async () => {
        if (editingId) {
          // Update product
          await db.products.update(editingId, {
            ...cleanData,
            updated_at: now,
          });

          // Record purchase if stock was added
          if (purchase_quantity > 0) {
            const purchase: StockPurchase = {
              id: crypto.randomUUID(),
              product_id: editingId,
              product_name: cleanData.name,
              sku: cleanData.sku,
              quantity: purchase_quantity,
              cost_per_unit: cleanData.purchase_price,
              total_cost: cleanData.purchase_price * purchase_quantity,
              created_at: now,
              updated_at: now,
            };
            await db.stockPurchases.add(purchase);
          }
        } else {
          // Create new product
          const newId = crypto.randomUUID();
          const newProduct: Product = {
            id: newId,
            ...cleanData,
            created_at: now,
            updated_at: now,
          };

          await db.products.add(newProduct);

          // Record initial purchase if stock was added
          if (purchase_quantity > 0) {
            const purchase: StockPurchase = {
              id: crypto.randomUUID(),
              product_id: newId,
              product_name: cleanData.name,
              sku: cleanData.sku,
              quantity: purchase_quantity,
              cost_per_unit: cleanData.purchase_price,
              total_cost: cleanData.purchase_price * purchase_quantity,
              created_at: now,
              updated_at: now,
            };
            await db.stockPurchases.add(purchase);
          }
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseReport'] });
      resetFormData();
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await db.products.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const importCsvMutation = useMutation({
    mutationFn: async (items: ProductCsvImportItem[]) => {
      const now = new Date().toISOString();

      await db.transaction('rw', db.products, db.stockPurchases, async () => {
        for (const item of items) {
          const cleanData = {
            name: item.name,
            purchase_price: item.purchase_price ?? 0,
            selling_price: item.selling_price ?? 0,
            stock: item.stock ?? 0,
            sku: item.sku,
          };

          const purchase_quantity = item.purchase_quantity || 0;
          const existing = await db.products.where('sku').equals(cleanData.sku).first();

          if (existing) {
            await db.products.update(existing.id, {
              ...cleanData,
              updated_at: now,
            });

            if (purchase_quantity > 0) {
              const purchase: StockPurchase = {
                id: crypto.randomUUID(),
                product_id: existing.id,
                product_name: cleanData.name,
                sku: cleanData.sku,
                quantity: purchase_quantity,
                cost_per_unit: cleanData.purchase_price,
                total_cost: cleanData.purchase_price * purchase_quantity,
                created_at: now,
                updated_at: now,
              };
              await db.stockPurchases.add(purchase);
            }
          } else {
            const newId = item.id && item.id.length > 0 ? item.id : crypto.randomUUID();
            const newProduct: Product = {
              id: newId,
              ...cleanData,
              created_at: now,
              updated_at: now,
            };

            await db.products.add(newProduct);

            if (purchase_quantity > 0) {
              const purchase: StockPurchase = {
                id: crypto.randomUUID(),
                product_id: newId,
                product_name: cleanData.name,
                sku: cleanData.sku,
                quantity: purchase_quantity,
                cost_per_unit: cleanData.purchase_price,
                total_cost: cleanData.purchase_price * purchase_quantity,
                created_at: now,
                updated_at: now,
              };
              await db.stockPurchases.add(purchase);
            }
          }
        }
      });
    },
    onSuccess: (_data, items) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseReport'] });
      message.success(`Import CSV selesai (${items.length} baris).`);
    },
  });

  const onSubmit = async (data: StockFormData) => {
    await upsertMutation.mutateAsync({
      name: data.name,
      purchase_price: data.purchase_price ?? 0,
      selling_price: data.selling_price ?? 0,
      stock: data.stock ?? 0,
      sku: data.sku,
      purchase_quantity: data.purchase_quantity || 0,
      wholesale_prices: data.wholesale_prices,
    });
  };

  const handleEdit = (product: Product) => {
    setEditingId(product.id);
    setValue('name', product.name);
    setValue('purchase_price', product.purchase_price);
    setValue('selling_price', product.selling_price);
    setValue('stock', product.stock);
    setValue('sku', product.sku);
    setValue('purchase_quantity', 0);
    setValue('wholesale_prices', product.wholesale_prices || []);
  };

  const handleDelete = (id: string) => {
    modal.confirm({
      title: 'Hapus Produk',
      content: 'Apakah Anda yakin ingin menghapus produk ini?',
      okText: 'Ya, Hapus',
      cancelText: 'Batal',
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
    handleSubmit: handleSubmit(onSubmit),
    handleEdit,
    handleDelete,
    resetForm: resetFormData,
    errors,
    watch,
    isSubmitting: upsertMutation.isPending,
    importProductsFromCsv: (items: Parameters<typeof importCsvMutation.mutateAsync>[0]) =>
      importCsvMutation.mutateAsync(items),
    isImporting: importCsvMutation.isPending,
  };
};
