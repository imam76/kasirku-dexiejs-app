import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { DEFAULT_CONVERSIONS } from '@/constants/units';
import { useI18n } from '@/hooks/useI18n';
import { db } from '@/lib/db';
import { createStockSchema, type StockFormData } from '@/lib/validations/stock';

export const buildQuickCreateDefaultValues = (
  overrides: Partial<StockFormData> = {},
): StockFormData => ({
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
  ...overrides,
});

/**
 * Form Product-tab-lengkap yang sama dipakai Master Produk, tapi dipasang di
 * tempat lain (POS/Sales/Purchase quick-create) supaya produk yang dibuat
 * lewat jalur cepat tidak pernah kalah lengkap dari produk yang dibuat lewat
 * Master Produk.
 */
export const useProductQuickCreateForm = (defaultValues?: Partial<StockFormData>) => {
  const { t } = useI18n();
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
    defaultValues: buildQuickCreateDefaultValues(defaultValues),
  });

  const { trigger, getValues } = form;

  /** Validasi seluruh form dulu (termasuk tab yang sedang tidak aktif) baru panggil `persist`. */
  const submit = useCallback(async <T,>(persist: (data: StockFormData) => Promise<T>): Promise<T | null> => {
    const isValid = await trigger();
    if (!isValid) return null;
    return persist(getValues());
  }, [trigger, getValues]);

  return { ...form, submit };
};
