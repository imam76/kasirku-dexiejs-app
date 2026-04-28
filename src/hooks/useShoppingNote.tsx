import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { shoppingItemSchema, type ShoppingItemFormData } from '@/lib/validations/shopping';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { db } from '@/lib/db';
import { Product, ShoppingNoteItem, StockPurchase } from '@/types';
import { konversiSatuan, normalisasiHarga } from '@/utils/pricing';

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

      await db.transaction('rw', [db.shoppingNotes, db.products, db.stockPurchases, db.financeBalance, db.financeTransactions], async () => {
        await db.shoppingNotes.add({
          id: crypto.randomUUID(),
          created_at: now,
          items,
          total_shopping: totalShopping,
        });

        for (const item of items) {
          const product = await db.products.get(item.product_id);
          if (!product) {
            throw new Error(`Produk ${item.product_name} tidak ditemukan`);
          }

          const quantityInStockUnit = konversiSatuan(item.quantity, item.unit, product.purchase_unit);
          const costPerStockUnit = normalisasiHarga(item.unit_price, item.unit, product.purchase_unit);
          const totalCost = item.total_cost ?? item.subtotal;
          const purchaseId = crypto.randomUUID();

          const purchase: StockPurchase = {
            id: purchaseId,
            product_id: product.id,
            product_name: product.name,
            sku: product.sku,
            quantity: quantityInStockUnit,
            cost_per_unit: costPerStockUnit,
            total_cost: totalCost,
            created_at: now,
            updated_at: now,
          };

          await db.stockPurchases.add(purchase);

          const productUpdate: Partial<Product> = {
            stock: product.stock + quantityInStockUnit,
            updated_at: now,
          };

          if (product.purchase_price !== costPerStockUnit) {
            productUpdate.purchase_price = costPerStockUnit;
          }

          await db.products.update(product.id, productUpdate);

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
            description: `Belanja Stok: ${product.name} (${item.quantity} ${item.unit})`,
            created_at: now,
            reference_id: purchaseId,
          });
        }
      });

      message.success('Belanja stok berhasil disimpan');
      setItems([]);
      queryClient.invalidateQueries({ queryKey: ['shoppingNotesHistory'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseReport'] });
      queryClient.invalidateQueries({ queryKey: ['financeTransactions'] });
      queryClient.invalidateQueries({ queryKey: ['financeBalance'] });
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
