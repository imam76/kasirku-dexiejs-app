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
import { calculatePosDiscountTotal, isAppliedPosVoucher } from '@/utils/posVoucher';

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
  compactCheckoutDetailsOnTablet?: boolean;
  stickyPayButtonOnTablet?: boolean;
}

export default function CartSummary(props: CartSummaryProps) {
  const { t } = useI18n();
  const hasMemberOrVoucher = Boolean(props.memberContactId || props.voucherCode.trim());
  const subtotal = props.promoPreview.subtotal_before_discount;
  const discountAmount = Math.max(0, subtotal - props.total);
  const hasValidVoucher = isAppliedPosVoucher(props.voucherCode, props.promoPreview.applied_promos_snapshot);
  const showCompactTabletDetails = props.showPayment && props.compactCheckoutDetailsOnTablet;
  const useStickyTabletPayButton = !props.showPayment && props.stickyPayButtonOnTablet;

  const membershipPanel = (
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
  );

  const compactTabletDetails = (
    <div
      data-testid="pos-tablet-payment-checkout-details"
      className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-3 min-[1024px]:mt-3 min-[1024px]:grid lg:hidden"
    >
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Member</div>
        <div className="truncate text-sm font-bold text-slate-900" title={props.selectedMember?.name ?? '-'}>
          {props.selectedMember?.name ?? '-'}
        </div>
      </div>
      <div className="min-w-0 border-l border-blue-100 pl-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Voucher</div>
        <div className="truncate text-sm font-bold text-slate-900" title={props.voucherCode.trim() || '-'}>
          {props.voucherCode.trim() || '-'}
        </div>
      </div>
      <button
        type="button"
        data-testid="pos-tablet-edit-checkout-details"
        onClick={() => props.setShowPayment(false)}
        className="shrink-0 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-blue-700 transition-colors hover:bg-blue-100"
      >
        Ubah
      </button>
    </div>
  );

  const totalCard = (
    <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-4 shadow-sm">
      {hasMemberOrVoucher && (
        <div className="space-y-2 border-b border-blue-100 pb-3 text-sm">
          {!hasValidVoucher && (
            <div className="flex items-center justify-between gap-3 text-slate-600">
              <span>{t('cart.subtotal')}</span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-800">Rp {formatCurrency(subtotal)}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 text-blue-700">
            <span>{t('cart.discount')}</span>
            <span className="shrink-0 font-semibold tabular-nums">-Rp {formatCurrency(discountAmount)}</span>
          </div>
        </div>
      )}
      <div className={`${hasMemberOrVoucher ? 'mt-3' : ''} text-xs font-semibold uppercase tracking-wide text-blue-700`}>
        {t('cart.total')}
      </div>
      <div className="mt-1 text-right text-xl font-bold tabular-nums text-gray-950 min-[1200px]:text-2xl 2xl:text-3xl">
        Rp {formatCurrency(props.total)}
      </div>
    </div>
  );

  const payButton = (
    <button
      type="button"
      onClick={() => props.setShowPayment(true)}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-base font-bold text-white shadow-md shadow-blue-200/60 transition-colors hover:bg-blue-700"
    >
      <DollarSign size={20} /> {t('payment.pay')} Rp {formatCurrency(props.total)}
    </button>
  );

  return (
    <div className={`flex min-h-full flex-col gap-4 ${useStickyTabletPayButton ? 'min-[1024px]:gap-0 lg:gap-4' : ''} ${props.showPayment || useStickyTabletPayButton
      ? 'min-[1024px]:h-full min-[1024px]:min-h-0 lg:h-auto lg:min-h-full'
      : ''}`}
    >
      {!props.showPayment ? (
        useStickyTabletPayButton ? (
          <>
            <div className="space-y-4 min-[1024px]:min-h-0 min-[1024px]:flex-1 min-[1024px]:overflow-y-auto min-[1024px]:overscroll-contain min-[1024px]:pb-3 min-[1024px]:pr-1 lg:overflow-visible lg:p-0">
              {membershipPanel}
              {totalCard}
            </div>
            <div
              data-testid="pos-tablet-pay-action"
              className="-mt-1 min-[1024px]:-mx-3 min-[1024px]:mt-0 min-[1024px]:shrink-0 min-[1024px]:border-t min-[1024px]:border-gray-200 min-[1024px]:bg-white min-[1024px]:px-3 min-[1024px]:pb-3 min-[1024px]:pt-3 min-[1024px]:shadow-[0_-8px_18px_-14px_rgba(15,23,42,0.45)]"
            >
              {payButton}
            </div>
          </>
        ) : (
          <>
            {membershipPanel}
            <div className="space-y-3">
              {totalCard}
              {payButton}
            </div>
          </>
        )
      ) : (
        <>
          {showCompactTabletDetails ? (
            <div className="min-[1024px]:hidden lg:block">
              {membershipPanel}
            </div>
          ) : membershipPanel}
          <PosSplitPaymentEditor
            total={props.total}
            discountAmount={calculatePosDiscountTotal(props.membershipPreview.discount_breakdown)}
            drafts={props.paymentDrafts}
            methods={props.paymentMethods}
            preview={props.paymentPreview}
            scrollHeader={showCompactTabletDetails ? compactTabletDetails : undefined}
            onAdd={props.handleAddPayment}
            onUpdate={props.updatePaymentDraft}
            onRemove={props.removePaymentDraft}
            onConfirm={props.handleCheckout}
            onCancel={() => { props.setShowPayment(false); props.onCancel?.(); }}
          />
        </>
      )}
    </div>
  );
}
