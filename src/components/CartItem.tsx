import { Minus, Plus, Trash2 } from 'lucide-react';
import { CartItem as CartItemType } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { getPrice } from '@/utils/pricing';
import { InputNumber, Select } from 'antd';

interface CartItemProps {
  item: CartItemType;
  updateQuantity: (id: string, quantity: number) => void;
  updateUnit: (id: string, unit: string) => void;
  removeFromCart: (id: string) => void;
}

export default function CartItem({ item, updateQuantity, updateUnit, removeFromCart }: CartItemProps) {
  const currentPrice = getPrice(item.product, item.quantity, item.unit);
  const isWholesale = currentPrice < getPrice(item.product, 1, item.unit);

  // Get available sellable units for this product
  const sellableUnits = item.product.sellable_units || [item.product.selling_unit || 'pcs'];

  const handleQuantityChange = (val: number | null) => {
    if (val !== null) {
      updateQuantity(item.product.id, val);
    }
  };

  const handleUnitChange = (newUnit: string) => {
    updateUnit(item.product.id, newUnit);
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
            {isWholesale && (
              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">Grosir</span>
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
          Total: Rp {formatCurrency(currentPrice * item.quantity)}
        </p>
        
        {/* Quantity Controls and Unit Selector - Mobile First Layout */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* Quantity Controls */}
          <div className="flex items-center gap-2 flex-1">
            <button
              onClick={() => updateQuantity(item.product.id, item.quantity - (['gram', 'menit'].includes(item.unit.toLowerCase()) ? 10 : 1))}
              className="p-1.5 bg-gray-300 hover:bg-gray-400 rounded transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Kurangi"
            >
              <Minus size={16} />
            </button>
            
            <InputNumber
              min={0}
              value={item.quantity}
              onChange={handleQuantityChange}
              className="flex-1"
              size="large"
              controls={false}
            />

            <button
              onClick={() => updateQuantity(item.product.id, item.quantity + (['gram', 'menit'].includes(item.unit.toLowerCase()) ? 10 : 1))}
              className="p-1.5 bg-gray-300 hover:bg-gray-400 rounded transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Tambah"
            >
              <Plus size={16} />
            </button>
          </div>

          {/* Unit Selector - Mobile Full Width, then Inline */}
          <div className="w-full sm:w-auto sm:min-w-[100px]">
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
        </div>
      </div>
    </div>
  );
}
