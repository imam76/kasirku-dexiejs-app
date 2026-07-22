import type { Contact, MembershipSetting, Promo } from '@/types';
import type { PosPaymentMethodOption } from '@/hooks/usePosPaymentMethods';
import type { PromoEvaluationResult } from '@/services/promoService';
import type { MembershipCheckoutEvaluation, QuickCreateMemberInput } from '@/services/membershipService';
import type { PosPaymentDraft } from '@/store/transactionStore';
import type { PosPaymentAllocationResult } from '@/utils/posSplitPayment';
import { formatCurrency } from '@/utils/formatters';
import { DollarSign } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import MembershipCheckoutPanel from './MembershipCheckoutPanel';
import PosSplitPaymentEditor from './pos-payment/PosSplitPaymentEditor';
import { calculatePosDiscountTotal } from '@/utils/posVoucher';

export interface CartSummaryProps {
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
  onCancel?: () => void;
}

export default function CartSummary(props: CartSummaryProps) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-full flex-col gap-4">
      <MembershipCheckoutPanel
        members={props.activeMembers}
        selectedMember={props.selectedMember}
        memberContactId={props.memberContactId}
        voucherCode={props.voucherCode}
        redeemPoints={props.redeemPoints}
        membershipSetting={props.membershipSetting}
        promoPreview={props.promoPreview}
        membershipPreview={props.membershipPreview}
        voucherPromos={props.activePromos}
        onMemberChange={props.setMemberContactId}
        onVoucherCodeChange={props.setVoucherCode}
        onRedeemPointsChange={props.setRedeemPoints}
        onCreateMember={props.createMember}
        isCreatingMember={props.isCreatingMember}
      />
      {!props.showPayment ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">{t('cart.total')}</div>
            <div className="mt-1 text-right text-3xl font-bold tabular-nums text-gray-950">
              Rp {formatCurrency(props.total)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => props.setShowPayment(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-base font-bold text-white shadow-md shadow-blue-200/60 transition-colors hover:bg-blue-700"
          >
            <DollarSign size={20} /> {t('payment.pay')}
          </button>
        </div>
      ) : (
        <PosSplitPaymentEditor
          total={props.total}
          discountAmount={calculatePosDiscountTotal(props.membershipPreview.discount_breakdown)}
          drafts={props.paymentDrafts}
          methods={props.paymentMethods}
          preview={props.paymentPreview}
          onAdd={props.handleAddPayment}
          onUpdate={props.updatePaymentDraft}
          onRemove={props.removePaymentDraft}
          onConfirm={props.handleCheckout}
          onCancel={() => { props.setShowPayment(false); props.onCancel?.(); }}
        />
      )}
    </div>
  );
}
