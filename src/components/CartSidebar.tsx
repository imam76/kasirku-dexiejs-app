import { Trash2 } from 'lucide-react';
import { CartItem as CartItemType, Contact, MembershipSetting } from '@/types';
import type { PosPaymentMethodOption } from '@/hooks/usePosPaymentMethods';
import type { PromoEvaluationResult } from '@/services/promoService';
import type { MembershipCheckoutEvaluation, QuickCreateMemberInput } from '@/services/membershipService';
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
  paymentMethods: PosPaymentMethodOption[];
  paymentMethodId?: string;
  paymentReference: string;
  voucherCode: string;
  memberContactId?: string;
  redeemPoints: string;
  promoPreview: PromoEvaluationResult;
  membershipPreview: MembershipCheckoutEvaluation;
  activeMembers: Contact[];
  selectedMember: Contact | null;
  membershipSetting: MembershipSetting;
  setShowPayment: (show: boolean) => void;
  setPaymentAmount: (amount: string) => void;
  setPaymentMethodId: (id?: string) => void;
  setPaymentReference: (reference: string) => void;
  setVoucherCode: (voucherCode: string) => void;
  setMemberContactId: (memberContactId?: string) => void;
  setRedeemPoints: (points: string) => void;
  createMember: (input: QuickCreateMemberInput) => Promise<Contact>;
  isCreatingMember: boolean;
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
  paymentMethods,
  paymentMethodId,
  paymentReference,
  voucherCode,
  memberContactId,
  redeemPoints,
  promoPreview,
  membershipPreview,
  activeMembers,
  selectedMember,
  membershipSetting,
  setShowPayment,
  setPaymentAmount,
  setPaymentMethodId,
  setPaymentReference,
  setVoucherCode,
  setMemberContactId,
  setRedeemPoints,
  createMember,
  isCreatingMember,
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
            paymentMethods={paymentMethods}
            paymentMethodId={paymentMethodId}
            paymentReference={paymentReference}
            voucherCode={voucherCode}
            memberContactId={memberContactId}
            redeemPoints={redeemPoints}
            promoPreview={promoPreview}
            membershipPreview={membershipPreview}
            activeMembers={activeMembers}
            selectedMember={selectedMember}
            membershipSetting={membershipSetting}
            setShowPayment={setShowPayment}
            setPaymentAmount={setPaymentAmount}
            setPaymentMethodId={setPaymentMethodId}
            setPaymentReference={setPaymentReference}
            setVoucherCode={setVoucherCode}
            setMemberContactId={setMemberContactId}
            setRedeemPoints={setRedeemPoints}
            createMember={createMember}
            isCreatingMember={isCreatingMember}
            handleCheckout={handleCheckout}
          />
        </div>
      )}
    </div>
  );
}
