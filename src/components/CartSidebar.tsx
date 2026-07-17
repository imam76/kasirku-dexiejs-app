import { Trash2 } from 'lucide-react';
import { CartItem as CartItemType, Contact, MembershipSetting } from '@/types';
import type { PosPaymentMethodOption } from '@/hooks/usePosPaymentMethods';
import type { PromoEvaluationResult } from '@/services/promoService';
import type { MembershipCheckoutEvaluation, QuickCreateMemberInput } from '@/services/membershipService';
import CartItem from './CartItem';
import CartSummary from './CartSummary';
import { useI18n } from '@/hooks/useI18n';
import type { PosPaymentDraft } from '@/store/transactionStore';
import type { PosPaymentAllocationResult } from '@/utils/posSplitPayment';

interface CartSidebarProps {
  cart: CartItemType[];
  updateQuantity: (id: string, quantity: number) => void;
  updateUnit: (id: string, unit: string) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  total: number;
  showPayment: boolean;
  paymentDrafts: PosPaymentDraft[];
  paymentPreview: PosPaymentAllocationResult;
  paymentMethods: PosPaymentMethodOption[];
  voucherCode: string;
  memberContactId?: string;
  redeemPoints: string;
  promoPreview: PromoEvaluationResult;
  membershipPreview: MembershipCheckoutEvaluation;
  activeMembers: Contact[];
  selectedMember: Contact | null;
  membershipSetting: MembershipSetting;
  setShowPayment: (show: boolean) => void;
  updatePaymentDraft: (clientId: string, patch: Partial<PosPaymentDraft>) => void;
  removePaymentDraft: (clientId: string) => void;
  handleAddPayment: () => void;
  setVoucherCode: (voucherCode: string) => void;
  setMemberContactId: (memberContactId?: string) => void;
  setRedeemPoints: (points: string) => void;
  createMember: (input: QuickCreateMemberInput) => Promise<Contact>;
  isCreatingMember: boolean;
  handleCheckout: () => Promise<boolean>;
}

export default function CartSidebar({
  cart,
  updateQuantity,
  updateUnit,
  removeFromCart,
  clearCart,
  total,
  showPayment,
  paymentDrafts,
  paymentPreview,
  paymentMethods,
  voucherCode,
  memberContactId,
  redeemPoints,
  promoPreview,
  membershipPreview,
  activeMembers,
  selectedMember,
  membershipSetting,
  setShowPayment,
  updatePaymentDraft,
  removePaymentDraft,
  handleAddPayment,
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
        <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white p-4 shadow-md">
          <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3">
            <h3 className="text-lg font-bold text-gray-900">{t('payment.pay')}</h3>
            <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">POS</span>
          </div>
          <CartSummary
            total={total}
            showPayment={showPayment}
            paymentDrafts={paymentDrafts}
            paymentPreview={paymentPreview}
            paymentMethods={paymentMethods}
            voucherCode={voucherCode}
            memberContactId={memberContactId}
            redeemPoints={redeemPoints}
            promoPreview={promoPreview}
            membershipPreview={membershipPreview}
            activeMembers={activeMembers}
            selectedMember={selectedMember}
            membershipSetting={membershipSetting}
            setShowPayment={setShowPayment}
            updatePaymentDraft={updatePaymentDraft}
            removePaymentDraft={removePaymentDraft}
            handleAddPayment={handleAddPayment}
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
