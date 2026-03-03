import { Product } from '@/types';

export const getPrice = (product: Product, quantity: number): number => {
  if (!product.wholesale_prices || product.wholesale_prices.length === 0) {
    return product.selling_price;
  }
  
  // Sort by min_quantity descending to find the highest applicable tier
  // We use spread to avoid mutating the original array if it's frozen
  const sortedPrices = [...product.wholesale_prices].sort((a, b) => b.min_quantity - a.min_quantity);
  
  // Find the first tier where quantity >= min_quantity
  const match = sortedPrices.find(p => quantity >= p.min_quantity);
  
  return match ? match.price : product.selling_price;
};
