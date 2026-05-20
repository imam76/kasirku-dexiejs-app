import { Minus, Plus, Trash2 } from 'lucide-react';
import { CartItem as CartItemType } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { getCartItemOriginalPrice, getCartItemPrice } from '@/utils/pricing';
import { getProductSellableUnits } from '@/utils/productUnits';
import { InputNumber, Select } from 'antd';
import { useI18n } from '@/hooks/useI18n';
import { useAuth } from '@/auth/useAuth';

interface CartItemProps {
  item: CartItemType;
  updateQuantity: (id: string, quantity: number) => void;
  updateUnit: (id: string, unit: string) => void;
  updateCustomPrice: (id: string, customPrice: number | undefined) => void;
  removeFromCart: (id: string) => void;
}

export default function CartItem({ item, updateQuantity, updateUnit, updateCustomPrice, removeFromCart }: CartItemProps) {
  const { t } = useI18n();
  const { can } = useAuth();
  const canEditPrice = can('TRANSACTION_EDIT_PRICE');
  const originalPrice = getCartItemOriginalPrice(item);
  const currentPrice = getCartItemPrice(item);
  const isPriceEdited = item.custom_price !== undefined;
  const isWholesale = !isPriceEdited && currentPrice < getCartItemOriginalPrice({ ...item, quantity: 1 });

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

  const handleCustomPriceChange = (val: number | null) => {
    if (!canEditPrice) return;
    updateCustomPrice(item.product.id, val === null ? undefined : val);
  };

  return (
    <div className="flex flex-col p-3 bg-gray-50 rounded-lg gap-2">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="font-medium text-gray-800">{item.product.name}</p>
          <div className="flex items-center gap-2">
            <p className="text-sm text-gray-600">
              Rp {formatCurrency(currentPrice)} / {item.unit}
            </p>
            {isPriceEdited && (
              <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">Edit</span>
            )}
            {isWholesale && (
              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">{t('product.wholesale')}</span>
            )}
          </div>
        </div>
        <button
          onClick={() => removeFromCart(item.product.id)}
          className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors ml-2"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-2 sm:gap-3">
        <p className="text-sm font-bold text-gray-700">
          {t('cart.total')}: Rp {formatCurrency(currentPrice * item.quantity)}
        </p>

        <div className="flex flex-col gap-2">
          {/* Quantity Controls */}
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => updateQuantity(item.product.id, item.quantity - (['gram', 'menit'].includes(item.unit.toLowerCase()) ? 10 : 1))}
              className="p-1.5 bg-gray-300 hover:bg-gray-400 rounded transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              title={t('cart.decrease')}
            >
              <Minus size={16} />
            </button>

            <InputNumber
              inputMode='decimal'
              min={0}
              value={item.quantity}
              onChange={handleQuantityChange}
              className="min-w-0 flex-1"
              size="large"
              controls={false}
            />

            <button
              onClick={() => updateQuantity(item.product.id, item.quantity + (['gram', 'menit'].includes(item.unit.toLowerCase()) ? 10 : 1))}
              className="p-1.5 bg-gray-300 hover:bg-gray-400 rounded transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              title={t('cart.increase')}
            >
              <Plus size={16} />
            </button>
          </div>

          {/* Unit Selector */}
          <div className="w-full">
            <Select
              value={item.unit}
              onChange={handleUnitChange}
              className="w-full"
              size="large"
              options={sellableUnits.map((unit) => ({
                value: unit,
                label: unit,
              }))}
            />
          </div>

          {canEditPrice && (
            <div className="rounded-lg border border-amber-100 bg-amber-50 p-2">
              <div className="mb-1 flex items-center justify-between gap-2 text-xs text-amber-800">
                <span>Harga manual</span>
                {isPriceEdited && (
                  <button
                    type="button"
                    onClick={() => updateCustomPrice(item.product.id, undefined)}
                    className="font-semibold text-amber-700 hover:text-amber-900"
                  >
                    Reset
                  </button>
                )}
              </div>
              <InputNumber
                inputMode="numeric"
                min={0}
                value={item.custom_price ?? originalPrice}
                onChange={handleCustomPriceChange}
                className="w-full"
                size="large"
                controls={false}
                prefix="Rp"
              />
              {isPriceEdited && (
                <p className="mt-1 text-xs text-amber-700">
                  Harga awal Rp {formatCurrency(originalPrice)}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
