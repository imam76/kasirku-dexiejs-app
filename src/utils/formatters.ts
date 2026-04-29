import dayjs from '@/lib/dayjs';
import { PRODUCT_CATEGORIES } from '@/constants/categories';

export const formatDate = (dateString: string): string => {
  return dayjs(dateString).tz().format('D MMMM YYYY HH:mm');
};

export const formatCurrency = (value: number): string => {
  return value.toLocaleString('id-ID');
};

export const getStockStatusClass = (stock: number): string => {
  return stock < 10
    ? 'bg-red-100 text-red-800'
    : 'bg-green-100 text-green-800';
};

export const formatCategory = (category: string): string => {
  const normalized = category.toLowerCase();
  const aliasMap: Record<string, string> = {
    lainnya: 'Non-consumable / General Goods',
  };

  return PRODUCT_CATEGORIES.find((cat) => cat.value === normalized)?.label || aliasMap[normalized] || category;
};
