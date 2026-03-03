import { ShoppingCart } from 'lucide-react';
import { Product } from '@/types';
import { formatCurrency } from '@/utils/formatters';

interface ProductListProps {
  products: Product[];
  addToCart: (product: Product) => void;
}

export default function ProductList({ products, addToCart }: ProductListProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 pb-24 lg:pb-0">
      {products.map((product) => (
        <div
          key={product.id}
          onClick={() => addToCart(product)}
          className="bg-white p-3 sm:p-4 rounded-lg shadow-md cursor-pointer hover:shadow-lg transition-shadow border border-gray-200"
        >
          <div className="flex items-center justify-center h-16 sm:h-24 bg-gradient-to-br from-blue-100 to-blue-200 rounded-lg mb-3">
            <ShoppingCart size={32} className="text-blue-600 sm:w-10 sm:h-10" />
          </div>
          <h3 className="font-semibold text-gray-800 mb-1 text-sm sm:text-base line-clamp-2">{product.name}</h3>
          <p className="text-xs sm:text-sm text-gray-600 mb-2">{product.sku}</p>
          <div className="flex flex-wrap items-center gap-1">
            <p className="text-sm sm:text-lg font-bold text-blue-600">
              Rp {formatCurrency(product.selling_price)}
            </p>
            {product.wholesale_prices && product.wholesale_prices.length > 0 && (
              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">Grosir</span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Stok: {product.stock}
          </p>
        </div>
      ))}
    </div>
  );
}
