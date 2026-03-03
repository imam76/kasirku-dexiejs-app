import { Minus, Plus, Trash2 } from 'lucide-react';
import { CartItem as CartItemType } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { getPrice } from '@/utils/pricing';

interface CartItemProps {
  item: CartItemType;
  updateQuantity: (id: string, quantity: number) => void;
  removeFromCart: (id: string) => void;
}

export default function CartItem({ item, updateQuantity, removeFromCart }: CartItemProps) {
  const currentPrice = getPrice(item.product, item.quantity);
  const isWholesale = currentPrice < item.product.selling_price;

  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
      <div className="flex-1">
        <p className="font-medium text-gray-800">{item.product.name}</p>
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-600">
            Rp {formatCurrency(currentPrice)}
          </p>
          {isWholesale && (
            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">Grosir</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
          className="p-1 bg-gray-300 hover:bg-gray-400 rounded transition-colors"
        >
          <Minus size={16} />
        </button>
        <span className="w-8 text-center font-semibold">{item.quantity}</span>
        <button
          onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
          className="p-1 bg-gray-300 hover:bg-gray-400 rounded transition-colors"
        >
          <Plus size={16} />
        </button>
        <button
          onClick={() => removeFromCart(item.product.id)}
          className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors ml-2"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
