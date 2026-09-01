import { Button, Drawer } from 'antd';
import { DollarSign, Trash2 } from 'lucide-react';
import { CartItem as CartItemType, Membership, MembershipSetting, Promo } from '@/types';
import type { PosPaymentMethodOption } from '@/hooks/usePosPaymentMethods';
import type { PromoEvaluationResult } from '@/services/promoService';
import type { MembershipCheckoutEvaluation, QuickCreateMemberInput } from '@/services/membershipService';
import CartItem from './CartItem';
import CartSummary from './CartSummary';
import { useI18n } from '@/hooks/useI18n';
import type { PosPaymentDraft } from '@/store/transactionStore';
import type { PosPaymentAllocationResult } from '@/utils/posSplitPayment';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { formatCurrency } from '@/utils/formatters';

const TABLET_VIEWPORT_QUERY = '(min-width: 1024px) and (max-width: 1279.98px)';

interface MobileCartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItemType[];
  updateQuantity: (id: string, quantity: number) => void;
  updateUnit: (id: string, unit: string) => boolean;
  removeFromCart: (id: string) => void;
  onEditProduct?: (item: CartItemType) => void;
  activeCartItemId?: string;
  onActivateCartItem: (id: string) => void;
  clearCart: () => void;
  total: number;
  showPayment: boolean;
  paymentDrafts: PosPaymentDraft[];
  paymentPreview: PosPaymentAllocationResult;
  paymentMethods: PosPaymentMethodOption[];
  voucherCode: string;
  memberId?: string;
  redeemPoints: string;
  promoPreview: PromoEvaluationResult;
  membershipPreview: MembershipCheckoutEvaluation;
  activePromos: Promo[];
  activeMembers: Membership[];
  selectedMember: Membership | null;
  membershipSetting: MembershipSetting;
  setShowPayment: (show: boolean) => void;
  updatePaymentDraft: (clientId: string, patch: Partial<PosPaymentDraft>) => void;
  removePaymentDraft: (clientId: string) => void;
  handleAddPayment: () => void;
  setVoucherCode: (voucherCode: string) => void;
  setMemberId: (memberId?: string) => void;
  setRedeemPoints: (points: string) => void;
  createMember: (input: QuickCreateMemberInput) => Promise<Membership>;
  isCreatingMember: boolean;
  handleCheckout: () => Promise<boolean>;
  handleRecordExpense: () => Promise<boolean>;
}

export default function MobileCartDrawer({
  isOpen,
  onClose,
  cart,
  updateQuantity,
  updateUnit,
  removeFromCart,
  onEditProduct,
  activeCartItemId,
  onActivateCartItem,
  clearCart,
  total,
  showPayment,
  paymentDrafts,
  paymentPreview,
  paymentMethods,
  voucherCode,
  memberId,
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
  setMemberId,
  setRedeemPoints,
  createMember,
  isCreatingMember,
  handleCheckout,
  handleRecordExpense,
}: MobileCartDrawerProps) {
  const { t } = useI18n();
  const isTabletViewport = useMediaQuery(TABLET_VIEWPORT_QUERY);
  const showInlinePayment = showPayment && !isTabletViewport;

  return (
    <Drawer
      title={showInlinePayment ? t('payment.pay') : t('cart.title')}
      placement="bottom"
      open={isOpen}
      onClose={onClose}
      size="85vh"
      rootClassName="mobile-bottom-drawer pos-cart-tablet-drawer"
      className="lg:hidden"
      extra={
        cart.length > 0 && !showInlinePayment ? (
          <Button
            danger
            size="small"
            type="text"
            icon={<Trash2 size={12} />}
            onClick={clearCart}
            className="bg-red-50 text-xs font-medium"
          >
            {t('cart.clear')}
          </Button>
        ) : null
      }
      styles={{
        body: { padding: 0, overflow: 'hidden' },
        header: { padding: '16px 20px' },
      }}
    >
      <div className={`flex h-full min-h-0 flex-col ${showInlinePayment
        ? ''
        : 'min-[1024px]:grid min-[1024px]:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]'}`}
      >
        <section className={`${showInlinePayment ? 'hidden' : 'flex'} min-h-0 flex-1 flex-col bg-slate-50/70`}>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-3" data-testid="pos-cart-items-scroll-panel">
            {cart.length === 0 ? (
              <p className="py-8 text-center text-gray-500">{t('cart.empty')}</p>
            ) : null}

            {cart.map((item) => (
              <CartItem
                key={item.product.id}
                item={item}
                variant="mobile"
                updateQuantity={updateQuantity}
                updateUnit={updateUnit}
                removeFromCart={removeFromCart}
                onEditProduct={onEditProduct}
                isActive={item.product.id === activeCartItemId}
                onActivate={() => onActivateCartItem(item.product.id)}
              />
            ))}
          </div>
        </section>

        {cart.length > 0 && (
          <div className={`${showInlinePayment
            ? 'min-h-0 flex-1 overflow-y-auto px-3 pb-0 pt-4 min-[1024px]:overflow-hidden min-[1024px]:pt-0'
            : 'border-t border-blue-100 px-4 pb-8 pt-4 min-[1024px]:overflow-hidden min-[1024px]:pb-0 min-[1024px]:pt-3'} bg-white min-[1024px]:h-full min-[1024px]:min-h-0 min-[1024px]:overscroll-contain min-[1024px]:border-l min-[1024px]:border-t-0 min-[1024px]:px-3`}
          >
            {isTabletViewport && !showInlinePayment ? (
              <div className="flex flex-col gap-3" data-testid="pos-tablet-cart-summary-only">
                <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{t('cart.total')}</p>
                  <p className="mt-1 text-right text-2xl font-black tabular-nums text-slate-950">
                    Rp {formatCurrency(total)}
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="pos-tablet-pay-action"
                  onClick={() => setShowPayment(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-base font-bold text-white shadow-md shadow-blue-200/60 transition-colors hover:bg-blue-700"
                >
                  <DollarSign size={20} /> {t('payment.pay')} Rp {formatCurrency(total)}
                </button>
              </div>
            ) : (
              <CartSummary
                total={total}
                showPayment={showInlinePayment}
                paymentDrafts={paymentDrafts}
                paymentPreview={paymentPreview}
                paymentMethods={paymentMethods}
                voucherCode={voucherCode}
                memberId={memberId}
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
                setMemberId={setMemberId}
                setRedeemPoints={setRedeemPoints}
                createMember={createMember}
                isCreatingMember={isCreatingMember}
                handleCheckout={async () => {
                  const success = await handleCheckout();
                  if (success) onClose();
                  return success;
                }}
                handleRecordExpense={async () => {
                  const success = await handleRecordExpense();
                  if (success) onClose();
                  return success;
                }}
                onCancel={() => setShowPayment(false)}
                compactCheckoutDetailsOnTablet
                stickyPayButtonOnTablet
              />
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}
