import type { TranslationKey } from '@/i18n/messages';
import type { RestaurantTableType } from '@/types';

export const RESTAURANT_TABLE_TYPE_LABEL_KEY: Record<RestaurantTableType, TranslationKey> = {
  REGULAR: 'restaurantTables.regular',
  VIP: 'restaurantTables.vip',
  VVIP: 'restaurantTables.vvip',
};

export const RESTAURANT_TABLE_TYPE_TAG_COLOR: Record<RestaurantTableType, string> = {
  REGULAR: 'blue',
  VIP: 'gold',
  VVIP: 'purple',
};
