import { DollarSign, ShoppingBag, Trash2 } from 'lucide-react';
import { CartItem as CartItemType, Contact, MembershipSetting, Promo } from '@/types';
import type { PosPaymentMethodOption } from '@/hooks/usePosPaymentMethods';
import type { PromoEvaluationResult } from '@/services/promoService';
import type { MembershipCheckoutEvaluation, QuickCreateMemberInput } from '@/services/membershipService';
import CartItem from './CartItem';
import PosPaymentModal from './pos-payment/PosPaymentModal';
import { useI18n } from '@/hooks/useI18n';
import type { PosPaymentDraft } from '@/store/transactionStore';
import type { PosPaymentAllocationResult } from '@/utils/posSplitPayment';
import { formatCurrency } from '@/utils/formatters';

interface CartSidebarProps {
  cart: CartItemType[];
  updateQuantity: (id: string, quantity: number) => void;
  updateUnit: (id: string, unit: string) => boolean;
  removeFromCart: (id: string) => void;
  onEditProduct?: (item: CartItemType) => void;
  activeCartItemId?: string;
  onActivateCartItem: (id: string) => void;
  registerQuantityInput: (id: string, element: HTMLInputElement | null) => void;
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
  handleRecordExpense: () => Promise<boolean>;
  onCheckoutSuccess?: () => void;
}

export default function CartSidebar({
  cart,
  updateQuantity,
  updateUnit,
  removeFromCart,
  onEditProduct,
  activeCartItemId,
  onActivateCartItem,
  registerQuantityInput,
  clearCart,
  total,
  showPayment,
  paymentDrafts,
  paymentPreview,
  paymentMethods,
  voucherCode,
  memberContactId,
  promoPreview,
  membershipPreview,
  activePromos,
  activeMembers,
  setShowPayment,
  updatePaymentDraft,
  removePaymentDraft,
  handleAddPayment,
  setVoucherCode,
  setMemberContactId,
  handleCheckout,
  handleRecordExpense,
  onCheckoutSuccess,
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

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3" data-testid="pos-desktop-cart-items-scroll-panel">
          {cart.map((item) => (
            <CartItem
              key={item.product.id}
              item={item}
              variant="desktop"
              updateQuantity={updateQuantity}
              updateUnit={updateUnit}
              removeFromCart={removeFromCart}
              onEditProduct={onEditProduct}
              isActive={item.product.id === activeCartItemId}
              onActivate={() => onActivateCartItem(item.product.id)}
              quantityInputRef={(element) => registerQuantityInput(item.product.id, element)}
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

        {cart.length > 0 && (
          <div className="shrink-0 border-t border-blue-100 bg-white p-3 shadow-[0_-8px_18px_-14px_rgba(15,23,42,0.35)]">
            <div className="mb-3 flex items-end justify-between gap-3 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{t('cart.total')}</p>
                <p className="mt-1 text-xs font-medium text-slate-500">{cart.length} item belanja</p>
              </div>
              <p className="text-right text-2xl font-black tabular-nums text-slate-950">
                Rp {formatCurrency(total)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPayment(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-base font-bold text-white shadow-md shadow-blue-200/60 transition-colors hover:bg-blue-700"
            >
              <DollarSign size={20} /> {t('payment.pay')} Rp {formatCurrency(total)}
            </button>
          </div>
        )}
      </div>

      <PosPaymentModal
        open={showPayment && cart.length > 0}
        total={total}
        paymentDrafts={paymentDrafts}
        paymentPreview={paymentPreview}
        paymentMethods={paymentMethods}
        voucherCode={voucherCode}
        memberContactId={memberContactId}
        activePromos={activePromos}
        activeMembers={activeMembers}
        promoPreview={promoPreview}
        membershipPreview={membershipPreview}
        onVoucherCodeChange={setVoucherCode}
        onMemberChange={setMemberContactId}
        onAddPayment={handleAddPayment}
        onUpdatePayment={updatePaymentDraft}
        onRemovePayment={removePaymentDraft}
        onConfirm={async () => {
          const success = await handleCheckout();
          if (success) onCheckoutSuccess?.();
          return success;
        }}
        onRecordExpense={handleRecordExpense}
        onClose={() => setShowPayment(false)}
      />
    </div>
  );
}
