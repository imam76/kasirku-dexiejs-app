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
  updateUnit: (id: string, unit: string) => void;
  removeFromCart: (id: string) => void;
}

export default function CartItem({ item, updateQuantity, updateUnit, removeFromCart }: CartItemProps) {
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

  return (
    <article className="rounded-2xl border border-blue-100 bg-blue-50/40 p-3">
      <div className="flex items-start gap-2.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-blue-600 shadow-sm ring-1 ring-blue-100">
          <Package size={19} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-bold leading-5 text-slate-800">{item.product.name}</p>
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
            value={item.unit}
            onChange={handleUnitChange}
            className="h-9 w-full min-w-0"
            size="middle"
            options={sellableUnits.map((unit) => ({
              value: unit,
              label: unit,
            }))}
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
  );
}
