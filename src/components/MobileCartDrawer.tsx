import { Button, Drawer } from 'antd';
import { Trash2 } from 'lucide-react';
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
  return (
    <Drawer
      title="Keranjang"
      placement="bottom"
      open={isOpen}
      onClose={onClose}
      height="85vh"
      rootClassName="mobile-bottom-drawer"
      className="lg:hidden"
      extra={
        cart.length > 0 ? (
          <Button
            danger
            size="small"
            type="text"
            icon={<Trash2 size={12} />}
            onClick={clearCart}
            className="bg-red-50 text-xs font-medium"
          >
            Bersihkan
          </Button>
        ) : null
      }
      styles={{
        body: { padding: 0 },
        header: { padding: '16px 20px' },
      }}
    >
      <div className="flex h-full flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-3">
          {cart.length === 0 ? (
            <p className="py-8 text-center text-gray-500">Keranjang kosong</p>
          ) : null}

          {cart.map((item) => (
            <CartItem
              key={item.product.id}
              item={item}
              updateQuantity={updateQuantity}
              updateUnit={updateUnit}
              removeFromCart={removeFromCart}
            />
          ))}
        </div>

        {cart.length > 0 && (
          <div className="border-t border-gray-100 px-5 pb-8 pt-4">
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
    </Drawer>
  );
}
