import { CloseCircleOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Input } from 'antd';
import type { InputRef } from 'antd';
import { CupSoda, Plus, Utensils } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useI18n } from '@/hooks/useI18n';
import {
  getRestaurantProductKind,
  hasRestaurantProductDiscount,
} from '@/services/restaurantPosService';
import type { Product, Promo, RestaurantOrderRecord } from '@/types';
import { formatCategory, formatCurrency } from '@/utils/formatters';
import { getProductDisplayPricing } from '@/utils/pricing';
import { matchesProductSearch, normalizeProductSearchTerm } from '@/utils/productSearch';
import { isProductVisibleInPos } from '@/utils/productAvailability';
import { hasVisiblePosShortcutBlocker, isPosShortcutTypingTarget } from '@/utils/posShortcutGuards';

interface RestaurantMenuCatalogProps {
  products: Product[];
  promos: Promo[];
  order?: RestaurantOrderRecord;
  disabled?: boolean;
  onAdd: (product: Product) => void;
}

export function RestaurantMenuCatalog({
  products,
  promos,
  order,
  disabled,
  onAdd,
}: RestaurantMenuCatalogProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const searchInputRef = useRef<InputRef>(null);
  const categories = useMemo(
    () => [...new Set(products.filter(isProductVisibleInPos).map((product) => product.category).filter(Boolean) as string[])],
    [products],
  );
  const normalizedSearch = normalizeProductSearchTerm(search);
  const visibleProducts = useMemo(() => products.filter((product) => (
    isProductVisibleInPos(product)
    && (category === 'ALL' || product.category === category)
    && (!normalizedSearch || matchesProductSearch(product, normalizedSearch))
  )), [category, normalizedSearch, products]);
  const orderQuantityByProduct = useMemo(() => new Map(
    (order?.lines ?? []).map((line) => [line.product_id, line.quantity]),
  ), [order?.lines]);
  const firstAddableProduct = useMemo(
    () => (disabled ? undefined : visibleProducts.find((product) => product.stock > 0)),
    [disabled, visibleProducts],
  );

  // Satu-tangan: `/` fokus kotak cari (mirip alur kasir retail di
  // Transaction.tsx), Enter menambah hasil pencarian pertama, Esc
  // membersihkan. Menu resto biasanya tidak discan barcode, jadi tanpa mesin
  // buffer scanner keyboard seperti di POS retail — cukup pencarian teks.
  useHotkeys('/', () => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, {
    // react-hotkeys-hook mencocokkan lewat event.code secara default, dan
    // code untuk '/' adalah "Slash" (bukan string '/'), jadi tanpa useKey
    // shortcut ini tidak pernah nyala. useKey memaksa perbandingan lewat
    // event.key supaya juga tetap benar di layout keyboard non-US.
    useKey: true,
    enableOnFormTags: true,
    preventDefault: true,
    ignoreEventWhen: (event) => (
      hasVisiblePosShortcutBlocker()
      || (isPosShortcutTypingTarget(event.target) && event.target !== searchInputRef.current?.input)
    ),
  }, []);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
      <div className="shrink-0 border-b border-blue-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-slate-900">{t('restaurantPos.menuCatalog')}</h2>
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-600"><Utensils size={19} /></span>
        </div>
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Input
            ref={searchInputRef}
            size="large"
            value={search}
            prefix={<SearchOutlined className="text-slate-400" />}
            placeholder={t('restaurantPos.searchMenu')}
            onChange={(event) => setSearch(event.target.value)}
            onPressEnter={() => {
              if (!firstAddableProduct) return;
              onAdd(firstAddableProduct);
              setSearch('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && search) {
                event.preventDefault();
                setSearch('');
              }
            }}
          />
          <Button
            size="large"
            icon={<CloseCircleOutlined />}
            disabled={!search}
            onClick={() => setSearch('')}
          >
            {t('restaurantPos.reset')}
          </Button>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCategory('ALL')}
            className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold ${category === 'ALL' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            {t('restaurantPos.allCategories')}
          </button>
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold ${category === item ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              {formatCategory(item)}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-24 min-[1280px]:pb-3" data-testid="restaurant-menu-scroll">
        {disabled ? (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
            {t('restaurantPos.selectTableFirst')}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {visibleProducts.map((product) => {
            const isDrink = getRestaurantProductKind(product) === 'DRINK';
            const Icon = isDrink ? CupSoda : Utensils;
            const outOfStock = product.stock <= 0;
            const quantity = orderQuantityByProduct.get(product.id);
            const hasDiscount = hasRestaurantProductDiscount(product, promos);
            return (
              <button
                key={product.id}
                type="button"
                disabled={disabled || outOfStock}
                onClick={() => onAdd(product)}
                className={`group relative min-h-36 rounded-xl border p-3 text-left transition ${quantity
                  ? 'border-blue-400 bg-blue-50/40 ring-2 ring-blue-100'
                  : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md'} disabled:cursor-not-allowed disabled:opacity-55`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
                    <Icon size={20} />
                  </span>
                  <div className="flex flex-wrap justify-end gap-1">
                    {hasDiscount ? <span className="rounded-full bg-rose-50 px-2 py-1 text-[9px] font-black uppercase text-rose-600">{t('restaurantPos.discount')}</span> : null}
                    {quantity ? <span className="rounded-full bg-blue-600 px-2 py-1 text-[9px] font-black text-white">{quantity}×</span> : null}
                  </div>
                </div>
                <h3 className="mt-2 line-clamp-2 text-sm font-bold leading-5 text-slate-900">{product.name}</h3>
                <p className="mt-1 truncate text-[10px] font-medium text-slate-400">SKU · {product.sku || '-'}</p>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-slate-900">Rp {formatCurrency(getProductDisplayPricing(product).basePrice)}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {outOfStock ? t('restaurantPos.outOfStock') : `/ ${product.selling_unit}`}
                    </p>
                  </div>
                  {!outOfStock ? <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 text-white group-hover:bg-blue-700"><Plus size={15} /></span> : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
