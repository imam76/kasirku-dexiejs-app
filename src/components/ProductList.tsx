import { Minus, Package, Plus } from 'lucide-react';
import { CartItem, Product } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { getPrice } from '@/utils/pricing';
import { useI18n } from '@/hooks/useI18n';
import { Pagination } from 'antd';

interface ProductListProps {
  products: Product[];
  cart: CartItem[];
  addToCart: (product: Product) => boolean;
  updateQuantity: (id: string, quantity: number) => boolean;
  pagination?: {
    currentPage: number;
    pageSize: number;
    total: number;
    onChange: (page: number) => void;
  };
}

const animateProductToCart = (source: HTMLElement) => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const sourceRect = source.getBoundingClientRect();
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const target = Array.from(document.querySelectorAll<HTMLElement>('[data-pos-cart-target]'))
        .find((element) => element.getClientRects().length > 0);
      if (!target) return;

      const targetRect = target.getBoundingClientRect();
      const particle = document.createElement('span');
      particle.setAttribute('aria-hidden', 'true');
      Object.assign(particle.style, {
        position: 'fixed',
        zIndex: '1400',
        left: `${sourceRect.left + sourceRect.width / 2 - 14}px`,
        top: `${sourceRect.top + sourceRect.height / 2 - 14}px`,
        width: '28px',
        height: '28px',
        borderRadius: '9999px',
        background: '#2563eb',
        border: '3px solid #dbeafe',
        boxShadow: '0 8px 20px rgb(37 99 235 / 0.35)',
        pointerEvents: 'none',
      });
      document.body.appendChild(particle);

      const translateX = targetRect.left + targetRect.width / 2 - (sourceRect.left + sourceRect.width / 2);
      const translateY = targetRect.top + Math.min(targetRect.height / 2, 40) - (sourceRect.top + sourceRect.height / 2);
      const animation = particle.animate([
        { transform: 'translate3d(0, 0, 0) scale(0.75)', opacity: 0.95 },
        { transform: `translate3d(${translateX * 0.55}px, ${translateY * 0.35 - 30}px, 0) scale(1)`, opacity: 1, offset: 0.45 },
        { transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(0.25)`, opacity: 0.1 },
      ], {
        duration: 800,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'forwards',
      });
      const removeParticle = () => particle.remove();
      animation.onfinish = removeParticle;
      animation.oncancel = removeParticle;
    });
  });
};

export default function ProductList({ products, cart, addToCart, updateQuantity, pagination }: ProductListProps) {
  const { t } = useI18n();
  const shouldPaginate = pagination && pagination.total > pagination.pageSize;

  const handleAddProduct = (product: Product, source: HTMLElement) => {
    if (addToCart(product)) animateProductToCart(source);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden pb-24 min-[1024px]:pb-0">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1" data-testid="pos-product-scroll-panel">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => {
            const pricePerSellingUnit = getPrice(product, 1);
            const cartItem = cart.find((item) => item.product.id === product.id);
            const isInCart = Boolean(cartItem);
            const quantityStep = cartItem && ['gram', 'menit'].includes(cartItem.unit.toLowerCase()) ? 10 : 1;

            return (
              <article
                key={product.id}
                className={`group relative min-h-32 overflow-hidden rounded-xl border bg-white p-2.5 text-left transition-all ${
                  isInCart
                    ? 'border-blue-400 shadow-md shadow-blue-100/70 ring-2 ring-blue-100'
                    : 'border-slate-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-100/60 active:translate-y-0'
                }`}
              >
                <button
                  type="button"
                  onClick={(event) => handleAddProduct(product, event.currentTarget)}
                  className={`absolute inset-0 z-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset ${cartItem ? 'hidden lg:block' : 'block'}`}
                  aria-label={`${t('cart.increase')} ${product.name}`}
                  data-testid={`product-add-${product.id}`}
                />

                <div className="pointer-events-none relative z-[1]">
                  <div className="flex items-start justify-between gap-2">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600 ring-1 ring-blue-100">
                      <Package size={19} strokeWidth={1.8} />
                    </span>
                    <span className="flex items-center justify-end gap-1">
                      <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${product.stock < 10
                        ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
                        : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'}`}
                      >
                        {t('product.stock')} {product.stock}
                      </span>
                      {cartItem && (
                        <span className="inline-flex whitespace-nowrap rounded-full bg-gradient-to-br from-blue-50 to-blue-100 px-2 py-1 text-[9px] font-bold text-blue-600 ring-1 ring-blue-100">
                          {cartItem.quantity} {product.selling_unit}
                        </span>
                      )}
                    </span>
                  </div>

                  <h3 className="mt-2 line-clamp-2 text-sm font-bold leading-4 text-slate-900">{product.name}</h3>
                  <p className="mt-1 line-clamp-1 text-[10px] font-medium text-slate-400">SKU · {product.sku || '-'}</p>
                </div>

                <div className="pointer-events-none relative z-10 mt-2 flex items-end justify-between gap-2">
                  <div className="pointer-events-none min-w-0">
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

                  {cartItem ? (
                    <div className="pointer-events-auto flex h-8 w-fit shrink-0 items-center overflow-hidden rounded-lg border border-blue-200 bg-white shadow-sm lg:hidden">
                      <button
                        type="button"
                        onClick={() => updateQuantity(product.id, cartItem.quantity - quantityStep)}
                        className="grid h-full w-8 place-items-center bg-blue-50 text-blue-700 transition hover:bg-blue-600 hover:text-white"
                        title={t('cart.decrease')}
                        aria-label={`${t('cart.decrease')} ${product.name}`}
                      >
                        <Minus size={14} strokeWidth={2.5} />
                      </button>
                      <span className="min-w-8 px-1 text-center text-xs font-black tabular-nums text-slate-900">
                        {cartItem.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={(event) => {
                          if (updateQuantity(product.id, cartItem.quantity + quantityStep)) animateProductToCart(event.currentTarget);
                        }}
                        className="grid h-full w-8 place-items-center bg-blue-50 text-blue-700 transition hover:bg-blue-600 hover:text-white"
                        title={t('cart.increase')}
                        aria-label={`${t('cart.increase')} ${product.name}`}
                      >
                        <Plus size={14} strokeWidth={2.5} />
                      </button>
                    </div>
                  ) : null}
                  <span className={`pointer-events-none h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-600 text-white shadow-sm transition group-hover:bg-blue-700 ${cartItem ? 'hidden lg:grid' : 'grid'}`}>
                    <Plus size={15} />
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {shouldPaginate && (
        <div
          data-testid="pos-product-pagination-footer"
          className="mt-auto flex shrink-0 justify-center rounded-xl border border-blue-100 bg-white/95 px-2 py-2 shadow-[0_-8px_18px_-14px_rgba(15,23,42,0.35)] backdrop-blur"
        >
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
