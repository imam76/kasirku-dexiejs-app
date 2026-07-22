import { Package, Plus } from 'lucide-react';
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
    <div className="flex flex-col gap-3 pb-24 lg:h-full lg:min-h-0 lg:overflow-hidden lg:pb-0">
      <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-3">
          {products.map((product) => {
            const pricePerSellingUnit = getPrice(product, 1);
            const cartItem = cart.find((item) => item.product.id === product.id);
            const isInCart = Boolean(cartItem);

            return (
              <button
                key={product.id}
                type="button"
                onClick={() => addToCart(product)}
                className={`group relative min-h-32 overflow-hidden rounded-xl border bg-white p-2.5 text-left transition-all ${
                  isInCart
                    ? 'border-blue-400 shadow-md shadow-blue-100/70 ring-2 ring-blue-100'
                    : 'border-slate-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-100/60 active:translate-y-0'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600 ring-1 ring-blue-100">
                    <Package size={19} strokeWidth={1.8} />
                  </span>
                  <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${product.stock < 10
                    ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
                    : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'}`}
                  >
                    {t('product.stock')} {product.stock}
                  </span>
                </div>

                <h3 className="mt-2 line-clamp-2 text-sm font-bold leading-4 text-slate-900">{product.name}</h3>
                <p className="mt-1 line-clamp-1 text-[10px] font-medium text-slate-400">SKU · {product.sku || '-'}</p>

                <div className="mt-2 flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-900">
                      Rp {formatCurrency(pricePerSellingUnit)}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-medium text-slate-400">/ {product.selling_unit}</span>
                      {product.wholesale_prices && product.wholesale_prices.length > 0 && (
                        <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">{t('product.wholesale')}</span>
                      )}
                    </div>
                  </div>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-600 text-white shadow-sm transition group-hover:bg-blue-700">
                    <Plus size={15} />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {shouldPaginate && (
        <div className="sticky bottom-0 z-20 mt-auto flex shrink-0 justify-center rounded-xl border border-blue-100 bg-white/95 px-2 py-2 shadow-[0_-8px_18px_-14px_rgba(15,23,42,0.35)] backdrop-blur">
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
