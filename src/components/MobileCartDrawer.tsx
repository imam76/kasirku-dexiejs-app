import { X, Trash2 } from 'lucide-react';
import { CartItem as CartItemType, PaymentMethod } from '@/types';
import CartItem from './CartItem';
import CartSummary from './CartSummary';

interface MobileCartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
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

export default function MobileCartDrawer({
  isOpen,
  onClose,
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
}: MobileCartDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div
        className="absolute inset-0 bg-black bg-opacity-40"
        onClick={onClose}
      />
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-gray-800">Keranjang</h3>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-red-500 hover:text-red-700 text-xs font-medium transition-colors flex items-center gap-1 bg-red-50 px-2 py-1 rounded"
              >
                <Trash2 size={12} />
                Bersihkan
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
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
          <div className="px-5 pt-4 pb-8 border-t border-gray-100">
            <CartSummary
              total={total}
              showPayment={showPayment}
              paymentAmount={paymentAmount}
              paymentMethod={paymentMethod}
              setShowPayment={setShowPayment}
              setPaymentAmount={setPaymentAmount}
              setPaymentMethod={setPaymentMethod}
              handleCheckout={() => {
                handleCheckout();
                onClose();
              }}
              onCancel={() => setShowPayment(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
