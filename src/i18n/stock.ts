import { PRODUCT_CATEGORIES, type ProductCategoryValue } from '@/constants/categories';
import type { TranslationKey } from '@/i18n/messages';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

const CATEGORY_LABEL_KEYS: Record<ProductCategoryValue, TranslationKey> = {
  bumbu: 'stock.category.bumbu',
  sembako: 'stock.category.sembako',
  makanan_instan: 'stock.category.makanan_instan',
  snack: 'stock.category.snack',
  minuman: 'stock.category.minuman',
  household_cleaning: 'stock.category.household_cleaning',
  laundry: 'stock.category.laundry',
  personal_care: 'stock.category.personal_care',
  non_consumable: 'stock.category.non_consumable',
  lainnya: 'stock.category.lainnya',
};

export const getProductCategoryOptions = (t: Translate) => {
  return PRODUCT_CATEGORIES.map((category) => ({
    ...category,
    label: t(CATEGORY_LABEL_KEYS[category.value]),
  }));
};

export const getProductCategoryLabel = (category: string, t: Translate) => {
  const normalized = category.toLowerCase() as ProductCategoryValue;
  const key = CATEGORY_LABEL_KEYS[normalized];
  return key ? t(key) : category;
};
