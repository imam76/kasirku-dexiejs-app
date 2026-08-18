import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { DEFAULT_CONVERSIONS } from '@/constants/units';
import { useI18n } from '@/hooks/useI18n';
import { db } from '@/lib/db';
import { createStockSchema, type StockFormData } from '@/lib/validations/stock';
import { materializeWholesalePriceUnits } from '@/utils/pricing';
import { getProductSellableUnits, normalizeProductUnitMappings } from '@/utils/productUnits';
import type { Product } from '@/types';

/**
 * Form Product-tab-lengkap yang sama dipakai Master Produk, tapi dipasang di
 * tempat lain (POS/Sales/Purchase quick-edit) supaya harga jual bisa
 * disesuaikan tanpa keluar dari transaksi yang sedang diisi.
 */
export const useProductQuickEditForm = () => {
  const { t } = useI18n();
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const { data: unitConversions = DEFAULT_CONVERSIONS } = useQuery({
    queryKey: ['unitConversions'],
    queryFn: () => db.unitConversions.toArray(),
  });

  const stockSchema = useMemo(
    () => createStockSchema(t, { globalConversions: unitConversions }),
    [t, unitConversions],
  );

  const form = useForm<StockFormData>({
    resolver: zodResolver(stockSchema),
  });

  const { trigger, getValues, reset } = form;

  const loadProduct = useCallback((product: Product) => {
    setEditingProductId(product.id);
    reset({
      name: product.name,
      category: product.category || 'non_consumable',
      purchase_unit: product.purchase_unit,
      selling_unit: product.selling_unit,
      purchase_price: product.purchase_price,
      selling_price: product.selling_price,
      stock: undefined,
      min_stock: product.min_stock,
      sku: product.sku || '',
      product_type: product.product_type ?? 'FINISHED_GOOD',
      is_visible_in_pos: product.is_visible_in_pos ?? true,
      purchase_quantity: 0,
      wholesale_prices: materializeWholesalePriceUnits(product, unitConversions).map((price) => ({
        min_quantity: price.min_quantity,
        unit: price.unit || product.selling_unit || product.purchase_unit,
        price: price.price,
        price_type: price.price_type,
      })),
      sellable_units: getProductSellableUnits(product),
      unit_mappings: normalizeProductUnitMappings(product),
    });
  }, [reset, unitConversions]);

  const closeEditing = useCallback(() => {
    setEditingProductId(null);
    reset();
  }, [reset]);

  /** Validasi seluruh form dulu (termasuk tab yang sedang tidak aktif) baru panggil `persist`. */
  const submit = useCallback(async <T,>(
    persist: (productId: string, data: StockFormData) => Promise<T>,
  ): Promise<T | null> => {
    if (!editingProductId) return null;
    const isValid = await trigger();
    if (!isValid) return null;
    return persist(editingProductId, getValues());
  }, [editingProductId, trigger, getValues]);

  return { ...form, editingProductId, loadProduct, closeEditing, submit };
};
