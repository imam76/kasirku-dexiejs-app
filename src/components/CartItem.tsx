import { Minus, Package, Plus, Trash2 } from 'lucide-react';
import { CartItem as CartItemType } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { getCartItemOriginalPrice, getCartItemPrice } from '@/utils/pricing';
import { getProductSellableUnits } from '@/utils/productUnits';
import { InputNumber, Select } from 'antd';
import { useI18n } from '@/hooks/useI18n';

interface CartItemProps {
  item: CartItemType;
  updateQuantity: (id: string, quantity: number) => void;
  updateUnit: (id: string, unit: string) => boolean;
  removeFromCart: (id: string) => void;
  isActive?: boolean;
  onActivate?: () => void;
  quantityInputRef?: (element: HTMLInputElement | null) => void;
}

export default function CartItem({
  item,
  updateQuantity,
  updateUnit,
  removeFromCart,
  isActive = false,
  onActivate,
  quantityInputRef,
}: CartItemProps) {
  const { t } = useI18n();
  const currentPrice = getCartItemPrice(item);
  const isWholesale = currentPrice < getCartItemOriginalPrice({ ...item, quantity: 1 });
  const quantityStep = ['gram', 'menit'].includes(item.unit.toLowerCase()) ? 10 : 1;

  // Get available sellable units for this product
  const sellableUnits = getProductSellableUnits(item.product);

  const handleQuantityChange = (val: number | null) => {
    if (val !== null) {
      updateQuantity(item.product.id, val);
    }
  };

  const handleUnitChange = (newUnit: string) => {
    updateUnit(item.product.id, newUnit);
  };

  const unitOptions = sellableUnits.map((unit) => ({
    value: unit,
    label: unit,
  }));

  return (
    <>
      <article
        data-pos-cart-item-id={item.product.id}
        data-pos-active={isActive ? 'true' : 'false'}
        onClick={onActivate}
        className={`hidden rounded-xl border bg-blue-50/40 p-2.5 min-[1024px]:block lg:hidden ${
          isActive
            ? 'border-blue-500 shadow-md shadow-blue-100 ring-2 ring-blue-200'
            : 'border-blue-100'
        }`}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="min-w-0 flex-1" title={item.product.name}>
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-bold leading-5 text-slate-800">{item.product.name}</p>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <p className="text-[11px] font-semibold text-slate-500">
                Rp {formatCurrency(currentPrice)} / {item.unit}
              </p>
              {isWholesale && (
                <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">{t('product.wholesale')}</span>
              )}
            </div>
          </div>

          <Select
            value={item.unit}
            onChange={handleUnitChange}
            className="h-8 w-28 shrink-0"
            size="small"
            options={unitOptions}
          />

          <div className="flex h-8 w-[74px] shrink-0 items-center overflow-hidden rounded-lg border border-blue-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => updateQuantity(item.product.id, item.quantity - quantityStep)}
              className="grid h-full w-6 shrink-0 place-items-center bg-blue-50 text-blue-700 transition hover:bg-blue-600 hover:text-white"
              title={t('cart.decrease')}
            >
              <Minus size={13} strokeWidth={2.5} />
            </button>

            <InputNumber
              inputMode='decimal'
              min={0}
              value={item.quantity}
              onChange={handleQuantityChange}
              className="h-full min-w-0 flex-1 [&_.ant-input-number-input-wrap]:!h-full [&_.ant-input-number-input]:!h-full [&_.ant-input-number-input]:!p-0 [&_.ant-input-number-input]:!text-center [&_.ant-input-number-input]:!text-xs [&_.ant-input-number-input]:!font-bold [&_.ant-input-number-input]:!leading-[30px]"
              size="small"
              controls={false}
              variant="borderless"
            />

            <button
              type="button"
              onClick={() => updateQuantity(item.product.id, item.quantity + quantityStep)}
              className="grid h-full w-6 shrink-0 place-items-center bg-blue-50 text-blue-700 transition hover:bg-blue-600 hover:text-white"
              title={t('cart.increase')}
            >
              <Plus size={13} strokeWidth={2.5} />
            </button>
          </div>

          <strong className="w-[76px] shrink-0 truncate text-right text-xs font-black tabular-nums text-slate-900" title={`Rp ${formatCurrency(currentPrice * item.quantity)}`}>
            Rp {formatCurrency(currentPrice * item.quantity)}
          </strong>

          <button
            type="button"
            onClick={() => removeFromCart(item.product.id)}
            className="grid h-8 w-7 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
            title={t('cart.remove')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </article>

      <article
        data-testid={`pos-cart-item-${item.product.id}`}
        data-pos-cart-item-id={item.product.id}
        data-pos-active={isActive ? 'true' : 'false'}
        onClick={onActivate}
        className={`rounded-2xl border bg-blue-50/40 p-3 min-[1024px]:hidden lg:block ${
          isActive
            ? 'border-blue-500 shadow-md shadow-blue-100 ring-2 ring-blue-200'
            : 'border-blue-100'
        }`}
      >
        <div className="flex items-start gap-2.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-blue-600 shadow-sm ring-1 ring-blue-100">
            <Package size={19} strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-1.5">
              <p className="line-clamp-2 min-w-0 flex-1 text-sm font-bold leading-5 text-slate-800">{item.product.name}</p>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <p className="text-[11px] font-semibold text-slate-500">
                Rp {formatCurrency(currentPrice)} / {item.unit}
              </p>
              {isWholesale && (
                <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">{t('product.wholesale')}</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => removeFromCart(item.product.id)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
            title={t('cart.remove')}
          >
            <Trash2 size={15} />
          </button>
        </div>

        <div className="mt-3 border-t border-blue-100 pt-2.5">
          <div className="grid grid-cols-2 gap-2">
            <Select
              data-testid={`pos-cart-unit-${item.product.id}`}
              value={item.unit}
              onChange={handleUnitChange}
              className="h-9 w-full min-w-0"
              size="middle"
              options={unitOptions}
            />

            <div className="flex h-9 min-w-0 items-center overflow-hidden rounded-lg border border-blue-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => updateQuantity(item.product.id, item.quantity - quantityStep)}
                className="grid h-full w-8 shrink-0 place-items-center bg-blue-50 text-blue-700 transition hover:bg-blue-600 hover:text-white"
                title={t('cart.decrease')}
              >
                <Minus size={15} strokeWidth={2.5} />
              </button>

              <InputNumber
                ref={quantityInputRef}
                data-testid={`pos-cart-quantity-${item.product.id}`}
                inputMode='decimal'
                min={0}
                value={item.quantity}
                onChange={handleQuantityChange}
                className="h-full min-w-0 flex-1 [&_.ant-input-number-input-wrap]:!h-full [&_.ant-input-number-input]:!h-full [&_.ant-input-number-input]:!p-0 [&_.ant-input-number-input]:!text-center [&_.ant-input-number-input]:!font-bold [&_.ant-input-number-input]:!leading-[34px]"
                size="small"
                controls={false}
                variant="borderless"
              />

              <button
                type="button"
                onClick={() => updateQuantity(item.product.id, item.quantity + quantityStep)}
                className="grid h-full w-8 shrink-0 place-items-center bg-blue-50 text-blue-700 transition hover:bg-blue-600 hover:text-white"
                title={t('cart.increase')}
              >
                <Plus size={15} strokeWidth={2.5} />
              </button>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t('cart.total')}</span>
            <strong className="text-sm font-black tabular-nums text-slate-900">Rp {formatCurrency(currentPrice * item.quantity)}</strong>
          </div>
        </div>
      </article>
    </>
  );
}
