import { ShoppingCart } from 'lucide-react';
import { CartItem, Product } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { getPrice } from '@/utils/pricing';
import { useI18n } from '@/hooks/useI18n';
import { Pagination } from 'antd';

interface ProductListProps {
  products: Product[];
  cart: CartItem[];
  addToCart: (product: Product) => void;
  pagination?: {
    currentPage: number;
    pageSize: number;
    total: number;
    onChange: (page: number) => void;
  };
}

export default function ProductList({ products, cart, addToCart, pagination }: ProductListProps) {
  const { t } = useI18n();
  const shouldPaginate = pagination && pagination.total > pagination.pageSize;

  return (
    <div className="space-y-4 pb-24 lg:pb-0">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {products.map((product) => {
          const pricePerSellingUnit = getPrice(product, 1);
          const cartItem = cart.find((item) => item.product.id === product.id);
          const isInCart = Boolean(cartItem);

          return (
            <div
              key={product.id}
              onClick={() => addToCart(product)}
              className={`relative bg-white p-3 sm:p-4 rounded-lg shadow-md cursor-pointer hover:shadow-lg transition-all border ${
                isInCart ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200'
              }`}
            >
              {cartItem && (
                <span className="absolute right-0 top-0 z-10 inline-flex min-w-7 items-center justify-center rounded-[6px] bg-blue-600 px-2 py-1 text-xs font-bold text-white shadow-sm">
                  {cartItem.quantity} {cartItem.unit}
                </span>
              )}
              <div className="flex items-center justify-center h-16 sm:h-24 bg-gradient-to-br from-blue-100 to-blue-200 rounded-lg mb-3">
                <ShoppingCart size={32} className="text-blue-600 sm:w-10 sm:h-10" />
              </div>
              <h3 className="font-semibold text-gray-800 mb-1 text-sm sm:text-base line-clamp-2">{product.name}</h3>
              <p className="text-xs sm:text-sm text-gray-600 mb-2">{product.sku || '-'}</p>
              <div className="flex flex-wrap items-center gap-1">
                <p className="text-sm sm:text-lg font-bold text-blue-600">
                  Rp {formatCurrency(pricePerSellingUnit)}
                </p>
                <span className="text-xs text-gray-500">/ {product.selling_unit}</span>
                {product.wholesale_prices && product.wholesale_prices.length > 0 && (
                  <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">{t('product.wholesale')}</span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                {t('product.stock')}: {product.stock} {product.purchase_unit}
              </p>
            </div>
          );
        })}
      </div>

      {shouldPaginate && (
        <div className="flex justify-center pt-1">
          <Pagination
            current={pagination.currentPage}
            pageSize={pagination.pageSize}
            total={pagination.total}
            onChange={pagination.onChange}
            responsive
            showLessItems
            showSizeChanger={false}
          />
        </div>
      )}
    </div>
  );
}
