import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { stockSchema, type StockFormData } from '@/lib/validations/stock';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { db } from '@/lib/db';
import { Product, ProductUnit, StockPurchase } from '@/types';
import type { ProductCsvImportItem } from '@/utils/productsCsv';

export type { StockFormData };

export const useStockManagement = () => {
  const queryClient = useQueryClient();
  const { modal, message } = App.useApp();
  const [editingId, setEditingId] = useState<string | null>(null);
  
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
      sellable_units: [],
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

      const cleanData: any = {
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
        sellable_units: productData.sellable_units && productData.sellable_units.length > 0 ? productData.sellable_units : [productData.selling_unit || 'pcs'],
      };

      // Only include stock if it's explicitly provided
      if (productData.stock !== undefined) {
        cleanData.stock = productData.stock;
      }

      await db.transaction('rw', [db.products, db.stockPurchases, db.financeBalance, db.financeTransactions], async () => {
        if (editingId) {
          // Update product
          await db.products.update(editingId, {
            ...cleanData,
            updated_at: now,
          });

          // Record purchase if stock was added
          if (purchase_quantity > 0) {
            const totalCost = cleanData.purchase_price * purchase_quantity;
            const purchaseId = crypto.randomUUID();
            const purchase: StockPurchase = {
              id: purchaseId,
              product_id: editingId,
              product_name: cleanData.name,
              sku: cleanData.sku,
              quantity: purchase_quantity,
              cost_per_unit: cleanData.purchase_price,
              total_cost: totalCost,
              created_at: now,
              updated_at: now,
            };
            await db.stockPurchases.add(purchase);

            // Update Finance
            const currentFinanceBalance = await db.financeBalance.get('current');
            await db.financeBalance.put({
              id: 'current',
              amount: (currentFinanceBalance?.amount || 0) - totalCost,
              updated_at: now,
            });

            await db.financeTransactions.add({
              id: crypto.randomUUID(),
              type: 'EXPENSE',
              category: 'PEMBELIAN_STOK',
              amount: totalCost,
              description: `Beli Stok: ${cleanData.name} (${purchase_quantity} pcs)`,
              created_at: now,
              reference_id: purchaseId,
            });
          }
        } else {
          // Create new product
          const newId = crypto.randomUUID();
          const newProduct: Product = {
            id: newId,
            ...cleanData,
            stock: cleanData.stock ?? 0, // Ensure stock is set for new product
            created_at: now,
            updated_at: now,
          };

          await db.products.add(newProduct);

          // Record initial purchase if stock was added
          if (purchase_quantity > 0) {
            const totalCost = cleanData.purchase_price * purchase_quantity;
            const purchaseId = crypto.randomUUID();
            const purchase: StockPurchase = {
              id: purchaseId,
              product_id: newId,
              product_name: cleanData.name,
              sku: cleanData.sku,
              quantity: purchase_quantity,
              cost_per_unit: cleanData.purchase_price,
              total_cost: totalCost,
              created_at: now,
              updated_at: now,
            };
            await db.stockPurchases.add(purchase);

            // Update Finance
            const currentFinanceBalance = await db.financeBalance.get('current');
            await db.financeBalance.put({
              id: 'current',
              amount: (currentFinanceBalance?.amount || 0) - totalCost,
              updated_at: now,
            });

            await db.financeTransactions.add({
              id: crypto.randomUUID(),
              type: 'EXPENSE',
              category: 'PEMBELIAN_STOK',
              amount: totalCost,
              description: `Beli Stok Awal: ${cleanData.name} (${purchase_quantity} pcs)`,
              created_at: now,
              reference_id: purchaseId,
            });
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

      await db.transaction('rw', [db.products, db.stockPurchases, db.financeBalance, db.financeTransactions], async () => {
        for (const item of items) {
          let existing = null;
          if (item.sku) {
            existing = await db.products.where('sku').equals(item.sku).first();
          }
          if (!existing && item.id) {
            existing = await db.products.get(item.id);
          }

          const cleanData = {
            name: item.name,
            category: item.category || existing?.category || 'non_consumable',
            purchase_unit: (item.purchase_unit || existing?.purchase_unit || 'pcs') as ProductUnit,
            selling_unit: (item.selling_unit || existing?.selling_unit || 'pcs') as ProductUnit,
            purchase_price: item.purchase_price ?? 0,
            selling_price: item.selling_price ?? 0,
            stock: item.stock ?? 0,
            sku: item.sku || existing?.sku || '',
            wholesale_prices: (item.wholesale_prices || existing?.wholesale_prices || []).map((p) => ({
              min_quantity: Number(p.min_quantity),
              price: Number(p.price),
              price_type: p.price_type || 'unit',
            })),
            sellable_units: item.sellable_units && item.sellable_units.length > 0
              ? item.sellable_units
              : existing?.sellable_units && existing.sellable_units.length > 0
                ? existing.sellable_units
                : [item.selling_unit || existing?.selling_unit || 'pcs'],
          };

          const purchase_quantity = item.purchase_quantity || 0;

          if (existing) {
            await db.products.update(existing.id, {
              ...cleanData,
              updated_at: now,
            });

            if (purchase_quantity > 0) {
              const totalCost = cleanData.purchase_price * purchase_quantity;
              const purchaseId = crypto.randomUUID();
              const purchase: StockPurchase = {
                id: purchaseId,
                product_id: existing.id,
                product_name: cleanData.name,
                sku: cleanData.sku,
                quantity: purchase_quantity,
                cost_per_unit: cleanData.purchase_price,
                total_cost: totalCost,
                created_at: now,
                updated_at: now,
              };
              await db.stockPurchases.add(purchase);

              // Update Finance
              const currentFinanceBalance = await db.financeBalance.get('current');
              await db.financeBalance.put({
                id: 'current',
                amount: (currentFinanceBalance?.amount || 0) - totalCost,
                updated_at: now,
              });

              await db.financeTransactions.add({
                id: crypto.randomUUID(),
                type: 'EXPENSE',
                category: 'PEMBELIAN_STOK',
                amount: totalCost,
                description: `Beli Stok (Import): ${cleanData.name} (${purchase_quantity} pcs)`,
                created_at: now,
                reference_id: purchaseId,
              });
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
              const totalCost = cleanData.purchase_price * purchase_quantity;
              const purchaseId = crypto.randomUUID();
              const purchase: StockPurchase = {
                id: purchaseId,
                product_id: newId,
                product_name: cleanData.name,
                sku: cleanData.sku,
                quantity: purchase_quantity,
                cost_per_unit: cleanData.purchase_price,
                total_cost: totalCost,
                created_at: now,
                updated_at: now,
              };
              await db.stockPurchases.add(purchase);

              // Update Finance
              const currentFinanceBalance = await db.financeBalance.get('current');
              await db.financeBalance.put({
                id: 'current',
                amount: (currentFinanceBalance?.amount || 0) - totalCost,
                updated_at: now,
              });

              await db.financeTransactions.add({
                id: crypto.randomUUID(),
                type: 'EXPENSE',
                category: 'PEMBELIAN_STOK',
                amount: totalCost,
                description: `Beli Stok Awal (Import): ${cleanData.name} (${purchase_quantity} pcs)`,
                created_at: now,
                reference_id: purchaseId,
              });
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
      category: data.category,
      purchase_unit: data.purchase_unit,
      selling_unit: data.selling_unit,
      purchase_price: data.purchase_price,
      selling_price: data.selling_price,
      stock: data.stock,
      sku: data.sku || '',
      purchase_quantity: data.purchase_quantity || 0,
      wholesale_prices: data.wholesale_prices || [],
      sellable_units: data.sellable_units || [],
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
