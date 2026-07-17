import { Button, Drawer } from 'antd';
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
}: MobileCartDrawerProps) {
  const { t } = useI18n();

  return (
    <Drawer
      title={showPayment ? t('payment.pay') : t('cart.title')}
      placement="bottom"
      open={isOpen}
      onClose={onClose}
      size="85vh"
      rootClassName="mobile-bottom-drawer"
      className="lg:hidden"
      extra={
        cart.length > 0 && !showPayment ? (
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
        body: { padding: 0 },
        header: { padding: '16px 20px' },
      }}
    >
      <div className="flex h-full flex-col">
        <div className={`${showPayment ? 'hidden' : 'flex-1'} space-y-3 overflow-y-auto px-5 py-3`}>
          {cart.length === 0 ? (
            <p className="py-8 text-center text-gray-500">{t('cart.empty')}</p>
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
          <div className={`${showPayment ? 'min-h-0 flex-1 overflow-y-auto' : ''} border-t border-gray-100 px-5 pb-8 pt-4`}>
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
              handleCheckout={async () => {
                const success = await handleCheckout();
                if (success) onClose();
                return success;
              }}
              onCancel={() => setShowPayment(false)}
            />
          </div>
        )}
      </div>
    </Drawer>
  );
}
