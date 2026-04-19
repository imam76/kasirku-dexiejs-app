import { Trash2 } from 'lucide-react';
import { CartItem as CartItemType, PaymentMethod } from '@/types';
import CartItem from './CartItem';
import CartSummary from './CartSummary';

interface CartSidebarProps {
  cart: CartItemType[];
  updateQuantity: (id: string, quantity: number) => void;
  updateUnit: (id: string, unit: string) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  total: number;
  showPayment: boolean;
  paymentAmount: string;
  paymentMethod: PaymentMethod;
  setShowPayment: (show: boolean) => void;
  setPaymentAmount: (amount: string) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  handleCheckout: () => void;
}

export default function CartSidebar({
  cart,
  updateQuantity,
  updateUnit,
  removeFromCart,
  clearCart,
  total,
  showPayment,
  paymentAmount,
  paymentMethod,
  setShowPayment,
  setPaymentAmount,
  setPaymentMethod,
  handleCheckout,
}: CartSidebarProps) {
  return (
    <div className="hidden lg:block lg:col-span-1">
      <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200 sticky top-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Keranjang</h3>
          {cart.length > 0 && (
            <button
              onClick={clearCart}
              className="text-red-500 hover:text-red-700 text-sm font-medium transition-colors flex items-center gap-1"
            >
              <Trash2 size={14} />
              Bersihkan
            </button>
          )}
        </div>

        <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
          {cart.map((item) => (
            <CartItem
              key={item.product.id}
              item={item}
              updateQuantity={updateQuantity}
              updateUnit={updateUnit}
              removeFromCart={removeFromCart}
            />
          ))}
          {cart.length === 0 && (
            <p className="text-center text-gray-500 py-8">Keranjang kosong</p>
          )}
        </div>

        {cart.length > 0 && (
          <CartSummary
            total={total}
            showPayment={showPayment}
            paymentAmount={paymentAmount}
            paymentMethod={paymentMethod}
            setShowPayment={setShowPayment}
            setPaymentAmount={setPaymentAmount}
            setPaymentMethod={setPaymentMethod}
            handleCheckout={handleCheckout}
          />
        )}
      </div>
    </div>
  );
}
