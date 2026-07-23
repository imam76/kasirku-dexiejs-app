import { ShoppingBag, Trash2 } from 'lucide-react';
import { CartItem as CartItemType, Contact, MembershipSetting, Promo } from '@/types';
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
  activePromos: Promo[];
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
  activePromos,
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
        className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm"
        data-tour="transaction-desktop-cart"
        data-pos-cart-target
      >
        <div className="flex items-center justify-between gap-3 border-b border-blue-50 p-3">
          <h3 className="text-lg font-black text-slate-900">{t('cart.title')}</h3>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={clearCart}
              className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-red-500 transition-colors hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 size={14} />
              {t('cart.clear')}
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
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
            <div className="grid min-h-64 place-items-center text-center">
              <div>
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-300"><ShoppingBag size={24} /></span>
                <p className="mt-3 text-sm font-semibold text-slate-500">{t('cart.empty')}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {cart.length > 0 && (
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
          <div className="shrink-0 border-b border-blue-50 p-3">
            <h3 className="text-lg font-bold text-gray-900">{t('payment.pay')}</h3>
          </div>
          <div className={`min-h-0 flex-1 overflow-y-auto px-3 pt-3 ${showPayment ? 'pb-0' : 'pb-3'}`}>
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
              activePromos={activePromos}
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
        </div>
      )}
    </div>
  );
}
