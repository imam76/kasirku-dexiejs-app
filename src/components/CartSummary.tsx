import type { Contact, MembershipSetting } from '@/types';
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
    <>
      <div className="mb-4 border-t pt-4">
        <MembershipCheckoutPanel
          members={props.activeMembers}
          selectedMember={props.selectedMember}
          memberContactId={props.memberContactId}
          voucherCode={props.voucherCode}
          redeemPoints={props.redeemPoints}
          membershipSetting={props.membershipSetting}
          promoPreview={props.promoPreview}
          membershipPreview={props.membershipPreview}
          onMemberChange={props.setMemberContactId}
          onVoucherCodeChange={props.setVoucherCode}
          onRedeemPointsChange={props.setRedeemPoints}
          onCreateMember={props.createMember}
          isCreatingMember={props.isCreatingMember}
        />
        <div className="flex justify-between text-xl font-bold text-gray-800">
          <span>{t('cart.total')}:</span><span>Rp {formatCurrency(props.total)}</span>
        </div>
      </div>
      {!props.showPayment ? (
        <button onClick={() => props.setShowPayment(true)} className="mb-6 flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-3 font-semibold text-white">
          <DollarSign size={20} /> {t('payment.pay')}
        </button>
      ) : (
        <PosSplitPaymentEditor
          total={props.total}
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
    </>
  );
}
