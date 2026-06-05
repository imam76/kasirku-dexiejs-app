import { Trash2 } from 'lucide-react';
import { CartItem as CartItemType, PaymentMethod } from '@/types';
import type { PromoEvaluationResult } from '@/services/promoService';
import CartItem from './CartItem';
import CartSummary from './CartSummary';
import { useI18n } from '@/hooks/useI18n';

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
  voucherCode: string;
  promoPreview: PromoEvaluationResult;
  setShowPayment: (show: boolean) => void;
  setPaymentAmount: (amount: string) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setVoucherCode: (voucherCode: string) => void;
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
  voucherCode,
  promoPreview,
  setShowPayment,
  setPaymentAmount,
  setPaymentMethod,
  setVoucherCode,
  handleCheckout,
}: CartSidebarProps) {
  const { t } = useI18n();

  return (
    <div className="hidden lg:contents">
      <div
        className="sticky top-6 flex max-h-[calc(100vh-3rem)] min-h-[24rem] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white p-4 shadow-md"
        data-tour="transaction-desktop-cart"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-gray-800">{t('cart.title')}</h3>
          {cart.length > 0 && (
            <button
              onClick={clearCart}
              className="flex shrink-0 items-center gap-1 text-sm font-medium text-red-500 transition-colors hover:text-red-700"
            >
              <Trash2 size={14} />
              {t('cart.clear')}
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
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
            <p className="text-center text-gray-500 py-8">{t('cart.empty')}</p>
          )}
        </div>
      </div>

      {cart.length > 0 && (
        <div className="sticky top-6 h-fit rounded-lg border border-gray-200 bg-white p-4 shadow-md">
          <h3 className="mb-4 text-lg font-semibold text-gray-800">{t('payment.pay')}</h3>
          <CartSummary
            total={total}
            showPayment={showPayment}
            paymentAmount={paymentAmount}
            paymentMethod={paymentMethod}
            voucherCode={voucherCode}
            promoPreview={promoPreview}
            setShowPayment={setShowPayment}
            setPaymentAmount={setPaymentAmount}
            setPaymentMethod={setPaymentMethod}
            setVoucherCode={setVoucherCode}
            handleCheckout={handleCheckout}
          />
        </div>
      )}
    </div>
  );
}
