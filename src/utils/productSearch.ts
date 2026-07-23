import type { Product } from '@/types';

type SearchableProduct = Pick<Product, 'name' | 'sku'>;

export const normalizeProductSearchTerm = (value: string) => value.trim().toLowerCase();

export const matchesProductSearch = (product: SearchableProduct, searchTerm: string) => {
  const normalizedSearchTerm = normalizeProductSearchTerm(searchTerm);
  if (!normalizedSearchTerm) return true;

  return product.name.toLowerCase().includes(normalizedSearchTerm)
    || (product.sku?.toLowerCase() ?? '').includes(normalizedSearchTerm);
};
