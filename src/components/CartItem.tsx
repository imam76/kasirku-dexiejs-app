import { Minus, Plus, Trash2 } from 'lucide-react';
import { CartItem as CartItemType } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { getPrice } from '@/utils/pricing';
import { InputNumber } from 'antd';

interface CartItemProps {
  item: CartItemType;
  updateQuantity: (id: string, quantity: number) => void;
  removeFromCart: (id: string) => void;
}

export default function CartItem({ item, updateQuantity, removeFromCart }: CartItemProps) {
  const currentPrice = getPrice(item.product, item.quantity, item.unit);
  const isWholesale = currentPrice < getPrice(item.product, 1, item.unit);

  const handleQuantityChange = (val: number | null) => {
    if (val !== null) {
      updateQuantity(item.product.id, val);
    }
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

      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-gray-700">
          Total: Rp {formatCurrency(currentPrice * item.quantity)}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => updateQuantity(item.product.id, item.quantity - (['gram', 'menit'].includes(item.unit.toLowerCase()) ? 10 : 1))}
            className="p-1 bg-gray-300 hover:bg-gray-400 rounded transition-colors"
          >
            <Minus size={16} />
          </button>
          
          <InputNumber
            min={0}
            value={item.quantity}
            onChange={handleQuantityChange}
            className="w-20"
            size="small"
            controls={false}
          />
          <span className="text-xs text-gray-500">{item.unit}</span>

          <button
            onClick={() => updateQuantity(item.product.id, item.quantity + (['gram', 'menit'].includes(item.unit.toLowerCase()) ? 10 : 1))}
            className="p-1 bg-gray-300 hover:bg-gray-400 rounded transition-colors"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
