import type { Product } from '@/types';

export const DEFAULT_PRODUCT_TYPE = 'FINISHED_GOOD' as const;

export const isProductVisibleInPos = (
  product: Pick<Product, 'is_visible_in_pos'> | { is_visible_in_pos?: boolean },
) => product.is_visible_in_pos !== false;
